import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager, LessThan } from 'typeorm';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { SeasonService } from '../partner-token/season.service';
import { Profile } from '../profile/entities/profile.entity';
import {
  RareRewardEntitlement,
  RareRewardEntitlementStatus,
} from './entities/rare-reward-entitlement.entity';
import { RareRewardService } from './rare-reward.service';

const PROCESSING_LEASE_MS = 5 * 60 * 1000;

export interface CreateRareRewardEntitlementInput {
  entityManager: EntityManager;
  profileId: string;
  sessionId: string;
  rareRewardAccessActive: boolean;
  isCompletionEligible: boolean;
}

@Injectable()
export class RareRewardEntitlementService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly rareRewardService: RareRewardService,
    private readonly seasonService: SeasonService,
  ) {}

  async createForEligibleCompletedSession(
    input: CreateRareRewardEntitlementInput,
  ): Promise<RareRewardEntitlement | null> {
    if (!input.rareRewardAccessActive || !input.isCompletionEligible) {
      return null;
    }

    const entitlementRepository = input.entityManager.getRepository(
      RareRewardEntitlement,
    );
    const existing = await entitlementRepository.findOne({
      where: { sessionId: input.sessionId },
    });
    if (existing) {
      return existing;
    }

    const session = await input.entityManager
      .getRepository(BubbleSession)
      .findOne({
        where: {
          id: input.sessionId,
          profileId: input.profileId,
          isCompleted: true,
        },
      });
    if (!session) {
      throw new NotFoundException('Completed bubble session not found');
    }
    if (!session.seasonId || !session.endedAt) {
      return null;
    }
    const activeSeason = await this.seasonService.getActiveSeason(
      session.endedAt,
      input.entityManager,
    );
    if (activeSeason?.id !== session.seasonId) {
      return null;
    }

    const entitlement = entitlementRepository.create({
      profileId: input.profileId,
      sessionId: input.sessionId,
      seasonId: session.seasonId,
      idempotencyKey: this.getEntitlementIdempotencyKey(input.sessionId),
      status: RareRewardEntitlementStatus.PENDING,
      attempts: 0,
      processingStartedAt: null,
      issuedAt: null,
      lastError: null,
      outcome: null,
    });

    try {
      return await entitlementRepository.save(entitlement);
    } catch (error) {
      if (!this.isUniqueViolation(error)) {
        throw error;
      }
      const concurrent = await entitlementRepository.findOne({
        where: { sessionId: input.sessionId },
      });
      if (!concurrent) {
        throw error;
      }
      return concurrent;
    }
  }

  async issueEntitlement(
    entitlementId: string,
  ): Promise<RareRewardEntitlement | null> {
    const claimed = await this.dataSource.transaction((entityManager) =>
      this.claimEntitlement(entityManager, entitlementId),
    );
    if (!claimed) {
      return this.dataSource.getRepository(RareRewardEntitlement).findOne({
        where: { id: entitlementId },
      });
    }

    try {
      return await this.dataSource.transaction(async (entityManager) => {
        const entitlementRepository = entityManager.getRepository(
          RareRewardEntitlement,
        );
        const entitlement = await entitlementRepository.findOne({
          where: { id: entitlementId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!entitlement) {
          throw new NotFoundException('Rare reward entitlement not found');
        }
        if (entitlement.status === RareRewardEntitlementStatus.ISSUED) {
          return entitlement;
        }
        if (entitlement.status !== RareRewardEntitlementStatus.PROCESSING) {
          return entitlement;
        }

        const profile = await entityManager.getRepository(Profile).findOne({
          where: { id: entitlement.profileId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!profile) {
          throw new NotFoundException('Profile not found');
        }
        const session = await entityManager
          .getRepository(BubbleSession)
          .findOne({
            where: {
              id: entitlement.sessionId,
              profileId: entitlement.profileId,
              isCompleted: true,
            },
            lock: { mode: 'pessimistic_write' },
          });
        if (!session) {
          throw new NotFoundException('Completed bubble session not found');
        }

        const outcome = await this.rareRewardService.issueSessionRareRewards({
          profile,
          session,
          rareRewardAccessActive: true,
          isCompletionEligible: true,
          idempotencyKey: entitlement.idempotencyKey,
          seasonId: entitlement.seasonId,
          entityManager,
        });
        entitlement.status = RareRewardEntitlementStatus.ISSUED;
        entitlement.processingStartedAt = null;
        entitlement.issuedAt = new Date();
        entitlement.lastError = null;
        entitlement.outcome = outcome;
        return entitlementRepository.save(entitlement);
      });
    } catch (error) {
      return this.markFailed(entitlementId, error);
    }
  }

  async processPendingEntitlements(
    limit = 100,
  ): Promise<RareRewardEntitlement[]> {
    const staleProcessingBefore = new Date(Date.now() - PROCESSING_LEASE_MS);
    const entitlements = await this.dataSource
      .getRepository(RareRewardEntitlement)
      .find({
        where: [
          { status: RareRewardEntitlementStatus.PENDING },
          { status: RareRewardEntitlementStatus.FAILED },
          {
            status: RareRewardEntitlementStatus.PROCESSING,
            processingStartedAt: LessThan(staleProcessingBefore),
          },
        ],
        order: { createdAt: 'ASC' },
        take: limit,
      });
    const processed = await Promise.all(
      entitlements.map((entitlement) => this.issueEntitlement(entitlement.id)),
    );
    return processed.filter(
      (entitlement): entitlement is RareRewardEntitlement =>
        entitlement !== null,
    );
  }

  private async claimEntitlement(
    entityManager: EntityManager,
    entitlementId: string,
  ): Promise<RareRewardEntitlement | null> {
    const entitlementRepository = entityManager.getRepository(
      RareRewardEntitlement,
    );
    const entitlement = await entitlementRepository.findOne({
      where: { id: entitlementId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!entitlement) {
      throw new NotFoundException('Rare reward entitlement not found');
    }
    if (entitlement.status === RareRewardEntitlementStatus.ISSUED) {
      return null;
    }
    if (
      entitlement.status === RareRewardEntitlementStatus.PROCESSING &&
      !this.isProcessingLeaseExpired(entitlement)
    ) {
      return null;
    }

    entitlement.status = RareRewardEntitlementStatus.PROCESSING;
    entitlement.processingStartedAt = new Date();
    entitlement.attempts += 1;
    entitlement.lastError = null;
    return entitlementRepository.save(entitlement);
  }

  private async markFailed(
    entitlementId: string,
    error: unknown,
  ): Promise<RareRewardEntitlement> {
    return this.dataSource.transaction(async (entityManager) => {
      const entitlementRepository = entityManager.getRepository(
        RareRewardEntitlement,
      );
      const entitlement = await entitlementRepository.findOne({
        where: { id: entitlementId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!entitlement) {
        throw new NotFoundException('Rare reward entitlement not found');
      }
      if (entitlement.status === RareRewardEntitlementStatus.ISSUED) {
        return entitlement;
      }

      entitlement.status = RareRewardEntitlementStatus.FAILED;
      entitlement.processingStartedAt = null;
      entitlement.lastError = this.errorMessage(error);
      return entitlementRepository.save(entitlement);
    });
  }

  private getEntitlementIdempotencyKey(sessionId: string): string {
    return `rare-reward:${sessionId}`;
  }

  private isProcessingLeaseExpired(
    entitlement: RareRewardEntitlement,
  ): boolean {
    return (
      entitlement.processingStartedAt === null ||
      entitlement.processingStartedAt.getTime() <=
        Date.now() - PROCESSING_LEASE_MS
    );
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      (error as { driverError?: { code?: string } })?.driverError?.code ===
      '23505'
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'rare reward issuance failed';
  }
}
