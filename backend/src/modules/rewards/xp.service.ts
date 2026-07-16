import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  And,
  DataSource,
  EntityManager,
  In,
  LessThan,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { RewardEvent, RewardEventType } from './entities/reward-event.entity';

export const DAILY_XP_CAP = 100;

export enum XpSource {
  DAILY_CHECK_IN = 'daily_check_in',
  DAILY_CHECK_IN_REORG_REVERSAL = 'daily_check_in_reorg_reversal',
  SESSION_REWARD_BUBBLES = 'session_reward_bubbles',
  SESSION_ACTIVE_PLAY = 'session_active_play',
  SESSION_COMPLETION_BONUS = 'session_completion_bonus',
  SESSION_RESERVE_BONUS = 'session_reserve_bonus',
  ONBOARDING_COMPLETION = 'onboarding_completion',
  REFERRAL_SUCCESS = 'referral_success',
}

export interface XpAllocation {
  source: XpSource;
  amount: number;
  seasonId?: string | null;
  idempotencyKey?: string;
  metadata?: Record<string, unknown>;
}

interface NormalizedXpAllocation extends XpAllocation {
  idempotencyKey: string;
  requestedAmount: number;
}

export interface XpGrantResult {
  grantedTotal: number;
  remainingDailyCap: number;
  grantedAllocations: Array<{
    source: XpSource;
    requestedAmount: number;
    grantedAmount: number;
  }>;
}

