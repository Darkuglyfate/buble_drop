import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GaslessRelayStatus } from '../onchain-relay/gasless-relay.service';
import { SessionOutcomeOnchainService } from '../onchain-relay/session-outcome-onchain.service';
import { Profile } from '../profile/entities/profile.entity';
import { QualificationStatus } from '../qualification/entities/qualification-state.entity';
import {
  QualificationService,
  type SeasonProgressSnapshot,
} from '../qualification/qualification.service';
import { RedisService } from '../../redis/redis.service';
import { type RareRewardIssueResult } from '../rewards/rare-reward.service';
import { XpService, XpSource } from '../rewards/xp.service';
import { BubbleSession } from './entities/bubble-session.entity';

const ACTIVE_PLAY_XP_MAX = 20;
const SESSION_REWARD_BUBBLES_XP = 30;
const SESSION_COMPLETION_BONUS_XP = 20;
const MIN_SESSION_SECONDS_FOR_COMPLETION = 300; // 5 minutes
const ACTIVE_SECONDS_FOR_COMPLETION_BONUS = 180;
const SESSION_ACTIVE_SECONDS_XP_CAP = 600; // 10 minutes
const ACTIVE_SECONDS_PER_SIGNAL = 12;
const SESSION_ACTIVITY_TTL_SECONDS = 24 * 60 * 60;
const EMPTY_RARE_REWARD_OUTCOME: RareRewardIssueResult = {
  tokenSymbolAwarded: null,
  tokenAmountAwarded: '0',
  weeklyTicketsIssued: 0,
  nftIdsAwarded: [],
  cosmeticIdsAwarded: [],
  tokenReward: null,
  nftRewards: [],
  cosmeticRewards: [],
};
const SESSION_REWARD_FLAG_COMPLETION_ELIGIBLE = 1 << 0;
const SESSION_REWARD_FLAG_RARE_ACCESS_ACTIVE = 1 << 1;
const SESSION_REWARD_FLAG_SEASON_ELIGIBLE = 1 << 2;
const SESSION_REWARD_FLAG_RARE_REWARD_ISSUED = 1 << 3;

export interface BubbleSessionStartResult {
  sessionId: string;
  profileId: string;
  startedAt: Date;
}

export interface BubbleSessionCompleteResult {
  success: true;
  sessionId: string;
  profileId: string;
  endedAt: Date;
  sessionDurationSeconds: number;
  activeSeconds: number;
  activePlayXp: number;
  completionBonusXp: number;
  xpAwarded: number;
  newStreak: number;
  rareAccessActive: boolean;
  grantedXp: number;
  totalXp: number;
  qualificationStatus: QualificationStatus;
  rareRewardAccessActive: boolean;
  seasonProgress: SeasonProgressSnapshot;
  rareRewardOutcome: RareRewardIssueResult;
  finalScore: number;
  bestCombo: number;
  rewardFlags: number;
  integrityHash: string;
  onchainCommit: {
    relay: GaslessRelayStatus;
    submitted: boolean;
    txHash: string | null;
    sessionIdHash: string;
    committedAt: string | null;
  };
}

export interface BubbleSessionActivityRecordResult {
  sessionId: string;
  profileId: string;
  recordedAt: Date;
}

@Injectable()
export class BubbleSessionService {
  private readonly logger = new Logger(BubbleSessionService.name);

  constructor(
    @InjectRepository(BubbleSession)
    private readonly bubbleSessionRepository: Repository<BubbleSession>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    private readonly qualificationService: QualificationService,
    private readonly xpService: XpService,
    private readonly redisService: RedisService,
    private readonly sessionOutcomeOnchainService: SessionOutcomeOnchainService,
  ) {}

  async startSession(profileId: string): Promise<BubbleSessionStartResult> {
    this.assertUuid(profileId, 'Invalid profileId format');

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    this.assertOnboardingCompleted(profile);

    const activeSession = await this.bubbleSessionRepository.findOne({
      where: { profileId, isCompleted: false },
      order: { startedAt: 'DESC' },
    });
    if (activeSession) {
      return {
        sessionId: activeSession.id,
        profileId: activeSession.profileId,
        startedAt: activeSession.startedAt,
      };
    }

    let session = this.bubbleSessionRepository.create({
      profileId,
      endedAt: null,
      activeSeconds: 0,
      isCompleted: false,
    });
    session = await this.bubbleSessionRepository.save(session);

    return {
      sessionId: session.id,
      profileId: session.profileId,
      startedAt: session.startedAt,
    };
  }

