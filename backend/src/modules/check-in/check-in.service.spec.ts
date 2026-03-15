import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { QualificationStatus } from '../qualification/entities/qualification-state.entity';
import { QualificationService } from '../qualification/qualification.service';
import { XpService } from '../rewards/xp.service';
import { CheckInRecord } from './entities/check-in-record.entity';
import { CheckInService } from './check-in.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('CheckInService', () => {
  let service: CheckInService;
  let checkInRepository: MockRepository<CheckInRecord>;
  let profileRepository: MockRepository<Profile>;
  let qualificationService: { processAfterDailyCheckIn: jest.Mock };
  let xpService: { grantXp: jest.Mock };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-14T10:00:00.000Z'));

    checkInRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    profileRepository = {
      findOne: jest.fn(),
      save: jest.fn(),
    };
    qualificationService = {
      processAfterDailyCheckIn: jest.fn(),
    };
    xpService = {
      grantXp: jest.fn(),
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
      ],
    }).compile();

    service = module.get<CheckInService>(CheckInService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('stores one check-in and starts streak for first day', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      currentStreak: 0,
      totalXp: 0,
    });
    checkInRepository
      .findOne!.mockResolvedValueOnce(null) // existing today
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
    });
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

  it('pauses rare reward access after missed day without deleting progression', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      currentStreak: 7,
      totalXp: 40,
    });
    checkInRepository
      .findOne!.mockResolvedValueOnce(null) // existing today
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
    );

    expect(result.success).toBe(true);
    expect(result.xpAwarded).toBe(20);
    expect(result.newStreak).toBe(1);
    expect(result.currentStreak).toBe(1);
    expect(result.qualificationStatus).toBe(QualificationStatus.PAUSED);
    expect(result.rareAccessActive).toBe(false);
    expect(result.rareRewardAccessActive).toBe(false);
  });

  it('throws if profile does not exist', async () => {
    profileRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.performDailyCheckIn('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