@Injectable()
export class XpService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(RewardEvent)
    private readonly rewardEventRepository: Repository<RewardEvent>,
  ) {}

  async grantXp(
    profileId: string,
    allocations: XpAllocation[],
    now: Date = new Date(),
    entityManager?: EntityManager,
  ): Promise<XpGrantResult> {
    const normalizedAllocations = allocations.map((allocation) =>
      this.normalizeAllocation(profileId, allocation),
    );
    this.assertUniqueIdempotencyKeys(normalizedAllocations);

    const grant = (manager: EntityManager) =>
      this.grantXpInTransaction(manager, profileId, normalizedAllocations, now);

    try {
      return entityManager
        ? await entityManager.transaction(grant)
        : await this.dataSource.transaction(grant);
    } catch (error) {
      if (!this.isIdempotencyUniqueViolation(error)) {
        throw error;
      }

      return entityManager
        ? this.grantXpInTransaction(
            entityManager,
            profileId,
            normalizedAllocations,
            now,
          )
        : this.dataSource.transaction(grant);
    }
  }

  private async grantXpInTransaction(
    entityManager: EntityManager,
    profileId: string,
    allocations: NormalizedXpAllocation[],
    now: Date,
  ): Promise<XpGrantResult> {
    const profileRepository = entityManager.getRepository(Profile);
    const rewardEventRepository = entityManager.getRepository(RewardEvent);
    const profile = await profileRepository.findOne({
      where: { id: profileId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    const existingEvents = await rewardEventRepository.find({
      where: {
        idempotencyKey: In(
          allocations.map((allocation) => allocation.idempotencyKey),
        ),
      },
    });
    const existingEventsByKey = new Map(
      existingEvents.map((event) => [event.idempotencyKey, event]),
    );
    const remainingDailyCap = await this.getRemainingDailyCap(
      rewardEventRepository,
      profileId,
      now,
    );

    let remaining = remainingDailyCap;
    let newlyInsertedNetAmount = 0;
    const eventsToSave: RewardEvent[] = [];
    const grantedAllocations: XpGrantResult['grantedAllocations'] = [];

    for (const allocation of allocations) {
      const existingEvent = existingEventsByKey.get(allocation.idempotencyKey);
      if (existingEvent) {
        const grantedAmount = this.getCompatibleExistingGrant(
          existingEvent,
          profileId,
          allocation,
        );
        grantedAllocations.push({
          source: allocation.source,
          requestedAmount: allocation.requestedAmount,
          grantedAmount,
        });
        continue;
      }

      const grantedAmount = this.calculateNewGrant({
        allocation,
        remainingDailyCap: remaining,
        availableTotalXp: profile.totalXp + newlyInsertedNetAmount,
      });
      if (allocation.requestedAmount > 0) {
        remaining -= grantedAmount;
      }

      eventsToSave.push(
        rewardEventRepository.create({
          profileId,
          seasonId: allocation.seasonId,
          eventType: RewardEventType.XP,
          xpAmount: grantedAmount,
          tokenSymbol: null,
          idempotencyKey: allocation.idempotencyKey,
          metadata: {
            ...allocation.metadata,
            source: allocation.source,
            requestedAmount: allocation.requestedAmount,
          },
        }),
      );
      newlyInsertedNetAmount += grantedAmount;
      grantedAllocations.push({
        source: allocation.source,
        requestedAmount: allocation.requestedAmount,
        grantedAmount,
      });
    }

    if (eventsToSave.length > 0) {
      await rewardEventRepository.save(eventsToSave);
    }
    if (newlyInsertedNetAmount !== 0) {
      profile.totalXp = Math.max(0, profile.totalXp + newlyInsertedNetAmount);
      await profileRepository.save(profile);
    }

    return {
      grantedTotal: grantedAllocations.reduce(
        (sum, allocation) => sum + allocation.grantedAmount,
        0,
      ),
      remainingDailyCap: remaining,
      grantedAllocations,
    };
  }

  private normalizeAllocation(
    profileId: string,
    allocation: XpAllocation,
  ): NormalizedXpAllocation {
    if (!Number.isFinite(allocation.amount)) {
      throw new BadRequestException('XP amount must be a finite number');
    }

    const requestedAmount = Math.trunc(allocation.amount);
    if (
      requestedAmount < 0 &&
      allocation.source !== XpSource.DAILY_CHECK_IN_REORG_REVERSAL
    ) {
      throw new BadRequestException(
        'Only daily check-in reorg reversals may grant negative XP',
      );
    }
    if (
      requestedAmount > 0 &&
      allocation.source === XpSource.DAILY_CHECK_IN_REORG_REVERSAL
    ) {
      throw new BadRequestException(
        'Daily check-in reorg reversals must not grant positive XP',
      );
    }

    const idempotencyKey = this.getIdempotencyKey(profileId, allocation);
    return {
      ...allocation,
      seasonId: allocation.seasonId ?? null,
      idempotencyKey,
      requestedAmount,
    };
  }

  private getIdempotencyKey(
    profileId: string,
    allocation: XpAllocation,
  ): string {
    const suppliedKey = allocation.idempotencyKey?.trim();
    const referralId = allocation.metadata?.referralId;
    const idempotencyKey =
      suppliedKey ||
      (allocation.source === XpSource.REFERRAL_SUCCESS &&
      typeof referralId === 'string'
        ? `referral:${profileId}:${referralId}`
        : null);

    if (!idempotencyKey) {
      throw new BadRequestException(
        'XP allocations require an idempotency key',
      );
    }
    if (idempotencyKey.length > 160) {
      throw new BadRequestException(
        'XP idempotency keys must not exceed 160 characters',
      );
    }
    return idempotencyKey;
  }

  private assertUniqueIdempotencyKeys(
    allocations: NormalizedXpAllocation[],
  ): void {
    const idempotencyKeys = new Set<string>();
    for (const allocation of allocations) {
      if (idempotencyKeys.has(allocation.idempotencyKey)) {
        throw new BadRequestException(
          'XP idempotency keys must be unique within a grant',
        );
      }
      idempotencyKeys.add(allocation.idempotencyKey);
    }
  }

  private getCompatibleExistingGrant(
    event: RewardEvent,
    profileId: string,
    allocation: NormalizedXpAllocation,
  ): number {
    if (
      event.profileId !== profileId ||
      (event.seasonId ?? null) !== allocation.seasonId ||
      event.eventType !== RewardEventType.XP ||
      event.metadata?.source !== allocation.source ||
      event.metadata?.requestedAmount !== allocation.requestedAmount ||
      event.xpAmount === null
    ) {
      throw new ConflictException(
        'Idempotency key belongs to an incompatible XP grant',
      );
    }
    return event.xpAmount;
  }

  private calculateNewGrant(input: {
    allocation: NormalizedXpAllocation;
    remainingDailyCap: number;
    availableTotalXp: number;
  }): number {
    if (input.allocation.requestedAmount > 0) {
      return Math.min(
        input.remainingDailyCap,
        input.allocation.requestedAmount,
      );
    }
    if (input.allocation.requestedAmount < 0) {
      return -Math.min(
        Math.max(0, input.availableTotalXp),
        Math.abs(input.allocation.requestedAmount),
      );
    }
    return 0;
  }

  private async getRemainingDailyCap(
    rewardEventRepository: Repository<RewardEvent>,
    profileId: string,
    now: Date,
  ): Promise<number> {
    const { start, nextStart } = this.getUtcDayRange(now);
    const todayXpEvents = await rewardEventRepository.find({
      where: {
        profileId,
        eventType: RewardEventType.XP,
        createdAt: And(MoreThanOrEqual(start), LessThan(nextStart)),
      },
      select: ['xpAmount'],
    });

    const earnedToday = todayXpEvents.reduce(
      (sum, event) => sum + Math.max(0, event.xpAmount ?? 0),
      0,
    );
    return Math.max(0, DAILY_XP_CAP - earnedToday);
  }

  private isIdempotencyUniqueViolation(error: unknown): boolean {
    const driverError = (error as { driverError?: { code?: string } })
      ?.driverError;
    return driverError?.code === '23505';
  }

  private getUtcDayRange(date: Date): { start: Date; nextStart: Date } {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const nextStart = new Date(start);
    nextStart.setUTCDate(nextStart.getUTCDate() + 1);
    return { start, nextStart };
  }
}