  async completeSession(
    profileId: string,
    sessionId: string,
    activeSecondsInput: number,
    finalScoreInput: number,
    bestComboInput: number,
  ): Promise<BubbleSessionCompleteResult> {
    this.assertUuid(profileId, 'Invalid profileId format');
    this.assertUuid(sessionId, 'Invalid sessionId format');

    if (!Number.isFinite(activeSecondsInput) || activeSecondsInput < 0) {
      throw new BadRequestException(
        'activeSeconds must be a non-negative number',
      );
    }
    if (!Number.isFinite(finalScoreInput) || finalScoreInput < 0) {
      throw new BadRequestException('finalScore must be a non-negative number');
    }
    if (!Number.isFinite(bestComboInput) || bestComboInput < 0) {
      throw new BadRequestException('bestCombo must be a non-negative number');
    }

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
      relations: {
        wallet: true,
      },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    this.assertOnboardingCompleted(profile);

    const session = await this.bubbleSessionRepository.findOne({
      where: { id: sessionId, profileId },
    });
    if (!session) {
      throw new NotFoundException('Bubble session not found');
    }
    if (session.isCompleted) {
      throw new ConflictException('Bubble session already completed');
    }

    const endedAt = new Date();
    const sessionDurationSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - session.startedAt.getTime()) / 1000),
    );
    const reportedActiveSeconds = Math.floor(activeSecondsInput);
    const finalScore = Math.floor(finalScoreInput);
    const bestCombo = Math.floor(bestComboInput);
    if (reportedActiveSeconds > sessionDurationSeconds) {
      throw new BadRequestException(
        'activeSeconds cannot exceed session duration',
      );
    }
    const recordedActiveSeconds = await this.getRecordedActiveSeconds(
      session,
      endedAt,
      reportedActiveSeconds,
    );
    const activeSeconds = Math.min(
      reportedActiveSeconds,
      recordedActiveSeconds,
    );

    const cappedActiveSeconds = Math.min(
      activeSeconds,
      SESSION_ACTIVE_SECONDS_XP_CAP,
    );
    const activePlayXp = Math.floor(
      (cappedActiveSeconds / SESSION_ACTIVE_SECONDS_XP_CAP) *
        ACTIVE_PLAY_XP_MAX,
    );
    const isCompletionEligible =
      sessionDurationSeconds >= MIN_SESSION_SECONDS_FOR_COMPLETION &&
      activeSeconds >= ACTIVE_SECONDS_FOR_COMPLETION_BONUS;
    const rewardBubblesXp = isCompletionEligible
      ? SESSION_REWARD_BUBBLES_XP
      : 0;
    const completionBonusXp = isCompletionEligible
      ? SESSION_COMPLETION_BONUS_XP
      : 0;

    session.endedAt = endedAt;
    session.activeSeconds = activeSeconds;
    session.isCompleted = true;
    await this.bubbleSessionRepository.save(session);

    const xpGrant = await this.xpService.grantXp(profileId, [
      {
        source: XpSource.SESSION_REWARD_BUBBLES,
        amount: rewardBubblesXp,
        metadata: {
          sessionId: session.id,
          sessionDurationSeconds,
        },
      },
      {
        source: XpSource.SESSION_ACTIVE_PLAY,
        amount: activePlayXp,
        metadata: {
          sessionId: session.id,
          activeSeconds,
          sessionDurationSeconds,
        },
      },
      {
        source: XpSource.SESSION_COMPLETION_BONUS,
        amount: completionBonusXp,
        metadata: {
          sessionId: session.id,
          sessionDurationSeconds,
        },
      },
      {
        source: XpSource.SESSION_RESERVE_BONUS,
        amount: 0,
        metadata: {
          sessionId: session.id,
        },
      },
    ]);

    const grantedXp = xpGrant.grantedTotal;
    if (grantedXp > 0) {
      profile.totalXp += grantedXp;
      await this.profileRepository.save(profile);
    }

    const qualification =
      await this.qualificationService.evaluateProgress(profileId);
    const seasonProgress =
      await this.qualificationService.getSeasonProgress(profileId);
    const rewardFlags = this.buildRewardFlags({
      isCompletionEligible,
      rareAccessActive: qualification.rareRewardAccessActive,
      seasonEligible: seasonProgress.eligibleAtSeasonEnd,
      rareRewardIssued: this.hasRareRewardIssue(EMPTY_RARE_REWARD_OUTCOME),
    });
    const integrityHash = this.buildIntegrityHash({
      sessionId: session.id,
      walletAddress: profile.wallet?.address ?? '',
      xpGained: grantedXp,
      finalScore,
      bestCombo,
      activeSeconds,
      sessionDurationSeconds,
      rewardFlags,
    });
    const onchainCommit =
      profile.wallet?.address && profile.wallet.address.trim().length > 0
        ? await this.sessionOutcomeOnchainService.recordOutcome({
            sessionId: session.id,
            walletAddress: profile.wallet.address,
            xpGained: grantedXp,
            finalScore,
            bestCombo,
            activeSeconds,
            sessionDurationSeconds,
            rewardFlags,
            integrityHash,
          })
        : {
            txHash: null,
            submitted: false,
            relay: this.sessionOutcomeOnchainService.getRelayStatus(),
            sessionIdHash: this.sessionOutcomeOnchainService.getSessionIdHash(
              session.id,
            ),
            committedAt: null,
          };

    session.finalScore = finalScore;
    session.bestCombo = bestCombo;
    session.rewardFlags = rewardFlags;
    session.integrityHash = integrityHash;
    session.outcomeTxHash = onchainCommit.txHash;
    session.outcomeRecordedAt = onchainCommit.committedAt
      ? new Date(onchainCommit.committedAt)
      : null;
    await this.bubbleSessionRepository.save(session);

    return {
      success: true,
      sessionId: session.id,
      profileId,
      endedAt,
      sessionDurationSeconds,
      activeSeconds,
      activePlayXp,
      completionBonusXp,
      xpAwarded: grantedXp,
      newStreak: profile.currentStreak,
      rareAccessActive: qualification.rareRewardAccessActive,
      grantedXp,
      totalXp: profile.totalXp,
      qualificationStatus: qualification.qualificationStatus,
      rareRewardAccessActive: qualification.rareRewardAccessActive,
      seasonProgress,
      rareRewardOutcome: EMPTY_RARE_REWARD_OUTCOME,
      finalScore,
      bestCombo,
      rewardFlags,
      integrityHash,
      onchainCommit: {
        relay: onchainCommit.relay,
        submitted: onchainCommit.submitted,
        txHash: onchainCommit.txHash,
        sessionIdHash: onchainCommit.sessionIdHash,
        committedAt: onchainCommit.committedAt,
      },
    };
  }

  async recordActivitySignal(
    profileId: string,
    sessionId: string,
  ): Promise<BubbleSessionActivityRecordResult> {
    this.assertUuid(profileId, 'Invalid profileId format');
    this.assertUuid(sessionId, 'Invalid sessionId format');

    const session = await this.bubbleSessionRepository.findOne({
      where: { id: sessionId, profileId },
    });
    if (!session) {
      throw new NotFoundException('Bubble session not found');
    }

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    this.assertOnboardingCompleted(profile);

    if (session.isCompleted) {
      throw new ConflictException('Bubble session already completed');
    }

    const recordedAt = new Date();
    try {
      const client = this.redisService.getClient();
      const activityKey = this.getActivityKey(session.id);
      const timestampMs = recordedAt.getTime();
      await client.zadd(activityKey, timestampMs, `${timestampMs}`);
      await client.expire(activityKey, SESSION_ACTIVITY_TTL_SECONDS);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'unknown redis failure';
      this.logger.warn(
        `Redis activity write failed for bubble session ${session.id}; gameplay will continue with reported activeSeconds fallback. ${detail}`,
      );
    }

    return {
      sessionId: session.id,
      profileId,
      recordedAt,
    };
  }

  private async getRecordedActiveSeconds(
    session: BubbleSession,
    endedAt: Date,
    fallbackActiveSeconds: number,
  ): Promise<number> {
    const sessionStartedAtMs = session.startedAt.getTime();
    const sessionEndedAtMs = endedAt.getTime();
    const sessionDurationSeconds = Math.max(
      0,
      Math.floor((sessionEndedAtMs - sessionStartedAtMs) / 1000),
    );
    const boundedFallbackActiveSeconds = Math.min(
      Math.max(0, Math.floor(fallbackActiveSeconds)),
      sessionDurationSeconds,
    );

    try {
      const client = this.redisService.getClient();
      const activityKey = this.getActivityKey(session.id);
      const rawTimestamps = await client.zrange(activityKey, 0, -1);
      await client.del(activityKey);

      if (rawTimestamps.length === 0) {
        return 0;
      }

      const uniqueBuckets = new Set<number>();

      for (const timestamp of rawTimestamps) {
        const timestampMs = Number(timestamp);
        if (
          !Number.isFinite(timestampMs) ||
          timestampMs < sessionStartedAtMs ||
          timestampMs > sessionEndedAtMs
        ) {
          continue;
        }

        uniqueBuckets.add(
          Math.floor(
            (timestampMs - sessionStartedAtMs) /
              1000 /
              ACTIVE_SECONDS_PER_SIGNAL,
          ),
        );
      }

      const recordedActiveSeconds =
        uniqueBuckets.size * ACTIVE_SECONDS_PER_SIGNAL;

      return Math.min(recordedActiveSeconds, sessionDurationSeconds);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : 'unknown redis failure';
      this.logger.warn(
        `Redis activity replay failed for bubble session ${session.id}; falling back to reported activeSeconds. ${detail}`,
      );
      return boundedFallbackActiveSeconds;
    }
  }

  private getActivityKey(sessionId: string): string {
    return `bubble-session:${sessionId}:activity`;
  }

  private buildRewardFlags(input: {
    isCompletionEligible: boolean;
    rareAccessActive: boolean;
    seasonEligible: boolean;
    rareRewardIssued: boolean;
  }): number {
    let flags = 0;
    if (input.isCompletionEligible) {
      flags |= SESSION_REWARD_FLAG_COMPLETION_ELIGIBLE;
    }
    if (input.rareAccessActive) {
      flags |= SESSION_REWARD_FLAG_RARE_ACCESS_ACTIVE;
    }
    if (input.seasonEligible) {
      flags |= SESSION_REWARD_FLAG_SEASON_ELIGIBLE;
    }
    if (input.rareRewardIssued) {
      flags |= SESSION_REWARD_FLAG_RARE_REWARD_ISSUED;
    }
    return flags;
  }

  private hasRareRewardIssue(outcome: RareRewardIssueResult): boolean {
    return (
      Boolean(outcome.tokenReward) ||
      outcome.nftRewards.length > 0 ||
      outcome.cosmeticRewards.length > 0
    );
  }

  private buildIntegrityHash(input: {
    sessionId: string;
    walletAddress: string;
    xpGained: number;
    finalScore: number;
    bestCombo: number;
    activeSeconds: number;
    sessionDurationSeconds: number;
    rewardFlags: number;
  }): string {
    const digest = createHash('sha256')
      .update(
        [
          input.sessionId,
          input.walletAddress.toLowerCase(),
          input.xpGained,
          input.finalScore,
          input.bestCombo,
          input.activeSeconds,
          input.sessionDurationSeconds,
          input.rewardFlags,
        ].join(':'),
      )
      .digest('hex');
    return `0x${digest}`;
  }

  private assertOnboardingCompleted(profile: Profile): void {
    const needsOnboarding =
      profile.onboardingCompletedAt === null ||
      profile.nickname === null ||
      profile.currentAvatarId === null;
    if (needsOnboarding) {
      throw new ForbiddenException(
        'Onboarding must be completed before bubble session actions are available',
      );
    }
  }

  private assertUuid(value: string, message: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException(message);
    }
  }
}
