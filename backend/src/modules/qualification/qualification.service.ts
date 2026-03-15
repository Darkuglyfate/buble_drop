import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { CheckInRecord } from '../check-in/entities/check-in-record.entity';
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
  ) {}

  async processAfterDailyCheckIn(
    profileId: string,
    missedDay: boolean,
  ): Promise<QualificationSnapshot> {
    let state = await this.getOrCreateState(profileId);

    if (missedDay && this.hasRareRewardAccess(state.status)) {
      state.status = QualificationStatus.PAUSED;
      state.pausedAt = new Date();
      state = await this.qualificationStateRepository.save(state);
    }

    return this.evaluateProgress(profileId, state);
  }

  async evaluateProgress(
    profileId: string,
    existingState?: QualificationState,
  ): Promise<QualificationSnapshot> {
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      return {
        qualificationStatus: QualificationStatus.LOCKED,
        rareRewardAccessActive: false,
      };
    }

    let state = existingState ?? (await this.getOrCreateState(profileId));

    // Reflect missed daily check-ins even outside check-in mutation flow.
    const missedDailyCheckIn = await this.hasMissedDailyCheckIn(profileId);
    if (missedDailyCheckIn && this.hasRareRewardAccess(state.status)) {
      state.status = QualificationStatus.PAUSED;
      state.pausedAt = new Date();
      state = await this.qualificationStateRepository.save(state);
    }

    if (state.status === QualificationStatus.PAUSED) {
      const progress = await this.getQualificationProgress(
        profileId,
        state.pausedAt ?? undefined,
        profile.currentStreak,
      );
      if (this.meetsQualificationThreshold(progress)) {
        state.status = QualificationStatus.RESTORED;
        state.restoredAt = new Date();
        state = await this.qualificationStateRepository.save(state);
      }
      return this.toSnapshot(state.status);
    }

    if (
      state.status === QualificationStatus.LOCKED ||
      state.status === QualificationStatus.IN_PROGRESS
    ) {
      const progress = await this.getQualificationProgress(
        profileId,
        undefined,
        profile.currentStreak,
      );
      if (this.meetsQualificationThreshold(progress)) {
        state.status = QualificationStatus.QUALIFIED;
        state.qualifiedAt = new Date();
      } else if (state.status === QualificationStatus.LOCKED) {
        state.status = QualificationStatus.IN_PROGRESS;
      }
      state = await this.qualificationStateRepository.save(state);
    }

    return this.toSnapshot(state.status);
  }

  private async getQualificationProgress(
    profileId: string,
    sinceDate: Date | undefined,
    currentStreak: number,
  ): Promise<{ streak: number; xp: number; activeSessions: number }> {
    const xp = await this.getEarnedXp(profileId, sinceDate);
    const activeSessions = await this.bubbleSessionRepository.count({
      where: {
        profileId,
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
    sinceDate?: Date,
  ): Promise<number> {
    const events = await this.rewardEventRepository.find({
      where: {
        profileId,
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
  ): Promise<QualificationState> {
    let state = await this.qualificationStateRepository.findOne({
      where: { profileId },
    });
    if (!state) {
      state = this.qualificationStateRepository.create({
        profileId,
        status: QualificationStatus.LOCKED,
        qualifiedAt: null,
        pausedAt: null,
        restoredAt: null,
      });
      state = await this.qualificationStateRepository.save(state);
    }
    return state;
  }

  private async hasMissedDailyCheckIn(profileId: string): Promise<boolean> {
    const lastCheckIn = await this.checkInRecordRepository.findOne({
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

  private hasRareRewardAccess(status: QualificationStatus): boolean {
    return (
      status === QualificationStatus.QUALIFIED ||
      status === QualificationStatus.RESTORED
    );
  }
}
