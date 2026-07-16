import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, MoreThanOrEqual, Repository } from 'typeorm';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { CheckInRecord } from '../check-in/entities/check-in-record.entity';
import { SeasonService } from '../partner-token/season.service';
import { Profile } from '../profile/entities/profile.entity';
import {
  RewardEvent,
  RewardEventType,
} from '../rewards/entities/reward-event.entity';
import {
  QualificationState,
  QualificationStatus,
} from './entities/qualification-state.entity';

const REQUIRED_STREAK = 5;
const REQUIRED_XP = 300;
const REQUIRED_ACTIVE_SESSIONS = 4;
const MIN_ACTIVE_SECONDS_FOR_QUALIFICATION_SESSION = 180;

export interface QualificationSnapshot {
  qualificationStatus: QualificationStatus;
  rareRewardAccessActive: boolean;
}

export interface SeasonProgressSnapshot {
  qualificationStatus: QualificationStatus;
  eligibleAtSeasonEnd: boolean;
  streak: number;
  xp: number;
  activeSessions: number;
  requiredStreak: number;
  requiredXp: number;
  requiredActiveSessions: number;
}

@Injectable()
export class QualificationService {
  constructor(
    @InjectRepository(QualificationState)
    private readonly qualificationStateRepository: Repository<QualificationState>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(BubbleSession)
    private readonly bubbleSessionRepository: Repository<BubbleSession>,
    @InjectRepository(RewardEvent)
    private readonly rewardEventRepository: Repository<RewardEvent>,
    @InjectRepository(CheckInRecord)
    private readonly checkInRecordRepository: Repository<CheckInRecord>,
    private readonly seasonService: SeasonService,
  ) {}

  async processAfterDailyCheckIn(
    profileId: string,
    missedDay: boolean,
    seasonId?: string | null,
    entityManager?: EntityManager,
  ): Promise<QualificationSnapshot> {
    const resolvedSeasonId = await this.resolveSeasonId(
      seasonId,
      entityManager,
    );
    if (!resolvedSeasonId) {
      return this.toSnapshot(QualificationStatus.LOCKED);
    }

    const qualificationStateRepository =
      entityManager?.getRepository(QualificationState) ??
      this.qualificationStateRepository;
    let state = await this.getOrCreateState(
      profileId,
      resolvedSeasonId,
      entityManager,
    );

    if (missedDay && this.hasRareRewardAccess(state.status)) {
      state.status = QualificationStatus.PAUSED;
      state.pausedAt = new Date();
      state = await qualificationStateRepository.save(state);
    }

    return this.evaluateProgress(
      profileId,
      resolvedSeasonId,
      state,
      entityManager,
    );
  }

  async evaluateProgress(
    profileId: string,
    seasonId?: string | null,
    existingState?: QualificationState,
    entityManager?: EntityManager,
  ): Promise<QualificationSnapshot> {
    const resolvedSeasonId = await this.resolveSeasonId(
      seasonId,
      entityManager,
    );
    if (!resolvedSeasonId) {
      return this.toSnapshot(QualificationStatus.LOCKED);
    }

    const profileRepository =
      entityManager?.getRepository(Profile) ?? this.profileRepository;
    const qualificationStateRepository =
      entityManager?.getRepository(QualificationState) ??
      this.qualificationStateRepository;
    const profile = await profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      return {
        qualificationStatus: QualificationStatus.LOCKED,
        rareRewardAccessActive: false,
      };
    }

    let state =
      existingState?.seasonId === resolvedSeasonId
        ? existingState
        : await this.getOrCreateState(
            profileId,
            resolvedSeasonId,
            entityManager,
          );

    // Reflect missed daily check-ins even outside check-in mutation flow.
    const missedDailyCheckIn = await this.hasMissedDailyCheckIn(
      profileId,
      entityManager,
    );
    if (missedDailyCheckIn && this.hasRareRewardAccess(state.status)) {
      state.status = QualificationStatus.PAUSED;
      state.pausedAt = new Date();
      state = await qualificationStateRepository.save(state);
    }

    if (state.status === QualificationStatus.PAUSED) {
      const progress = await this.getQualificationProgress(
        profileId,
        resolvedSeasonId,
        state.pausedAt ?? undefined,
        profile.currentStreak,
        entityManager,
      );
      if (this.meetsQualificationThreshold(progress)) {
        state.status = QualificationStatus.RESTORED;
        state.restoredAt = new Date();
        state = await qualificationStateRepository.save(state);
      }
      return this.toSnapshot(state.status);
    }

    if (
      state.status === QualificationStatus.LOCKED ||
      state.status === QualificationStatus.IN_PROGRESS
    ) {
      const progress = await this.getQualificationProgress(
        profileId,
        resolvedSeasonId,
        undefined,
        profile.currentStreak,
        entityManager,
      );
      if (this.meetsQualificationThreshold(progress)) {
        state.status = QualificationStatus.QUALIFIED;
        state.qualifiedAt = new Date();
      } else if (state.status === QualificationStatus.LOCKED) {
        state.status = QualificationStatus.IN_PROGRESS;
      }
      state = await qualificationStateRepository.save(state);
    }

