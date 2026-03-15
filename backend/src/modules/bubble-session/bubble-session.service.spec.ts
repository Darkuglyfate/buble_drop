import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { QualificationStatus } from '../qualification/entities/qualification-state.entity';
import { QualificationService } from '../qualification/qualification.service';
import { RedisService } from '../../redis/redis.service';
import { RareRewardService } from '../rewards/rare-reward.service';
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
  let qualificationService: { evaluateProgress: jest.Mock };
  let rareRewardService: { issueSessionRareRewards: jest.Mock };
  let redisService: {
    getClient: jest.Mock;
  };
  let redisClient: {
    zadd: jest.Mock;
    zrange: jest.Mock;
    expire: jest.Mock;
    del: jest.Mock;
  };

  beforeEach(async () => {
    sessionRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
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
    };
    rareRewardService = {
      issueSessionRareRewards: jest.fn().mockResolvedValue({
        tokenSymbolAwarded: null,
        tokenAmountAwarded: '0',
        weeklyTicketsIssued: 0,
        nftIdsAwarded: [],
        cosmeticIdsAwarded: [],
        tokenReward: null,
        nftRewards: [],
        cosmeticRewards: [],
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
        { provide: RareRewardService, useValue: rareRewardService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    service = module.get<BubbleSessionService>(BubbleSessionService);
  });

  it('starts a session for an existing profile', async () => {
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
    sessionRepository.save!.mockResolvedValue({
      id: 'session-1',
      profileId: '11111111-1111-4111-8111-111111111111',
      startedAt: new Date('2026-03-14T10:00:00.000Z'),
    });

    const result = await service.startSession(
      '11111111-1111-4111-8111-111111111111',
    );
    expect(result.sessionId).toBe('session-1');
  });

  it('completes session and grants xp only for active play', async () => {
    const startedAt = new Date(Date.now() - 600_000);
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
      totalXp: 50,
    });
    sessionRepository.findOne!.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      profileId: '11111111-1111-4111-8111-111111111111',
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
    );

    expect(result.grantedXp).toBeGreaterThan(0);
    expect(result.totalXp).toBe(50 + result.grantedXp);
    expect(result.activeSeconds).toBe(360);
    expect(xpService.grantXp).toHaveBeenCalled();
    expect(result.qualificationStatus).toBe(QualificationStatus.IN_PROGRESS);
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
    expect(rareRewardService.issueSessionRareRewards).toHaveBeenCalledWith(
      expect.objectContaining({
        rareRewardAccessActive: false,
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
    );

    expect(result.grantedXp).toBe(0);
    expect(result.totalXp).toBe(80);
    expect(xpService.grantXp).toHaveBeenCalled();
    expect(result.qualificationStatus).toBe(QualificationStatus.IN_PROGRESS);
    expect(rareRewardService.issueSessionRareRewards).toHaveBeenCalledWith(
      expect.objectContaining({
        rareRewardAccessActive: false,
        isCompletionEligible: false,
      }),
    );
  });

  it('passes active rare reward access to reward runtime', async () => {
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
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
      totalXp: 120,
      currentStreak: 6,
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
    );

    expect(rareRewardService.issueSessionRareRewards).toHaveBeenCalledWith(
      expect.objectContaining({
        rareRewardAccessActive: true,
        isCompletionEligible: true,
      }),
    );
  });

  it('rejects second active session start', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    sessionRepository.findOne!.mockResolvedValue({
      id: 'session-open',
      isCompleted: false,
    });

    await expect(
      service.startSession('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws if profile is missing on completion', async () => {
    profileRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.completeSession(
        '11111111-1111-4111-8111-111111111111',
        '22222222-2222-4222-8222-222222222222',
        120,
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
    );

    expect(result.activeSeconds).toBe(12);
    expect(result.completionBonusXp).toBe(0);
    expect(redisClient.del).toHaveBeenCalled();
  });
});
