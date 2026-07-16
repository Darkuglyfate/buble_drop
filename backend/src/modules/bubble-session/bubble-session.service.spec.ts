import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { SessionOutcomeOnchainService } from '../onchain-relay/session-outcome-onchain.service';
import { SeasonService } from '../partner-token/season.service';
import { Profile } from '../profile/entities/profile.entity';
import { QualificationStatus } from '../qualification/entities/qualification-state.entity';
import { QualificationService } from '../qualification/qualification.service';
import { RedisService } from '../../redis/redis.service';
import { RareRewardEntitlementStatus } from '../rewards/entities/rare-reward-entitlement.entity';
import { RareRewardEntitlementService } from '../rewards/rare-reward-entitlement.service';
import { XpService } from '../rewards/xp.service';
import { BubbleSession } from './entities/bubble-session.entity';
import { BubbleSessionService } from './bubble-session.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('BubbleSessionService', () => {
  let service: BubbleSessionService;
  let sessionRepository: MockRepository<BubbleSession>;
  let profileRepository: MockRepository<Profile>;
  let xpService: { grantXp: jest.Mock };
  let qualificationService: {
    evaluateProgress: jest.Mock;
    getSeasonProgress: jest.Mock;
  };
  let redisService: {
    getClient: jest.Mock;
  };
  let sessionOutcomeOnchainService: {
    recordOutcome: jest.Mock;
    getRelayStatus: jest.Mock;
    getSessionIdHash: jest.Mock;
  };
  let redisClient: {
    zadd: jest.Mock;
    zrange: jest.Mock;
    expire: jest.Mock;
    del: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let transactionManager: EntityManager;
  let rareRewardEntitlementService: {
    createForEligibleCompletedSession: jest.Mock;
    issueEntitlement: jest.Mock;
  };
  let seasonService: { getActiveSeason: jest.Mock };
  let sessionClaimQueryBuilder: {
    update: jest.Mock;
    set: jest.Mock;
    where: jest.Mock;
    execute: jest.Mock;
  };

  beforeEach(async () => {
    sessionRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    sessionClaimQueryBuilder = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    sessionRepository.createQueryBuilder = jest
      .fn()
      .mockReturnValue(sessionClaimQueryBuilder);
    profileRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    xpService = {
      grantXp: jest.fn(),
    };
    qualificationService = {
      evaluateProgress: jest.fn().mockResolvedValue({
        qualificationStatus: QualificationStatus.IN_PROGRESS,
        rareRewardAccessActive: false,
      }),
      getSeasonProgress: jest.fn().mockResolvedValue({
        qualificationStatus: QualificationStatus.IN_PROGRESS,
        eligibleAtSeasonEnd: false,
        streak: 0,
        xp: 0,
        activeSessions: 0,
        requiredStreak: 5,
        requiredXp: 300,
        requiredActiveSessions: 4,
      }),
    };
    redisClient = {
      zadd: jest.fn().mockResolvedValue(1),
      zrange: jest.fn().mockResolvedValue([]),
      expire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockResolvedValue(1),
    };
    redisService = {
      getClient: jest.fn().mockReturnValue(redisClient),
    };
    sessionOutcomeOnchainService = {
      recordOutcome: jest.fn().mockResolvedValue({
        txHash:
          '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
        submitted: true,
        relay: {
          action: 'session_outcome',
          relayKind: 'backend-sponsored',
          available: true,
          userPaysGas: false,
          reason: null,
        },
        sessionIdHash:
          '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        committedAt: '2026-03-14T10:10:00.000Z',
      }),
      getRelayStatus: jest.fn().mockReturnValue({
        action: 'session_outcome',
        relayKind: 'backend-sponsored',
        available: false,
        userPaysGas: false,
        reason: 'session outcome relay disabled',
      }),
      getSessionIdHash: jest.fn().mockReturnValue('0xsession'),
    };
    transactionManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === BubbleSession) {
          return sessionRepository;
        }
        throw new Error('Unexpected repository');
      }),
    } as unknown as EntityManager;
    dataSource = {
      transaction: jest.fn(
        (work: (manager: EntityManager) => Promise<unknown>) =>
          work(transactionManager),
      ),
    };
    rareRewardEntitlementService = {
      createForEligibleCompletedSession: jest.fn().mockResolvedValue(null),
      issueEntitlement: jest.fn().mockResolvedValue(null),
    };
    seasonService = {
      getActiveSeason: jest.fn().mockResolvedValue(null),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BubbleSessionService,
        {
          provide: getRepositoryToken(BubbleSession),
          useValue: sessionRepository,
        },
        { provide: getRepositoryToken(Profile), useValue: profileRepository },
        { provide: XpService, useValue: xpService },
        { provide: QualificationService, useValue: qualificationService },
        { provide: RedisService, useValue: redisService },
        {
          provide: SessionOutcomeOnchainService,
          useValue: sessionOutcomeOnchainService,
        },
        { provide: DataSource, useValue: dataSource },
        {
          provide: RareRewardEntitlementService,
          useValue: rareRewardEntitlementService,
        },
        { provide: SeasonService, useValue: seasonService },
      ],
    }).compile();

    service = module.get<BubbleSessionService>(BubbleSessionService);
  });

  it('defaults missing telemetry to zero before service processing', async () => {
    profileRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.completeSession(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        0,
        undefined as unknown as number,
        undefined as unknown as number,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(profileRepository.findOne).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['finalScore', 2_147_483_648, 0],
    ['bestCombo', 0, 2_147_483_648],
  ])(
    'rejects overflowing %s before Redis or transaction side effects',
    async (_field, finalScore, bestCombo) => {
      await expect(
        service.completeSession(
          '11111111-1111-4111-8111-111111111111',
          '22222222-2222-4222-8222-222222222222',
          0,
          finalScore,
          bestCombo,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(profileRepository.findOne).not.toHaveBeenCalled();
      expect(redisService.getClient).not.toHaveBeenCalled();
      expect(dataSource.transaction).not.toHaveBeenCalled();
    },
  );

  it('starts a session for an existing profile', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    sessionRepository.findOne!.mockResolvedValue(null);
    seasonService.getActiveSeason.mockResolvedValue({ id: 'season-1' });
    sessionRepository.create!.mockImplementation(
      (payload: Partial<BubbleSession>): Partial<BubbleSession> => payload,
    );
    sessionRepository.save!.mockResolvedValue({
      id: 'session-1',
      profileId: '11111111-1111-4111-8111-111111111111',
      startedAt: new Date('2026-03-14T10:00:00.000Z'),
    });

    const result = await service.startSession(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result.sessionId).toBe('session-1');
    expect(sessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ seasonId: 'season-1' }),
    );
  });

  it('stores a null season snapshot when no season is active', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    sessionRepository.findOne!.mockResolvedValue(null);
    sessionRepository.create!.mockImplementation(
      (payload: Partial<BubbleSession>): Partial<BubbleSession> => payload,
    );
    sessionRepository.save!.mockImplementation(async (session) => ({
      id: 'session-1',
      startedAt: new Date('2026-03-14T10:00:00.000Z'),
      ...session,
    }));

    await service.startSession('11111111-1111-4111-8111-111111111111');

    expect(sessionRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ seasonId: null }),
    );
  });

  it('completes session and grants xp only for active play', async () => {
    const startedAt = new Date(Date.now() - 600_000);
    profileRepository
      .findOne!.mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        nickname: 'ready',
        currentAvatarId: 'avatar-1',
        onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
        totalXp: 50,
        currentStreak: 0,
        wallet: {
          address: '0x1111111111111111111111111111111111111111',
        },
      })
      .mockResolvedValueOnce({ totalXp: 90 });
    sessionRepository.findOne!.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      profileId: '11111111-1111-4111-8111-111111111111',
      seasonId: 'season-session',
      startedAt,
      isCompleted: false,
      endedAt: null,
      activeSeconds: 0,
    });
    redisClient.zrange.mockResolvedValue(
      Array.from({ length: 30 }, (_, index) =>
        String(startedAt.getTime() + index * 12_000),
      ),
    );
    sessionRepository.save!.mockImplementation(
      (session: unknown): Promise<unknown> => Promise.resolve(session),
    );
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 40,
      remainingDailyCap: 60,
      grantedAllocations: [],
    });
    profileRepository.save!.mockImplementation(
      (profile: unknown): Promise<unknown> => Promise.resolve(profile),
    );

    const result = await service.completeSession(
      '11111111-1111-4111-8111-111111111111',
      '22222222-2222-4222-8222-222222222222',
      360,
      42,
      6,
    );

    expect(result.success).toBe(true);
    expect(result.xpAwarded).toBe(result.grantedXp);
    expect(result.newStreak).toBe(0);
    expect(result.rareAccessActive).toBe(false);
    expect(result.grantedXp).toBeGreaterThan(0);
    expect(result.totalXp).toBe(50 + result.grantedXp);
    expect(result.activeSeconds).toBe(360);
    expect(xpService.grantXp).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      expect.arrayContaining([
        expect.objectContaining({
          idempotencyKey:
            'session:22222222-2222-4222-8222-222222222222:session_reward_bubbles',
        }),
        expect.objectContaining({
          idempotencyKey:
            'session:22222222-2222-4222-8222-222222222222:session_active_play',
        }),
        expect.objectContaining({
          idempotencyKey:
            'session:22222222-2222-4222-8222-222222222222:session_completion_bonus',
        }),
        expect.objectContaining({
          idempotencyKey:
            'session:22222222-2222-4222-8222-222222222222:session_reserve_bonus',
        }),
      ]),
      undefined,
      transactionManager,
    );
    expect(result.qualificationStatus).toBe(QualificationStatus.IN_PROGRESS);
    expect(result.seasonProgress).toEqual({
      qualificationStatus: QualificationStatus.IN_PROGRESS,
      eligibleAtSeasonEnd: false,
      streak: 0,
      xp: 0,
      activeSessions: 0,
      requiredStreak: 5,
      requiredXp: 300,
      requiredActiveSessions: 4,
    });
    expect(qualificationService.evaluateProgress).toHaveBeenNthCalledWith(
      1,
      '11111111-1111-4111-8111-111111111111',
      'season-session',
      undefined,
      transactionManager,
    );
    expect(qualificationService.evaluateProgress).toHaveBeenNthCalledWith(
      2,
      '11111111-1111-4111-8111-111111111111',
      'season-session',
    );
    expect(qualificationService.getSeasonProgress).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      'season-session',
    );
    expect(result.rareRewardOutcome).toEqual({
      tokenSymbolAwarded: null,
      tokenAmountAwarded: '0',
      weeklyTicketsIssued: 0,
      nftIdsAwarded: [],
      cosmeticIdsAwarded: [],
      tokenReward: null,
      nftRewards: [],
      cosmeticRewards: [],
    });
    expect(result.finalScore).toBe(42);
    expect(result.bestCombo).toBe(6);
    expect(result.onchainCommit.submitted).toBe(true);
    expect(sessionOutcomeOnchainService.recordOutcome).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: '22222222-2222-4222-8222-222222222222',
        finalScore: 0,
        bestCombo: 0,
        xpGained: 40,
      }),
    );
  });

  it('creates an eligible entitlement with XP and starts issuance after committing', async () => {
    const startedAt = new Date(Date.now() - 600_000);
    const profile = {
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
      totalXp: 500,
      currentStreak: 8,
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    };
    profileRepository.findOne!.mockResolvedValue(profile);
    sessionRepository.findOne!.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      profileId: profile.id,
      startedAt,
      isCompleted: false,
      endedAt: null,
      activeSeconds: 0,
    });
    sessionRepository.save!.mockImplementation(
      (session: BubbleSession): Promise<BubbleSession> =>
        Promise.resolve(session),
    );
    redisClient.zrange.mockResolvedValue(
      Array.from({ length: 15 }, (_, index) =>
        String(startedAt.getTime() + index * 12_000),
      ),
    );
    qualificationService.evaluateProgress.mockResolvedValue({
      qualificationStatus: QualificationStatus.QUALIFIED,
      rareRewardAccessActive: true,
    });
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 70,
      remainingDailyCap: 30,
      grantedAllocations: [],
    });
    rareRewardEntitlementService.createForEligibleCompletedSession.mockResolvedValue(
      {
        id: 'entitlement-1',
        status: RareRewardEntitlementStatus.PENDING,
      },
    );
    rareRewardEntitlementService.issueEntitlement.mockResolvedValue({
      id: 'entitlement-1',
      status: RareRewardEntitlementStatus.ISSUED,
      outcome: {
        tokenSymbolAwarded: 'BUBL',
        tokenAmountAwarded: '1',
        weeklyTicketsIssued: 1,
        nftIdsAwarded: [],
        cosmeticIdsAwarded: [],
        tokenReward: null,
        nftRewards: [],
        cosmeticRewards: [],
      },
    });

    const result = await service.completeSession(
      profile.id,
      '33333333-3333-4333-8333-333333333333',
      300,
      42,
      6,
    );

    expect(
      rareRewardEntitlementService.createForEligibleCompletedSession,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        entityManager: transactionManager,
        profileId: profile.id,
        sessionId: '33333333-3333-4333-8333-333333333333',
        rareRewardAccessActive: true,
        isCompletionEligible: true,
      }),
    );
    expect(xpService.grantXp).toHaveBeenCalledWith(
      profile.id,
      expect.any(Array),
      undefined,
      transactionManager,
    );
    expect(rareRewardEntitlementService.issueEntitlement).toHaveBeenCalledWith(
      'entitlement-1',
    );
    expect(result.rareRewardOutcome.tokenSymbolAwarded).toBe('BUBL');
  });

  it('creates an entitlement when this completion qualifies the profile', async () => {
    const startedAt = new Date(Date.now() - 600_000);
    const profile = {
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
      totalXp: 280,
      currentStreak: 5,
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    };
    profileRepository.findOne!.mockResolvedValue(profile);
    sessionRepository.findOne!.mockResolvedValue({
      id: '34343434-3434-4434-8434-343434343434',
      profileId: profile.id,
      startedAt,
      isCompleted: false,
      endedAt: null,
      activeSeconds: 0,
    });
    sessionRepository.save!.mockImplementation(
      (session: BubbleSession): Promise<BubbleSession> =>
        Promise.resolve(session),
    );
    redisClient.zrange.mockResolvedValue(
      Array.from({ length: 15 }, (_, index) =>
        String(startedAt.getTime() + index * 12_000),
      ),
    );
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 70,
      remainingDailyCap: 30,
      grantedAllocations: [],
    });
    qualificationService.evaluateProgress.mockImplementation(
      async (
        _profileId: string,
        _seasonId: string | null,
        _existingState: unknown,
        entityManager?: EntityManager,
      ) => ({
        qualificationStatus:
          entityManager === transactionManager
            ? QualificationStatus.QUALIFIED
            : QualificationStatus.IN_PROGRESS,
        rareRewardAccessActive: entityManager === transactionManager,
      }),
    );
    rareRewardEntitlementService.createForEligibleCompletedSession.mockResolvedValue(
      null,
    );

    await service.completeSession(
      profile.id,
      '34343434-3434-4434-8434-343434343434',
      300,
      42,
      6,
    );

    expect(
      rareRewardEntitlementService.createForEligibleCompletedSession,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        entityManager: transactionManager,
        rareRewardAccessActive: true,
        isCompletionEligible: true,
      }),
    );
  });

  it('does not grant xp for idle presence', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
      totalXp: 80,
      currentStreak: 0,
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    });
    sessionRepository.findOne!.mockResolvedValue({
      id: '33333333-3333-4333-8333-333333333333',
      profileId: '11111111-1111-4111-8111-111111111111',
      startedAt: new Date(Date.now() - 600_000),
      isCompleted: false,
      endedAt: null,
      activeSeconds: 0,
    });
    sessionRepository.save!.mockImplementation(
      (session: unknown): Promise<unknown> => Promise.resolve(session),
    );
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 0,
      remainingDailyCap: 100,
      grantedAllocations: [],
    });

    const result = await service.completeSession(
      '11111111-1111-4111-8111-111111111111',
      '33333333-3333-4333-8333-333333333333',
      0,
      0,
      0,
    );

    expect(result.success).toBe(true);
    expect(result.xpAwarded).toBe(0);
    expect(result.newStreak).toBe(0);
    expect(result.rareAccessActive).toBe(false);
    expect(result.grantedXp).toBe(0);
    expect(result.totalXp).toBe(80);
    expect(xpService.grantXp).toHaveBeenCalled();
    expect(result.qualificationStatus).toBe(QualificationStatus.IN_PROGRESS);
    expect(result.seasonProgress.qualificationStatus).toBe(
      QualificationStatus.IN_PROGRESS,
    );
  });

  it('returns active rare reward access and season progress when qualified', async () => {
    const startedAt = new Date(Date.now() - 600_000);
    redisClient.zrange.mockResolvedValue(
      Array.from({ length: 25 }, (_, index) =>
        String(startedAt.getTime() + index * 12_000),
      ),
    );
    qualificationService.evaluateProgress.mockResolvedValue({
      qualificationStatus: QualificationStatus.QUALIFIED,
      rareRewardAccessActive: true,
    });
    qualificationService.getSeasonProgress.mockResolvedValue({
      qualificationStatus: QualificationStatus.QUALIFIED,
      eligibleAtSeasonEnd: true,
      streak: 6,
      xp: 320,
      activeSessions: 4,
      requiredStreak: 5,
      requiredXp: 300,
      requiredActiveSessions: 4,
    });
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
      totalXp: 120,
      currentStreak: 6,
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    });
    sessionRepository.findOne!.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      profileId: '11111111-1111-4111-8111-111111111111',
      startedAt,
      isCompleted: false,
      endedAt: null,
      activeSeconds: 0,
    });
    sessionRepository.save!.mockImplementation(
      (session: unknown): Promise<unknown> => Promise.resolve(session),
    );
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 70,
      remainingDailyCap: 30,
      grantedAllocations: [],
    });
    profileRepository.save!.mockImplementation(
      (profile: unknown): Promise<unknown> => Promise.resolve(profile),
    );

    await service.completeSession(
      '11111111-1111-4111-8111-111111111111',
      '44444444-4444-4444-8444-444444444444',
      300,
      55,
      8,
    );

    expect(qualificationService.getSeasonProgress).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      null,
    );
  });

  it('returns existing active session when one is already open', async () => {
    const startedAt = new Date('2026-03-15T11:50:00.000Z');
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    sessionRepository.findOne!.mockResolvedValue({
      id: '44444444-4444-4444-8444-444444444444',
      profileId: '11111111-1111-4111-8111-111111111111',
      startedAt,
      isCompleted: false,
    });

    const result = await service.startSession(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result).toEqual({
      sessionId: '44444444-4444-4444-8444-444444444444',
      profileId: '11111111-1111-4111-8111-111111111111',
      startedAt,
    });
  });

  it('keeps a failed session completion retryable by sharing its transaction with XP', async () => {
    const startedAt = new Date(Date.now() - 600_000);
    profileRepository
      .findOne!.mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        nickname: 'ready',
        currentAvatarId: 'avatar-1',
        onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
        totalXp: 0,
        currentStreak: 0,
      })
      .mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        nickname: 'ready',
        currentAvatarId: 'avatar-1',
        onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
        totalXp: 0,
        currentStreak: 0,
      })
      .mockResolvedValueOnce({ totalXp: 0 });
    sessionRepository
      .findOne!.mockResolvedValueOnce({
        id: '55555555-5555-4555-8555-555555555555',
        profileId: '11111111-1111-4111-8111-111111111111',
        startedAt,
        isCompleted: false,
        endedAt: null,
        activeSeconds: 0,
      })
      .mockResolvedValueOnce({
        id: '55555555-5555-4555-8555-555555555555',
        profileId: '11111111-1111-4111-8111-111111111111',
        startedAt,
        isCompleted: false,
        endedAt: null,
        activeSeconds: 0,
      });
    sessionRepository.save!.mockImplementation(
      (session: BubbleSession): Promise<BubbleSession> =>
        Promise.resolve(session),
    );
    redisClient.zrange.mockResolvedValue([
      String(startedAt.getTime()),
      String(startedAt.getTime() + 12_000),
    ]);
    xpService.grantXp
      .mockRejectedValueOnce(new Error('xp persistence failed'))
      .mockResolvedValueOnce({
        grantedTotal: 0,
        remainingDailyCap: 100,
        grantedAllocations: [],
      });

    await expect(
      service.completeSession(
        '11111111-1111-4111-8111-111111111111',
        '55555555-5555-4555-8555-555555555555',
        0,
        0,
        0,
      ),
    ).rejects.toThrow('xp persistence failed');

    expect(redisClient.del).not.toHaveBeenCalled();

    const retried = await service.completeSession(
      '11111111-1111-4111-8111-111111111111',
      '55555555-5555-4555-8555-555555555555',
      120,
      0,
      0,
    );

    expect(retried.success).toBe(true);
    expect(retried.activeSeconds).toBe(24);
    expect(redisClient.zrange).toHaveBeenCalledTimes(2);
    expect(redisClient.del).toHaveBeenCalledTimes(1);
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(xpService.grantXp).toHaveBeenNthCalledWith(
      1,
      '11111111-1111-4111-8111-111111111111',
      expect.any(Array),
      undefined,
      transactionManager,
    );
  });

  it('allows only one concurrent completion to claim the open session before XP', async () => {
    const startedAt = new Date(Date.now() - 600_000);
    const profile = {
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
      totalXp: 0,
      currentStreak: 0,
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    };
    profileRepository.findOne!.mockResolvedValue(profile);
    sessionRepository.findOne!.mockImplementation(
      (): BubbleSession =>
        ({
          id: '55555555-5555-4555-8555-555555555555',
          profileId: profile.id,
          startedAt,
          isCompleted: false,
          endedAt: null,
          activeSeconds: 0,
        }) as BubbleSession,
    );
    sessionRepository.save!.mockImplementation(
      (session: BubbleSession): Promise<BubbleSession> =>
        Promise.resolve(session),
    );
    sessionClaimQueryBuilder.execute
      .mockResolvedValueOnce({ affected: 1 })
      .mockResolvedValueOnce({ affected: 0 });
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 0,
      remainingDailyCap: 100,
      grantedAllocations: [],
    });

    const completions = await Promise.allSettled([
      service.completeSession(
        profile.id,
        '55555555-5555-4555-8555-555555555555',
        0,
        0,
        0,
      ),
      service.completeSession(
        profile.id,
        '55555555-5555-4555-8555-555555555555',
        0,
        0,
        0,
      ),
    ]);

    expect(
      completions.filter((result) => result.status === 'fulfilled'),
    ).toHaveLength(1);
    const rejectedCompletion = completions.find(
      (result) => result.status === 'rejected',
    );
    expect(rejectedCompletion).toMatchObject({
      reason: expect.any(ConflictException),
    });
    expect(xpService.grantXp).toHaveBeenCalledTimes(1);
    expect(sessionOutcomeOnchainService.recordOutcome).toHaveBeenCalledTimes(1);
    expect(sessionClaimQueryBuilder.where).toHaveBeenCalledWith(
      '"id" = :sessionId AND "profileId" = :profileId AND "isCompleted" = false',
      {
        sessionId: '55555555-5555-4555-8555-555555555555',
        profileId: profile.id,
      },
    );
  });

  it('throws if profile is missing on completion', async () => {
    profileRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.completeSession(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        120,
        10,
        2,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects session completion when onboarding is incomplete', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: null,
      currentAvatarId: null,
      onboardingCompletedAt: null,
    });

    await expect(
      service.completeSession(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        120,
        10,
        2,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(sessionRepository.findOne).not.toHaveBeenCalled();
  });

  it('rejects session start when onboarding is incomplete', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: null,
      currentAvatarId: null,
      onboardingCompletedAt: null,
    });

    await expect(
      service.startSession('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(sessionRepository.findOne).not.toHaveBeenCalled();
  });

  it('records activity signals on the backend for active sessions', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    sessionRepository.findOne!.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      profileId: '11111111-1111-4111-8111-111111111111',
      isCompleted: false,
    });

    const result = await service.recordActivitySignal(
      '11111111-1111-4111-8111-111111111111',
      '55555555-5555-4555-8555-555555555555',
    );

    expect(result.sessionId).toBe('55555555-5555-4555-8555-555555555555');
    expect(redisClient.zadd).toHaveBeenCalled();
    expect(redisClient.expire).toHaveBeenCalled();
  });

  it('does not fail activity recording when redis is unavailable', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    sessionRepository.findOne!.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      profileId: '11111111-1111-4111-8111-111111111111',
      isCompleted: false,
    });
    redisClient.zadd.mockRejectedValue(new Error('redis down'));

    const result = await service.recordActivitySignal(
      '11111111-1111-4111-8111-111111111111',
      '55555555-5555-4555-8555-555555555555',
    );

    expect(result.sessionId).toBe('55555555-5555-4555-8555-555555555555');
    expect(redisClient.zadd).toHaveBeenCalled();
  });

  it('rejects session activity recording when onboarding is incomplete', async () => {
    sessionRepository.findOne!.mockResolvedValue({
      id: '55555555-5555-4555-8555-555555555555',
      profileId: '11111111-1111-4111-8111-111111111111',
      isCompleted: false,
    });
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: null,
      currentAvatarId: null,
      onboardingCompletedAt: null,
    });

    await expect(
      service.recordActivitySignal(
        '11111111-1111-4111-8111-111111111111',
        '55555555-5555-4555-8555-555555555555',
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(redisClient.zadd).not.toHaveBeenCalled();
  });

  it('caps active seconds by backend-recorded activity buckets', async () => {
    const startedAt = new Date(Date.now() - 600_000);
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
      totalXp: 10,
      currentStreak: 3,
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    });
    sessionRepository.findOne!.mockResolvedValue({
      id: '66666666-6666-4666-8666-666666666666',
      profileId: '11111111-1111-4111-8111-111111111111',
      startedAt,
      isCompleted: false,
      endedAt: null,
      activeSeconds: 0,
    });
    redisClient.zrange.mockResolvedValue([
      String(startedAt.getTime()),
      String(startedAt.getTime() + 1_000),
      String(startedAt.getTime() + 2_000),
    ]);
    redisClient.del.mockRejectedValue(new Error('redis cleanup failed'));
    sessionRepository.save!.mockImplementation(
      (session: unknown): Promise<unknown> => Promise.resolve(session),
    );
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 0,
      remainingDailyCap: 100,
      grantedAllocations: [],
    });

    const result = await service.completeSession(
      '11111111-1111-4111-8111-111111111111',
      '66666666-6666-4666-8666-666666666666',
      300,
      33,
      4,
    );

    expect(result.success).toBe(true);
    expect(result.xpAwarded).toBe(0);
    expect(result.newStreak).toBe(3);
    expect(result.rareAccessActive).toBe(false);
    expect(result.activeSeconds).toBe(12);
    expect(result.completionBonusXp).toBe(0);
    expect(redisClient.del).toHaveBeenCalled();
  });

  it('fails closed to zero reward activity when redis replay fails', async () => {
    const startedAt = new Date(Date.now() - 600_000);
    profileRepository
      .findOne!.mockResolvedValueOnce({
        id: '11111111-1111-4111-8111-111111111111',
        nickname: 'ready',
        currentAvatarId: 'avatar-1',
        onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
        totalXp: 15,
        currentStreak: 4,
        wallet: {
          address: '0x1111111111111111111111111111111111111111',
        },
      })
      .mockResolvedValueOnce({ totalXp: 15 });
    sessionRepository.findOne!.mockResolvedValue({
      id: '77777777-7777-4777-8777-777777777777',
      profileId: '11111111-1111-4111-8111-111111111111',
      startedAt,
      isCompleted: false,
      endedAt: null,
      activeSeconds: 0,
    });
    redisClient.zrange.mockRejectedValue(new Error('redis down'));
    sessionRepository.save!.mockImplementation(
      (session: unknown): Promise<unknown> => Promise.resolve(session),
    );
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 0,
      remainingDailyCap: 100,
      grantedAllocations: [],
    });
    profileRepository.save!.mockImplementation(
      (profile: unknown): Promise<unknown> => Promise.resolve(profile),
    );

    const result = await service.completeSession(
      '11111111-1111-4111-8111-111111111111',
      '77777777-7777-4777-8777-777777777777',
      120,
      24,
      3,
    );

    expect(result.success).toBe(true);
    expect(result.xpAwarded).toBe(0);
    expect(result.newStreak).toBe(4);
    expect(result.rareAccessActive).toBe(false);
    expect(result.activeSeconds).toBe(0);
    expect(result.totalXp).toBe(15);
    expect(redisClient.zrange).toHaveBeenCalled();
  });
});