    return this.toSnapshot(state.status);
  }

  async getSeasonProgress(
    profileId: string,
    seasonId?: string | null,
    entityManager?: EntityManager,
  ): Promise<SeasonProgressSnapshot> {
    const resolvedSeasonId = await this.resolveSeasonId(
      seasonId,
      entityManager,
    );
    if (!resolvedSeasonId) {
      return this.emptySeasonProgress();
    }

    const profileRepository =
      entityManager?.getRepository(Profile) ?? this.profileRepository;
    const profile = await profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      return this.emptySeasonProgress();
    }

    const snapshot = await this.evaluateProgress(
      profileId,
      resolvedSeasonId,
      undefined,
      entityManager,
    );
    const progress = await this.getQualificationProgress(
      profileId,
      resolvedSeasonId,
      undefined,
      profile.currentStreak,
      entityManager,
    );

    return {
      qualificationStatus: snapshot.qualificationStatus,
      eligibleAtSeasonEnd: this.meetsQualificationThreshold(progress),
      streak: progress.streak,
      xp: progress.xp,
      activeSessions: progress.activeSessions,
      requiredStreak: REQUIRED_STREAK,
      requiredXp: REQUIRED_XP,
      requiredActiveSessions: REQUIRED_ACTIVE_SESSIONS,
    };
  }

  private async getQualificationProgress(
    profileId: string,
    seasonId: string,
    sinceDate: Date | undefined,
    currentStreak: number,
    entityManager?: EntityManager,
  ): Promise<{ streak: number; xp: number; activeSessions: number }> {
    const xp = await this.getEarnedXp(
      profileId,
      seasonId,
      sinceDate,
      entityManager,
    );
    const bubbleSessionRepository =
      entityManager?.getRepository(BubbleSession) ??
      this.bubbleSessionRepository;
    const activeSessions = await bubbleSessionRepository.count({
      where: {
        profileId,
        seasonId,
        isCompleted: true,
        activeSeconds: MoreThanOrEqual(
          MIN_ACTIVE_SECONDS_FOR_QUALIFICATION_SESSION,
        ),
        ...(sinceDate ? { endedAt: MoreThanOrEqual(sinceDate) } : {}),
      },
    });

    return {
      streak: currentStreak,
      xp,
      activeSessions,
    };
  }

  private async getEarnedXp(
    profileId: string,
    seasonId: string,
    sinceDate?: Date,
    entityManager?: EntityManager,
  ): Promise<number> {
    const rewardEventRepository =
      entityManager?.getRepository(RewardEvent) ?? this.rewardEventRepository;
    const events = await rewardEventRepository.find({
      where: {
        profileId,
        seasonId,
        eventType: RewardEventType.XP,
        ...(sinceDate ? { createdAt: MoreThanOrEqual(sinceDate) } : {}),
      },
      select: ['xpAmount'],
    });

    return events.reduce((sum, event) => sum + (event.xpAmount ?? 0), 0);
  }

  private meetsQualificationThreshold(progress: {
    streak: number;
    xp: number;
    activeSessions: number;
  }): boolean {
    return (
      progress.streak >= REQUIRED_STREAK &&
      progress.xp >= REQUIRED_XP &&
      progress.activeSessions >= REQUIRED_ACTIVE_SESSIONS
    );
  }

  private async getOrCreateState(
    profileId: string,
    seasonId: string,
    entityManager?: EntityManager,
  ): Promise<QualificationState> {
    const qualificationStateRepository =
      entityManager?.getRepository(QualificationState) ??
      this.qualificationStateRepository;
    await qualificationStateRepository
      .createQueryBuilder()
      .insert()
      .into(QualificationState)
      .values({
        profileId,
        seasonId,
        status: QualificationStatus.LOCKED,
        qualifiedAt: null,
        pausedAt: null,
        restoredAt: null,
      })
      .orIgnore()
      .execute();

    const state = await qualificationStateRepository.findOne({
      where: { profileId, seasonId },
    });
    if (!state) {
      throw new Error('Qualification state could not be read after insert');
    }
    return state;
  }

  private async resolveSeasonId(
    seasonId: string | null | undefined,
    entityManager?: EntityManager,
  ): Promise<string | null> {
    if (seasonId !== undefined) {
      return seasonId;
    }
    const activeSeason = await this.seasonService.getActiveSeason(
      new Date(),
      entityManager,
    );
    return activeSeason?.id ?? null;
  }

  private async hasMissedDailyCheckIn(
    profileId: string,
    entityManager?: EntityManager,
  ): Promise<boolean> {
    const checkInRecordRepository =
      entityManager?.getRepository(CheckInRecord) ??
      this.checkInRecordRepository;
    const lastCheckIn = await checkInRecordRepository.findOne({
      where: { profileId },
      order: { checkInDate: 'DESC' },
    });

    if (!lastCheckIn) {
      return false;
    }

    const today = this.getUtcDateKey(new Date());
    return this.dayDiff(lastCheckIn.checkInDate, today) > 1;
  }

  private getUtcDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private dayDiff(fromDate: string, toDate: string): number {
    const from = new Date(`${fromDate}T00:00:00.000Z`).getTime();
    const to = new Date(`${toDate}T00:00:00.000Z`).getTime();
    return Math.floor((to - from) / (24 * 60 * 60 * 1000));
  }

  private toSnapshot(status: QualificationStatus): QualificationSnapshot {
    return {
      qualificationStatus: status,
      rareRewardAccessActive: this.hasRareRewardAccess(status),
    };
  }

  private emptySeasonProgress(): SeasonProgressSnapshot {
    return {
      qualificationStatus: QualificationStatus.LOCKED,
      eligibleAtSeasonEnd: false,
      streak: 0,
      xp: 0,
      activeSessions: 0,
      requiredStreak: REQUIRED_STREAK,
      requiredXp: REQUIRED_XP,
      requiredActiveSessions: REQUIRED_ACTIVE_SESSIONS,
    };
  }

  private hasRareRewardAccess(status: QualificationStatus): boolean {
    return (
      status === QualificationStatus.QUALIFIED ||
      status === QualificationStatus.RESTORED
    );
  }
}
