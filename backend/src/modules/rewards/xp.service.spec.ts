import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { RewardEvent, RewardEventType } from './entities/reward-event.entity';
import { XpService, XpSource } from './xp.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('XpService', () => {
  let service: XpService;
  let dataSource: { transaction: jest.Mock };
  let rewardEventRepository: MockRepository<RewardEvent>;
  let profileRepository: MockRepository<Profile>;

  beforeEach(async () => {
    rewardEventRepository = {
      find: jest.fn(),
      create: jest.fn(
        (payload: Record<string, unknown>): Record<string, unknown> => payload,
      ),
      save: jest.fn(),
    };
    profileRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const manager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === RewardEvent) {
          return rewardEventRepository;
        }
        if (entity === Profile) {
          return profileRepository;
        }
        throw new Error('Unexpected repository');
      }),
    };
    dataSource = {
      transaction: jest.fn(
        async (work: (transactionManager: EntityManager) => Promise<unknown>) =>
          work(manager as EntityManager),
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XpService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
        {
          provide: getRepositoryToken(RewardEvent),
          useValue: rewardEventRepository,
        },
        {
          provide: getRepositoryToken(Profile),
          useValue: profileRepository,
        },
      ],
    }).compile();

    service = module.get<XpService>(XpService);
  });

  it('returns the original grant for a duplicate key without updating total XP twice', async () => {
    const profile = { id: 'profile-1', totalXp: 10 } as Profile;
    profileRepository.findOne!.mockResolvedValue(profile);
    rewardEventRepository
      .find!.mockResolvedValueOnce([
        {
          profileId: 'profile-1',
          eventType: RewardEventType.XP,
          xpAmount: 20,
          idempotencyKey: 'check-in:profile-1:2026-03-14',
          metadata: {
            source: XpSource.DAILY_CHECK_IN,
            requestedAmount: 20,
          },
        },
      ])
      .mockResolvedValueOnce([{ xpAmount: 20 }]);

    const result = await service.grantXp('profile-1', [
      {
        source: XpSource.DAILY_CHECK_IN,
        amount: 20,
        idempotencyKey: 'check-in:profile-1:2026-03-14',
      },
    ]);

    expect(result).toEqual({
      grantedTotal: 20,
      remainingDailyCap: 80,
      grantedAllocations: [
        {
          source: XpSource.DAILY_CHECK_IN,
          requestedAmount: 20,
          grantedAmount: 20,
        },
      ],
    });
    expect(rewardEventRepository.save).not.toHaveBeenCalled();
    expect(profileRepository.save).not.toHaveBeenCalled();
    expect(profile.totalXp).toBe(10);
  });

  it('serializes daily cap calculation behind a pessimistic profile lock', async () => {
    const profile = { id: 'profile-1', totalXp: 40 } as Profile;
    profileRepository.findOne!.mockResolvedValue(profile);
    profileRepository.save!.mockImplementation(
      (item: Profile): Promise<Profile> => Promise.resolve(item),
    );
    rewardEventRepository
      .find!.mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ xpAmount: 90 }, { xpAmount: -40 }]);
    rewardEventRepository.save!.mockImplementation(
      (items: RewardEvent[]): Promise<RewardEvent[]> => Promise.resolve(items),
    );

    const result = await service.grantXp('profile-1', [
      {
        source: XpSource.SESSION_ACTIVE_PLAY,
        amount: 20,
        seasonId: '11111111-1111-4111-8111-111111111111',
        idempotencyKey: 'session:session-1:session_active_play',
      },
    ]);

    expect(result.grantedTotal).toBe(10);
    expect(result.remainingDailyCap).toBe(0);
    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(profileRepository.findOne).toHaveBeenCalledWith({
      where: { id: 'profile-1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(profileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ totalXp: 50 }),
    );
    expect(rewardEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        seasonId: '11111111-1111-4111-8111-111111111111',
      }),
    );
  });

  it('rejects an idempotency retry with a different season snapshot', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      totalXp: 20,
    } as Profile);
    rewardEventRepository.find!.mockResolvedValue([
      {
        profileId: 'profile-1',
        seasonId: '11111111-1111-4111-8111-111111111111',
        eventType: RewardEventType.XP,
        xpAmount: 20,
        idempotencyKey: 'session:session-1:session_active_play',
        metadata: {
          source: XpSource.SESSION_ACTIVE_PLAY,
          requestedAmount: 20,
        },
      },
    ]);

    await expect(
      service.grantXp('profile-1', [
        {
          source: XpSource.SESSION_ACTIVE_PLAY,
          amount: 20,
          seasonId: '22222222-2222-4222-8222-222222222222',
          idempotencyKey: 'session:session-1:session_active_play',
        },
      ]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects a duplicate key that belongs to an incompatible grant', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      totalXp: 0,
    } as Profile);
    rewardEventRepository.find!.mockResolvedValue([
      {
        profileId: 'another-profile',
        eventType: RewardEventType.XP,
        xpAmount: 20,
        idempotencyKey: 'check-in:profile-1:2026-03-14',
        metadata: {
          source: XpSource.DAILY_CHECK_IN,
          requestedAmount: 20,
        },
      },
    ]);

    await expect(
      service.grantXp('profile-1', [
        {
          source: XpSource.DAILY_CHECK_IN,
          amount: 20,
          idempotencyKey: 'check-in:profile-1:2026-03-14',
        },
      ]),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('applies a daily check-in reversal without reducing total XP below zero', async () => {
    const profile = { id: 'profile-1', totalXp: 7 } as Profile;
    profileRepository.findOne!.mockResolvedValue(profile);
    profileRepository.save!.mockImplementation(
      (item: Profile): Promise<Profile> => Promise.resolve(item),
    );
    rewardEventRepository
      .find!.mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ xpAmount: 90 }]);
    rewardEventRepository.save!.mockImplementation(
      (items: RewardEvent[]): Promise<RewardEvent[]> => Promise.resolve(items),
    );

    const result = await service.grantXp('profile-1', [
      {
        source: XpSource.DAILY_CHECK_IN_REORG_REVERSAL,
        amount: -20,
        idempotencyKey: 'check-in-reversal:profile-1:2026-03-14',
      },
    ]);

    expect(result).toEqual({
      grantedTotal: -7,
      remainingDailyCap: 10,
      grantedAllocations: [
        {
          source: XpSource.DAILY_CHECK_IN_REORG_REVERSAL,
          requestedAmount: -20,
          grantedAmount: -7,
        },
      ],
    });
    expect(rewardEventRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        xpAmount: -7,
        idempotencyKey: 'check-in-reversal:profile-1:2026-03-14',
      }),
    );
    expect(profileRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({ totalXp: 0 }),
    );
  });

  it('uses a half-open UTC day range that excludes the next-day microsecond boundary', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      totalXp: 0,
    } as Profile);
    rewardEventRepository
      .find!.mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.grantXp(
      'profile-1',
      [
        {
          source: XpSource.DAILY_CHECK_IN,
          amount: 1,
          idempotencyKey: 'check-in:profile-1:2026-03-14',
        },
      ],
      new Date('2026-03-14T23:59:59.999Z'),
    );

    const dailyCapQuery = rewardEventRepository.find!.mock.calls[1][0] as {
      where: {
        createdAt: {
          _type: string;
          _value: Array<{ _type: string; _value: Date }>;
        };
      };
    };
    const [startBoundary, nextDayBoundary] =
      dailyCapQuery.where.createdAt._value;

    expect(dailyCapQuery.where.createdAt._type).toBe('and');
    expect(startBoundary).toMatchObject({
      _type: 'moreThanOrEqual',
      _value: new Date('2026-03-14T00:00:00.000Z'),
    });
    expect(nextDayBoundary).toMatchObject({
      _type: 'lessThan',
      _value: new Date('2026-03-15T00:00:00.000Z'),
    });
  });

  it('returns the persisted compatible grant after a concurrent idempotency conflict', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      totalXp: 0,
    } as Profile);
    rewardEventRepository
      .find!.mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          profileId: 'profile-1',
          eventType: RewardEventType.XP,
          xpAmount: 20,
          idempotencyKey: 'check-in:profile-1:2026-03-14',
          metadata: {
            source: XpSource.DAILY_CHECK_IN,
            requestedAmount: 20,
          },
        },
      ])
      .mockResolvedValueOnce([{ xpAmount: 20 }]);
    rewardEventRepository.save!.mockRejectedValueOnce({
      driverError: { code: '23505' },
    });

    await expect(
      service.grantXp('profile-1', [
        {
          source: XpSource.DAILY_CHECK_IN,
          amount: 20,
          idempotencyKey: 'check-in:profile-1:2026-03-14',
        },
      ]),
    ).resolves.toEqual({
      grantedTotal: 20,
      remainingDailyCap: 80,
      grantedAllocations: [
        {
          source: XpSource.DAILY_CHECK_IN,
          requestedAmount: 20,
          grantedAmount: 20,
        },
      ],
    });
  });

  it('maps an incompatible concurrent idempotency conflict to ConflictException', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      totalXp: 0,
    } as Profile);
    rewardEventRepository
      .find!.mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          profileId: 'another-profile',
          eventType: RewardEventType.XP,
          xpAmount: 20,
          idempotencyKey: 'check-in:profile-1:2026-03-14',
          metadata: {
            source: XpSource.DAILY_CHECK_IN,
            requestedAmount: 20,
          },
        },
      ])
      .mockResolvedValueOnce([]);
    rewardEventRepository.save!.mockRejectedValueOnce({
      driverError: { code: '23505' },
    });

    await expect(
      service.grantXp('profile-1', [
        {
          source: XpSource.DAILY_CHECK_IN,
          amount: 20,
          idempotencyKey: 'check-in:profile-1:2026-03-14',
        },
      ]),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
