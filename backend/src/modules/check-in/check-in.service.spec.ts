import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { SeasonService } from '../partner-token/season.service';
import { QualificationStatus } from '../qualification/entities/qualification-state.entity';
import { QualificationService } from '../qualification/qualification.service';
import {
  RewardEvent,
  RewardEventType,
} from '../rewards/entities/reward-event.entity';
import { XpService } from '../rewards/xp.service';
import { CheckInRecord } from './entities/check-in-record.entity';
import { CheckInReceiptVerifier } from './check-in-receipt-verifier.service';
import { CheckInService } from './check-in.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('CheckInService', () => {
  let service: CheckInService;
  let checkInRepository: MockRepository<CheckInRecord>;
  let profileRepository: MockRepository<Profile>;
  let rewardEventRepository: MockRepository<RewardEvent>;
  let qualificationService: {
    processAfterDailyCheckIn: jest.Mock;
    evaluateProgress: jest.Mock;
  };
  let xpService: { grantXp: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let transactionManager: EntityManager;
  let checkInReceiptVerifier: {
    verify: jest.Mock;
    isCanonical: jest.Mock;
  };
  let seasonService: { getActiveSeason: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-14T10:00:00.000Z'));

    checkInRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
    };
    profileRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    rewardEventRepository = {
      findOne: jest.fn(),
    };
    qualificationService = {
      processAfterDailyCheckIn: jest.fn(),
      evaluateProgress: jest.fn(),
    };
    xpService = {
      grantXp: jest.fn(),
    };
    seasonService = {
      getActiveSeason: jest.fn().mockResolvedValue(null),
    };
    transactionManager = {
      getRepository: jest.fn((entity: unknown) => {
        if (entity === CheckInRecord) {
          return checkInRepository;
        }
        if (entity === Profile) {
          return profileRepository;
        }
        if (entity === RewardEvent) {
          return rewardEventRepository;
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
    checkInReceiptVerifier = {
      verify: jest.fn().mockResolvedValue({
        chainId: 8453,
        txLogIndex: 7,
        blockNumber: '100',
        blockHash:
          '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        confirmedAt: new Date('2026-03-14T10:00:00.000Z'),
      }),
      isCanonical: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckInService,
        {
          provide: getRepositoryToken(CheckInRecord),
          useValue: checkInRepository,
        },
        { provide: getRepositoryToken(Profile), useValue: profileRepository },
        { provide: QualificationService, useValue: qualificationService },
        { provide: XpService, useValue: xpService },
        { provide: SeasonService, useValue: seasonService },
        { provide: DataSource, useValue: dataSource },
        { provide: CheckInReceiptVerifier, useValue: checkInReceiptVerifier },
      ],
    }).compile();

    service = module.get<CheckInService>(CheckInService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores one check-in and starts streak for first day', async () => {
    seasonService.getActiveSeason.mockResolvedValue({ id: 'season-1' });
    profileRepository.findOne!.mockImplementation((options: unknown) => {
      const query = options as {
        lock?: unknown;
        relations?: { wallet?: boolean };
      };
      if (query.lock || query.relations?.wallet) {
        return Promise.resolve({
          id: '11111111-1111-4111-8111-111111111111',
          currentStreak: 0,
          totalXp: 0,
          wallet: {
            address: '0x1111111111111111111111111111111111111111',
          },
        });
      }
      return Promise.resolve({ totalXp: 20 });
    });
    checkInRepository
      .findOne!.mockResolvedValueOnce(null) // existing today
      .mockResolvedValueOnce(null) // transactionally locked existing today
      .mockResolvedValueOnce(null); // last record
    profileRepository.save!.mockImplementation(
      (profile: unknown): Promise<unknown> => Promise.resolve(profile),
    );
    checkInRepository.create!.mockImplementation(
      (payload: Partial<CheckInRecord>): Partial<CheckInRecord> => payload,
    );
    checkInRepository.save!.mockImplementation(
      (record: Record<string, unknown>): Promise<Record<string, unknown>> =>
        Promise.resolve({
          id: 'record-1',
          ...record,
        }),
    );
    qualificationService.processAfterDailyCheckIn.mockResolvedValue({
      qualificationStatus: QualificationStatus.IN_PROGRESS,
      rareRewardAccessActive: false,
    });
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 20,
      remainingDailyCap: 80,
      grantedAllocations: [],
    });

    const result = await service.performDailyCheckIn(
      '11111111-1111-4111-8111-111111111111',
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    );

    expect(result).toEqual({
      success: true,
      profileId: '11111111-1111-4111-8111-111111111111',
      checkInDate: '2026-03-14',
      xpAwarded: 20,
      newStreak: 1,
      totalXp: 20,
      rareAccessActive: false,
      currentStreak: 1,
      qualificationStatus: QualificationStatus.IN_PROGRESS,
      rareRewardAccessActive: false,
      onchain: {
        mode: 'user-paid',
        txHash:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      },
    });
    expect(checkInRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        chainId: 8453,
        txLogIndex: 7,
        blockNumber: '100',
        blockHash:
          '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        confirmedAt: expect.any(Date),
        status: 'confirmed',
      }),
    );
    expect(xpService.grantXp).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      [
        expect.objectContaining({
          idempotencyKey:
            'check-in:11111111-1111-4111-8111-111111111111:2026-03-14:0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:7',
          seasonId: 'season-1',
        }),
      ],
      undefined,
      transactionManager,
    );
    expect(seasonService.getActiveSeason).toHaveBeenCalledWith(
      expect.any(Date),
      transactionManager,
    );
    expect(qualificationService.processAfterDailyCheckIn).toHaveBeenCalledWith(
      '11111111-1111-4111-8111-111111111111',
      false,
      'season-1',
    );
  });

  it('keeps a failed check-in retryable by sharing its transaction with XP', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      currentStreak: 0,
      totalXp: 20,
    });
    checkInRepository.findOne!.mockResolvedValue(null);
    profileRepository.save!.mockImplementation(
      (profile: unknown): Promise<unknown> => Promise.resolve(profile),
    );
    checkInRepository.create!.mockImplementation(
      (payload: Partial<CheckInRecord>): Partial<CheckInRecord> => payload,
    );
    checkInRepository.save!.mockImplementation(
      (record: CheckInRecord): Promise<CheckInRecord> =>
        Promise.resolve(record),
    );
    qualificationService.processAfterDailyCheckIn.mockResolvedValue({
      qualificationStatus: QualificationStatus.IN_PROGRESS,
      rareRewardAccessActive: false,
    });
    xpService.grantXp
      .mockRejectedValueOnce(new Error('xp persistence failed'))
      .mockResolvedValueOnce({
        grantedTotal: 20,
        remainingDailyCap: 80,
        grantedAllocations: [],
      });

    await expect(
      service.performDailyCheckIn('11111111-1111-4111-8111-111111111111'),
    ).rejects.toThrow('xp persistence failed');

    const retried = await service.performDailyCheckIn(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(retried.xpAwarded).toBe(20);
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(xpService.grantXp).toHaveBeenNthCalledWith(
      1,
      '11111111-1111-4111-8111-111111111111',
      [expect.objectContaining({ seasonId: null })],
      undefined,
      transactionManager,
    );
  });

  it('rejects an unverified Base transaction before awarding daily check-in XP', async () => {
    checkInReceiptVerifier.verify.mockRejectedValue(
      new Error('Daily check-in transaction is not verified'),
    );
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      currentStreak: 0,
      totalXp: 0,
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    });
    profileRepository.save!.mockImplementation(
      (profile: unknown): Promise<unknown> => Promise.resolve(profile),
    );
    checkInRepository.create!.mockImplementation(
      (payload: Partial<CheckInRecord>): Partial<CheckInRecord> => payload,
    );
    checkInRepository.save!.mockImplementation(
      (record: CheckInRecord): Promise<CheckInRecord> =>
        Promise.resolve(record),
    );
    qualificationService.processAfterDailyCheckIn.mockResolvedValue({
      qualificationStatus: QualificationStatus.IN_PROGRESS,
      rareRewardAccessActive: false,
    });
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 20,
      remainingDailyCap: 80,
      grantedAllocations: [],
    });

    await expect(
      service.performDailyCheckIn(
        '11111111-1111-4111-8111-111111111111',
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      ),
    ).rejects.toThrow('Daily check-in transaction is not verified');

    expect(xpService.grantXp).not.toHaveBeenCalled();
  });

  it('rejects duplicate check-in on the same day', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      currentStreak: 2,
    });
    checkInRepository.findOne!.mockResolvedValueOnce({
      id: 'already',
      profileId: '11111111-1111-4111-8111-111111111111',
      checkInDate: '2026-03-14',
    });

    await expect(
      service.performDailyCheckIn('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('orphans a reorged record once, reverses its XP, and accepts a valid replacement', async () => {
    seasonService.getActiveSeason.mockResolvedValue({ id: 'season-current' });
    const profile = {
      id: '11111111-1111-4111-8111-111111111111',
      currentStreak: 1,
      totalXp: 20,
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    };
    const orphanedRecord = {
      id: 'record-1',
      profileId: profile.id,
      checkInDate: '2026-03-14',
      txHash:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 8453,
      txLogIndex: 7,
      blockNumber: '100',
      blockHash:
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      status: 'confirmed',
    };
    let activeSameDayRecord: typeof orphanedRecord | null = orphanedRecord;

    profileRepository.findOne!.mockResolvedValue(profile);
    profileRepository.save!.mockImplementation(
      (item: Profile): Promise<Profile> => Promise.resolve(item),
    );
    checkInRepository.findOne!.mockImplementation((options: unknown) => {
      const where = (options as { where?: Record<string, unknown> }).where;
      if (where?.checkInDate) {
        return Promise.resolve(activeSameDayRecord);
      }
      return Promise.resolve(null);
    });
    checkInRepository.update = jest.fn(async () => {
      activeSameDayRecord = null;
      return { affected: 1 };
    });
    checkInRepository.create!.mockImplementation(
      (payload: Partial<CheckInRecord>): Partial<CheckInRecord> => payload,
    );
    checkInRepository.save!.mockImplementation(
      (record: CheckInRecord): Promise<CheckInRecord> =>
        Promise.resolve(record),
    );
    checkInReceiptVerifier.isCanonical.mockResolvedValue(false);
    checkInReceiptVerifier.verify.mockResolvedValueOnce({
      chainId: 8453,
      txLogIndex: 8,
      blockNumber: '102',
      blockHash:
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      confirmedAt: new Date('2026-03-14T10:00:00.000Z'),
    });
    rewardEventRepository.findOne!.mockResolvedValue({
      profileId: profile.id,
      seasonId: 'season-old',
      eventType: RewardEventType.XP,
      xpAmount: 20,
      idempotencyKey: `check-in:${profile.id}:2026-03-14:${orphanedRecord.txHash}:7`,
    });
    xpService.grantXp
      .mockResolvedValueOnce({
        grantedTotal: -20,
        remainingDailyCap: 80,
        grantedAllocations: [],
      })
      .mockResolvedValueOnce({
        grantedTotal: 20,
        remainingDailyCap: 80,
        grantedAllocations: [],
      });
    qualificationService.evaluateProgress.mockResolvedValue({
      qualificationStatus: QualificationStatus.IN_PROGRESS,
      rareRewardAccessActive: false,
    });
    qualificationService.processAfterDailyCheckIn.mockResolvedValue({
      qualificationStatus: QualificationStatus.IN_PROGRESS,
      rareRewardAccessActive: false,
    });

    await expect(
      service.performDailyCheckIn(
        profile.id,
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ),
    ).resolves.toMatchObject({
      checkInDate: '2026-03-14',
      xpAwarded: 20,
    });

    expect(checkInRepository.update).toHaveBeenCalledWith(
      { id: orphanedRecord.id, status: 'confirmed' },
      { status: 'orphaned' },
    );
    expect(checkInReceiptVerifier.isCanonical).toHaveBeenCalledWith({
      walletAddress: profile.wallet.address,
      checkInDate: '2026-03-14',
      txHash: orphanedRecord.txHash,
      chainId: 8453,
      txLogIndex: 7,
      blockNumber: '100',
      blockHash:
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    });
    expect(
      checkInReceiptVerifier.isCanonical.mock.invocationCallOrder[0],
    ).toBeLessThan(dataSource.transaction.mock.invocationCallOrder[0]);
    expect(xpService.grantXp).toHaveBeenNthCalledWith(
      1,
      profile.id,
      [
        expect.objectContaining({
          source: 'daily_check_in_reorg_reversal',
          amount: -20,
          seasonId: 'season-old',
          idempotencyKey: `check-in-reversal:${profile.id}:2026-03-14:${orphanedRecord.id}`,
        }),
      ],
      undefined,
      transactionManager,
    );
    expect(xpService.grantXp).toHaveBeenNthCalledWith(
      2,
      profile.id,
      [
        expect.objectContaining({
          seasonId: 'season-current',
          idempotencyKey: `check-in:${profile.id}:2026-03-14:0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb:8`,
        }),
      ],
      undefined,
      transactionManager,
    );
    expect(profile.currentStreak).toBe(1);
    expect(checkInRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        txHash:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        txLogIndex: 8,
        blockNumber: '102',
        status: 'confirmed',
      }),
    );
  });

  it('reverses only the cap-limited XP granted to an orphaned check-in', async () => {
    const profile = {
      id: '11111111-1111-4111-8111-111111111111',
      currentStreak: 1,
      totalXp: 100,
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    };
    const confirmedRecord = {
      id: 'record-1',
      profileId: profile.id,
      checkInDate: '2026-03-14',
      txHash:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 8453,
      txLogIndex: 7,
      blockNumber: '100',
      blockHash:
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      status: 'confirmed',
    };
    let activeSameDayRecord: typeof confirmedRecord | null = confirmedRecord;

    profileRepository.findOne!.mockResolvedValue(profile);
    checkInRepository.findOne!.mockImplementation((options: unknown) => {
      const where = (options as { where?: Record<string, unknown> }).where;
      return Promise.resolve(where?.checkInDate ? activeSameDayRecord : null);
    });
    checkInRepository.update!.mockImplementation(async () => {
      activeSameDayRecord = null;
      return { affected: 1 };
    });
    checkInRepository.create!.mockImplementation(
      (payload: Partial<CheckInRecord>): Partial<CheckInRecord> => payload,
    );
    checkInRepository.save!.mockImplementation(
      (record: CheckInRecord): Promise<CheckInRecord> =>
        Promise.resolve(record),
    );
    checkInReceiptVerifier.isCanonical.mockResolvedValue(false);
    checkInReceiptVerifier.verify.mockResolvedValue({
      chainId: 8453,
      txLogIndex: 8,
      blockNumber: '102',
      blockHash:
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      confirmedAt: new Date('2026-03-14T10:00:00.000Z'),
    });
    rewardEventRepository.findOne!.mockResolvedValue({
      profileId: profile.id,
      eventType: RewardEventType.XP,
      xpAmount: 10,
      idempotencyKey: `check-in:${profile.id}:2026-03-14:${confirmedRecord.txHash}:7`,
    });
    xpService.grantXp
      .mockResolvedValueOnce({
        grantedTotal: -10,
        remainingDailyCap: 0,
        grantedAllocations: [],
      })
      .mockResolvedValueOnce({
        grantedTotal: 0,
        remainingDailyCap: 0,
        grantedAllocations: [],
      });
    qualificationService.processAfterDailyCheckIn.mockResolvedValue({
      qualificationStatus: QualificationStatus.IN_PROGRESS,
      rareRewardAccessActive: false,
    });

    await service.performDailyCheckIn(
      profile.id,
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );

    expect(rewardEventRepository.findOne).toHaveBeenCalledWith({
      where: {
        profileId: profile.id,
        eventType: RewardEventType.XP,
        idempotencyKey: `check-in:${profile.id}:2026-03-14:${confirmedRecord.txHash}:7`,
      },
      select: ['xpAmount', 'seasonId'],
    });
    expect(xpService.grantXp).toHaveBeenNthCalledWith(
      1,
      profile.id,
      [
        expect.objectContaining({
          source: 'daily_check_in_reorg_reversal',
          amount: -10,
        }),
      ],
      undefined,
      transactionManager,
    );
  });

  it('does not issue a second reversal after another request already orphaned the record', async () => {
    const profile = {
      id: '11111111-1111-4111-8111-111111111111',
      currentStreak: 1,
      totalXp: 20,
      wallet: {
        address: '0x1111111111111111111111111111111111111111',
      },
    };
    const confirmedRecord = {
      id: 'record-1',
      profileId: profile.id,
      checkInDate: '2026-03-14',
      txHash:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      chainId: 8453,
      txLogIndex: 7,
      blockNumber: '100',
      blockHash:
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      status: 'confirmed',
    };

    profileRepository.findOne!.mockResolvedValue(profile);
    checkInRepository.findOne!.mockResolvedValue(confirmedRecord);
    checkInRepository.update!.mockResolvedValue({ affected: 0 });
    checkInReceiptVerifier.isCanonical.mockResolvedValue(false);
    checkInReceiptVerifier.verify.mockResolvedValue({
      chainId: 8453,
      txLogIndex: 8,
      blockNumber: '102',
      blockHash:
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      confirmedAt: new Date('2026-03-14T10:00:00.000Z'),
    });

    await expect(
      service.performDailyCheckIn(
        profile.id,
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      ),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(xpService.grantXp).not.toHaveBeenCalled();
    expect(checkInRepository.create).not.toHaveBeenCalled();
  });

  it('pauses rare reward access after missed day without deleting progression', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      currentStreak: 7,
      totalXp: 40,
    });
    checkInRepository
      .findOne!.mockResolvedValueOnce(null) // existing today
      .mockResolvedValueOnce(null) // transactionally locked existing today
      .mockResolvedValueOnce({
        id: 'last-record',
        profileId: '11111111-1111-4111-8111-111111111111',
        checkInDate: '2026-03-12',
      }); // missed 1 day
    profileRepository.save!.mockImplementation(
      (profile: unknown): Promise<unknown> => Promise.resolve(profile),
    );
    checkInRepository.create!.mockImplementation(
      (payload: Partial<CheckInRecord>): Partial<CheckInRecord> => payload,
    );
    checkInRepository.save!.mockImplementation(
      (record: Record<string, unknown>): Promise<Record<string, unknown>> =>
        Promise.resolve({
          id: 'record-2',
          ...record,
        }),
    );
    qualificationService.processAfterDailyCheckIn.mockResolvedValue({
      qualificationStatus: QualificationStatus.PAUSED,
      rareRewardAccessActive: false,
    });
    xpService.grantXp.mockResolvedValue({
      grantedTotal: 20,
      remainingDailyCap: 80,
      grantedAllocations: [],
    });

    const result = await service.performDailyCheckIn(
      '11111111-1111-4111-8111-111111111111',
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );

    expect(result.success).toBe(true);
    expect(result.xpAwarded).toBe(20);
    expect(result.newStreak).toBe(1);
    expect(result.currentStreak).toBe(1);
    expect(result.qualificationStatus).toBe(QualificationStatus.PAUSED);
    expect(result.rareAccessActive).toBe(false);
    expect(result.rareRewardAccessActive).toBe(false);
    expect(result.onchain).toEqual({
      mode: 'user-paid',
      txHash:
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
  });

  it('throws if profile does not exist', async () => {
    profileRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.performDailyCheckIn('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
