import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';
import { RewardEvent, RewardEventType } from './entities/reward-event.entity';

export const DAILY_XP_CAP = 100;

export enum XpSource {
  DAILY_CHECK_IN = 'daily_check_in',
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
  metadata?: Record<string, unknown>;
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
    @InjectRepository(RewardEvent)
    private readonly rewardEventRepository: Repository<RewardEvent>,
  ) {}

  async grantXp(
    profileId: string,
    allocations: XpAllocation[],
    now: Date = new Date(),
  ): Promise<XpGrantResult> {
    const normalizedAllocations = allocations.filter((item) => item.amount > 0);
    if (normalizedAllocations.length === 0) {
      const remaining = await this.getRemainingDailyCap(profileId, now);
      return {
        grantedTotal: 0,
        remainingDailyCap: remaining,
        grantedAllocations: [],
      };
    }

    let remainingDailyCap = await this.getRemainingDailyCap(profileId, now);
    const grantedAllocations: XpGrantResult['grantedAllocations'] = [];
    const eventsToSave: RewardEvent[] = [];

    for (const allocation of normalizedAllocations) {
      const requestedAmount = Math.max(0, Math.floor(allocation.amount));
      const grantedAmount = Math.min(remainingDailyCap, requestedAmount);
      remainingDailyCap -= grantedAmount;

      grantedAllocations.push({
        source: allocation.source,
        requestedAmount,
        grantedAmount,
      });

      if (grantedAmount <= 0) {
        continue;
      }

      eventsToSave.push(
        this.rewardEventRepository.create({
          profileId,
          eventType: RewardEventType.XP,
          xpAmount: grantedAmount,
          tokenSymbol: null,
          metadata: {
            source: allocation.source,
            requestedAmount,
            ...allocation.metadata,
          },
        }),
      );
    }

    if (eventsToSave.length > 0) {
      await this.rewardEventRepository.save(eventsToSave);
    }

    return {
      grantedTotal: grantedAllocations.reduce(
        (sum, item) => sum + item.grantedAmount,
        0,
      ),
      remainingDailyCap,
      grantedAllocations,
    };
  }

  private async getRemainingDailyCap(
    profileId: string,
    now: Date,
  ): Promise<number> {
    const { start, end } = this.getUtcDayRange(now);
    const todayXpEvents = await this.rewardEventRepository.find({
      where: {
        profileId,
        eventType: RewardEventType.XP,
        createdAt: Between(start, end),
      },
      select: ['xpAmount'],
    });

    const earnedToday = todayXpEvents.reduce(
      (sum, event) => sum + (event.xpAmount ?? 0),
      0,
    );
    return Math.max(0, DAILY_XP_CAP - earnedToday);
  }

  private getUtcDayRange(date: Date): { start: Date; end: Date } {
    const start = new Date(date);
    start.setUTCHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setUTCHours(23, 59, 59, 999);
    return { start, end };
  }
}
