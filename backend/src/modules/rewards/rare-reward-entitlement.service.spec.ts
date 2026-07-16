import { DataSource, EntityManager } from 'typeorm';
import { SeasonService } from '../partner-token/season.service';
import {
  RareRewardEntitlement,
  RareRewardEntitlementStatus,
} from './entities/rare-reward-entitlement.entity';
import { RareRewardService } from './rare-reward.service';
import { RareRewardEntitlementService } from './rare-reward-entitlement.service';

describe('RareRewardEntitlementService', () => {
  const profileId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  let service: RareRewardEntitlementService;
  let entitlementRepository: {
    create: jest.Mock;
    find: jest.Mock;
    findOne: jest.Mock;
    save: jest.Mock;
  };
  let profileRepository: { findOne: jest.Mock };
  let sessionRepository: { findOne: jest.Mock };
  let dataSource: { getRepository: jest.Mock; transaction: jest.Mock };
  let rareRewardService: { issueSessionRareRewards: jest.Mock };
  let seasonService: { getActiveSeason: jest.Mock };
  let transactionManager: EntityManager;

  beforeEach(() => {
    entitlementRepository = {
      create: jest.fn((payload) => ({
        id: 'entitlement-1',
        ...payload,
      })),
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest.fn(async (payload) => payload),
    };
    profileRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: profileId,
        totalXp: 500,
        currentStreak: 8,
      }),
    };
    sessionRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: sessionId,
        profileId,
        isCompleted: true,
        activeSeconds: 300,
        seasonId: 'season-1',
        endedAt: new Date('2026-03-14T10:10:00.000Z'),
      }),
    };
    rareRewardService = {
      issueSessionRareRewards: jest.fn(),
    };
    seasonService = {
      getActiveSeason: jest.fn().mockResolvedValue({ id: 'season-1' }),
    };
    transactionManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === RareRewardEntitlement) {
          return entitlementRepository;
        }
        if (entity.name === 'Profile') {
          return profileRepository;
        }
        if (entity.name === 'BubbleSession') {
          return sessionRepository;
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    dataSource = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === RareRewardEntitlement) {
          return entitlementRepository;
        }
        throw new Error('Unexpected repository');
      }),
      transaction: jest.fn(
        (work: (transactionManager: EntityManager) => Promise<unknown>) =>
          work(transactionManager),
      ),
    };
    service = new RareRewardEntitlementService(
      dataSource as unknown as DataSource,
      rareRewardService as unknown as RareRewardService,
      seasonService as unknown as SeasonService,
    );
  });

  it('creates one pending entitlement per eligible completed session', async () => {
    entitlementRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: 'entitlement-1',
        profileId,
        sessionId,
        idempotencyKey: `rare-reward:${sessionId}`,
        status: RareRewardEntitlementStatus.PENDING,
        attempts: 0,
      });

    const created = await service.createForEligibleCompletedSession({
      entityManager: transactionManager,
      profileId,
      sessionId,
      rareRewardAccessActive: true,
      isCompletionEligible: true,
    });
    const retried = await service.createForEligibleCompletedSession({
      entityManager: transactionManager,
      profileId,
      sessionId,
      rareRewardAccessActive: true,
      isCompletionEligible: true,
    });

    expect(created).toMatchObject({
      status: RareRewardEntitlementStatus.PENDING,
      attempts: 0,
      idempotencyKey: `rare-reward:${sessionId}`,
      seasonId: 'season-1',
    });
    expect(retried).toMatchObject({ id: 'entitlement-1' });
    expect(entitlementRepository.create).toHaveBeenCalledTimes(1);
    expect(entitlementRepository.save).toHaveBeenCalledTimes(1);
  });

  it('does not create an entitlement when the session season is invalid at completion', async () => {
    entitlementRepository.findOne.mockResolvedValue(null);
    seasonService.getActiveSeason.mockResolvedValue({ id: 'season-2' });

    await expect(
      service.createForEligibleCompletedSession({
        entityManager: transactionManager,
        profileId,
        sessionId,
        rareRewardAccessActive: true,
        isCompletionEligible: true,
      }),
    ).resolves.toBeNull();

    expect(entitlementRepository.create).not.toHaveBeenCalled();
  });

  it('records a failed issuance and retries it with the same idempotency key', async () => {
    const entitlement = {
      id: 'entitlement-1',
      profileId,
      sessionId,
      idempotencyKey: `rare-reward:${sessionId}`,
      seasonId: 'season-1',
      status: RareRewardEntitlementStatus.PENDING,
      attempts: 0,
      processingStartedAt: null,
      issuedAt: null,
      lastError: null,
      outcome: null,
    } as RareRewardEntitlement;
    entitlementRepository.find.mockImplementation(() =>
      Promise.resolve(
        entitlement.status === RareRewardEntitlementStatus.ISSUED
          ? []
          : [entitlement],
      ),
    );
    entitlementRepository.findOne.mockResolvedValue(entitlement);
    rareRewardService.issueSessionRareRewards
      .mockRejectedValueOnce(new Error('relay unavailable'))
      .mockResolvedValueOnce({
        tokenSymbolAwarded: 'BUBL',
        tokenAmountAwarded: '1',
        weeklyTicketsIssued: 1,
        nftIdsAwarded: [],
        cosmeticIdsAwarded: [],
        tokenReward: null,
        nftRewards: [],
        cosmeticRewards: [],
      });

    await service.processPendingEntitlements();

    expect(entitlement).toMatchObject({
      status: RareRewardEntitlementStatus.FAILED,
      attempts: 1,
      lastError: 'relay unavailable',
    });

    await service.processPendingEntitlements();

    expect(entitlement).toMatchObject({
      status: RareRewardEntitlementStatus.ISSUED,
      attempts: 2,
      lastError: null,
      outcome: expect.objectContaining({ tokenSymbolAwarded: 'BUBL' }),
    });
    expect(rareRewardService.issueSessionRareRewards).toHaveBeenCalledTimes(2);
    expect(rareRewardService.issueSessionRareRewards).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        idempotencyKey: `rare-reward:${sessionId}`,
        seasonId: 'season-1',
      }),
    );
  });

  it('never calls the reward service again for an issued entitlement', async () => {
    const entitlement = {
      id: 'entitlement-1',
      profileId,
      sessionId,
      idempotencyKey: `rare-reward:${sessionId}`,
      status: RareRewardEntitlementStatus.ISSUED,
      attempts: 1,
      processingStartedAt: null,
      issuedAt: new Date(),
      lastError: null,
      outcome: {},
    } as RareRewardEntitlement;
    entitlementRepository.findOne.mockResolvedValue(entitlement);

    await service.issueEntitlement(entitlement.id);

    expect(rareRewardService.issueSessionRareRewards).not.toHaveBeenCalled();
  });
});
