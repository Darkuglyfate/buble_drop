import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { CheckInRecord } from '../check-in/entities/check-in-record.entity';
import { SeasonService } from '../partner-token/season.service';
import { Profile } from '../profile/entities/profile.entity';
import {
  RewardEvent,
  RewardEventType,
} from '../rewards/entities/reward-event.entity';
import {
  QualificationState,
  QualificationStatus,
} from './entities/qualification-state.entity';
import { QualificationService } from './qualification.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('QualificationService', () => {
  let service: QualificationService;
  let qualificationRepository: MockRepository<QualificationState>;
  let profileRepository: MockRepository<Profile>;
  let sessionRepository: MockRepository<BubbleSession>;
  let rewardEventRepository: MockRepository<RewardEvent>;
  let checkInRepository: MockRepository<CheckInRecord>;
  let seasonService: { getActiveSeason: jest.Mock };
  let insertQueryBuilder: {
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    orIgnore: jest.Mock;
    execute: jest.Mock;
  };

  beforeEach(async () => {
    insertQueryBuilder = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ identifiers: [] }),
    };
    qualificationRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
      createQueryBuilder: jest.fn().mockReturnValue(insertQueryBuilder),
    };
    profileRepository = {
      findOne: jest.fn(),
    };
    sessionRepository = {
      count: jest.fn(),
    };
    rewardEventRepository = {
      find: jest.fn(),
    };
    checkInRepository = {
      findOne: jest.fn(),
    };
    seasonService = {
      getActiveSeason: jest.fn().mockResolvedValue({ id: 'season-current' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualificationService,
        {
          provide: getRepositoryToken(QualificationState),
          useValue: qualificationRepository,
        },
        { provide: getRepositoryToken(Profile), useValue: profileRepository },
        {
          provide: getRepositoryToken(BubbleSession),
          useValue: sessionRepository,
        },
        {
          provide: getRepositoryToken(RewardEvent),
          useValue: rewardEventRepository,
        },
        {
          provide: getRepositoryToken(CheckInRecord),
          useValue: checkInRepository,
        },
        { provide: SeasonService, useValue: seasonService },
      ],
    }).compile();

    service = module.get<QualificationService>(QualificationService);
  });

  it('atomically inserts or ignores and rereads the concurrent winner without overwriting it', async () => {
    const concurrentWinner = {
      id: 'state-winner',
      profileId: 'profile-1',
      seasonId: 'season-current',
      status: QualificationStatus.QUALIFIED,
      qualifiedAt: new Date('2026-03-14T10:00:00.000Z'),
      pausedAt: null,
      restoredAt: null,
    };
    qualificationRepository.findOne!.mockResolvedValue(concurrentWinner);
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      currentStreak: 0,
    });
    checkInRepository.findOne!.mockResolvedValue(null);

    const result = await service.evaluateProgress(
      'profile-1',
      'season-current',
    );

    expect(insertQueryBuilder.insert).toHaveBeenCalledTimes(1);
    expect(insertQueryBuilder.into).toHaveBeenCalledWith(QualificationState);
    expect(insertQueryBuilder.values).toHaveBeenCalledWith({
      profileId: 'profile-1',
      seasonId: 'season-current',
      status: QualificationStatus.LOCKED,
      qualifiedAt: null,
      pausedAt: null,
      restoredAt: null,
    });
    expect(insertQueryBuilder.orIgnore).toHaveBeenCalledTimes(1);
    expect(insertQueryBuilder.execute).toHaveBeenCalledTimes(1);
    expect(qualificationRepository.findOne).toHaveBeenCalledWith({
      where: { profileId: 'profile-1', seasonId: 'season-current' },
    });
    expect(qualificationRepository.save).not.toHaveBeenCalled();
    expect(result).toEqual({
      qualificationStatus: QualificationStatus.QUALIFIED,
      rareRewardAccessActive: true,
    });
    expect(concurrentWinner.qualifiedAt).toEqual(
      new Date('2026-03-14T10:00:00.000Z'),
    );
  });

  it('ignores previous-season XP and sessions when evaluating the current season', async () => {
    qualificationRepository.findOne!.mockResolvedValue({
      id: 'state-current',
      profileId: 'profile-1',
      seasonId: 'season-current',
      status: QualificationStatus.LOCKED,
      pausedAt: null,
    });
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      currentStreak: 5,
    });
    rewardEventRepository.find!.mockImplementation((options: unknown) => {
      const where = (options as { where: { seasonId?: string } }).where;
      return Promise.resolve(
        where.seasonId === 'season-current' ? [] : [{ xpAmount: 300 }],
      );
    });
    sessionRepository.count!.mockImplementation((options: unknown) => {
      const where = (options as { where: { seasonId?: string } }).where;
      return Promise.resolve(where.seasonId === 'season-current' ? 0 : 4);
    });
    checkInRepository.findOne!.mockResolvedValue(null);
    qualificationRepository.save!.mockImplementation(
      (state: unknown): Promise<unknown> => Promise.resolve(state),
    );

    const result = await service.evaluateProgress('profile-1');

    expect(result.qualificationStatus).toBe(QualificationStatus.IN_PROGRESS);
    expect(result.rareRewardAccessActive).toBe(false);
  });

  it('creates a fresh state for a new season instead of reusing a legacy null-season row', async () => {
    qualificationRepository.findOne!.mockImplementation((options: unknown) => {
      const where = (options as { where: { seasonId?: string } }).where;
      return Promise.resolve(
        where.seasonId === 'season-current'
          ? {
              id: 'new-season-state',
              profileId: 'profile-1',
              seasonId: 'season-current',
              status: QualificationStatus.LOCKED,
              qualifiedAt: null,
              pausedAt: null,
              restoredAt: null,
            }
          : {
              id: 'legacy-state',
              profileId: 'profile-1',
              seasonId: null,
              status: QualificationStatus.QUALIFIED,
            },
      );
    });
    qualificationRepository.save!.mockImplementation(
      (state: unknown): Promise<unknown> => Promise.resolve(state),
    );
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      currentStreak: 0,
    });
    rewardEventRepository.find!.mockResolvedValue([]);
    sessionRepository.count!.mockResolvedValue(0);
    checkInRepository.findOne!.mockResolvedValue(null);

    const result = await service.evaluateProgress('profile-1');

    expect(result.qualificationStatus).toBe(QualificationStatus.IN_PROGRESS);
    expect(qualificationRepository.findOne).toHaveBeenCalledWith({
      where: { profileId: 'profile-1', seasonId: 'season-current' },
    });
    expect(insertQueryBuilder.values).toHaveBeenCalledWith({
      profileId: 'profile-1',
      seasonId: 'season-current',
      status: QualificationStatus.LOCKED,
      qualifiedAt: null,
      pausedAt: null,
      restoredAt: null,
    });
  });

  it('returns locked progress without querying lifetime data when no season is active', async () => {
    seasonService.getActiveSeason.mockResolvedValue(null);

    const qualification = await service.evaluateProgress('profile-1');
    const result = await service.getSeasonProgress('profile-1');

    expect(qualification).toEqual({
      qualificationStatus: QualificationStatus.LOCKED,
      rareRewardAccessActive: false,
    });
    expect(result).toEqual({
      qualificationStatus: QualificationStatus.LOCKED,
      eligibleAtSeasonEnd: false,
      streak: 0,
      xp: 0,
      activeSessions: 0,
      requiredStreak: 5,
      requiredXp: 300,
      requiredActiveSessions: 4,
    });
    expect(profileRepository.findOne).not.toHaveBeenCalled();
    expect(rewardEventRepository.find).not.toHaveBeenCalled();
    expect(sessionRepository.count).not.toHaveBeenCalled();
  });

  it('moves LOCKED to IN_PROGRESS when thresholds are not met', async () => {
    qualificationRepository.findOne!.mockResolvedValue({
      id: 'state-1',
      profileId: 'profile-1',
      status: QualificationStatus.LOCKED,
      pausedAt: null,
    });
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      currentStreak: 5,
    });
    rewardEventRepository.find!.mockResolvedValue([{ xpAmount: 50 }]);
    sessionRepository.count!.mockResolvedValue(1);
    checkInRepository.findOne!.mockResolvedValue({ checkInDate: '2026-03-14' });
    qualificationRepository.save!.mockImplementation(
      (state: unknown): Promise<unknown> => Promise.resolve(state),
    );

    const result = await service.evaluateProgress('profile-1');

    expect(result.qualificationStatus).toBe(QualificationStatus.IN_PROGRESS);
    expect(result.rareRewardAccessActive).toBe(false);
  });

  it('moves IN_PROGRESS to QUALIFIED when thresholds are met', async () => {
    qualificationRepository.findOne!.mockResolvedValue({
      id: 'state-2',
      profileId: 'profile-1',
      status: QualificationStatus.IN_PROGRESS,
      pausedAt: null,
    });
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      currentStreak: 5,
    });
    rewardEventRepository.find!.mockResolvedValue([
      { xpAmount: 100 },
      { xpAmount: 100 },
      { xpAmount: 100 },
    ]);
    sessionRepository.count!.mockResolvedValue(4);
    checkInRepository.findOne!.mockResolvedValue({ checkInDate: '2026-03-14' });
    qualificationRepository.save!.mockImplementation(
      (state: unknown): Promise<unknown> => Promise.resolve(state),
    );

    const result = await service.evaluateProgress('profile-1');

    expect(result.qualificationStatus).toBe(QualificationStatus.QUALIFIED);
    expect(result.rareRewardAccessActive).toBe(true);
  });

  it('evaluates completion progress with repositories from the supplied transaction', async () => {
    qualificationRepository.findOne!.mockResolvedValue({
      id: 'state-transaction',
      profileId: 'profile-1',
      status: QualificationStatus.IN_PROGRESS,
      pausedAt: null,
    });
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      currentStreak: 5,
    });
    rewardEventRepository.find!.mockResolvedValue([
      { xpAmount: 100 },
      { xpAmount: 100 },
      { xpAmount: 100 },
    ]);
    sessionRepository.count!.mockResolvedValue(4);
    checkInRepository.findOne!.mockResolvedValue({ checkInDate: '2026-03-14' });
    qualificationRepository.save!.mockImplementation(
      (state: unknown): Promise<unknown> => Promise.resolve(state),
    );
    const transactionGetRepository = jest.fn((entity: unknown) => {
      if (entity === QualificationState) {
        return qualificationRepository;
      }
      if (entity === Profile) {
        return profileRepository;
      }
      if (entity === BubbleSession) {
        return sessionRepository;
      }
      if (entity === RewardEvent) {
        return rewardEventRepository;
      }
      if (entity === CheckInRecord) {
        return checkInRepository;
      }
      throw new Error('Unexpected repository');
    });
    const transactionManager = {
      getRepository: transactionGetRepository,
    } as unknown as EntityManager;

    const result = await service.evaluateProgress(
      'profile-1',
      'season-current',
      undefined,
      transactionManager,
    );

    expect(result.qualificationStatus).toBe(QualificationStatus.QUALIFIED);
    expect(transactionGetRepository).toHaveBeenCalledWith(Profile);
    expect(transactionGetRepository).toHaveBeenCalledWith(QualificationState);
    expect(transactionGetRepository).toHaveBeenCalledWith(BubbleSession);
    expect(transactionGetRepository).toHaveBeenCalledWith(RewardEvent);
    expect(transactionGetRepository).toHaveBeenCalledWith(CheckInRecord);
  });

  it('pauses and restores after new cycle when thresholds met since pause', async () => {
    const pausedAt = new Date('2026-03-10T00:00:00.000Z');
    qualificationRepository.findOne!.mockResolvedValueOnce({
      id: 'state-3',
      profileId: 'profile-1',
      seasonId: 'season-current',
      status: QualificationStatus.QUALIFIED,
      pausedAt: null,
    });
    qualificationRepository.save!.mockImplementation(
      (state: unknown): Promise<unknown> => Promise.resolve(state),
    );
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      currentStreak: 1,
    });
    rewardEventRepository.find!.mockResolvedValue([{ xpAmount: 300 }]);
    sessionRepository.count!.mockResolvedValue(4);
    checkInRepository.findOne!.mockResolvedValue({ checkInDate: '2026-03-14' });

    const pausedSnapshot = await service.processAfterDailyCheckIn(
      'profile-1',
      true,
    );
    expect(pausedSnapshot.qualificationStatus).toBe(QualificationStatus.PAUSED);
    expect(pausedSnapshot.rareRewardAccessActive).toBe(false);

    qualificationRepository.findOne!.mockResolvedValueOnce({
      id: 'state-4',
      profileId: 'profile-1',
      seasonId: 'season-current',
      status: QualificationStatus.PAUSED,
      pausedAt,
    });
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      currentStreak: 5,
    });
    rewardEventRepository.find!.mockResolvedValue([
      { xpAmount: 300, eventType: RewardEventType.XP },
    ]);
    sessionRepository.count!.mockResolvedValue(4);
    checkInRepository.findOne!.mockResolvedValue({ checkInDate: '2026-03-14' });

    const restoredSnapshot = await service.evaluateProgress('profile-1');
    expect(restoredSnapshot.qualificationStatus).toBe(
      QualificationStatus.RESTORED,
    );
    expect(restoredSnapshot.rareRewardAccessActive).toBe(true);
  });

  it('pauses rare reward access on read when daily check-in is missed', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-14T12:00:00.000Z'));

    qualificationRepository.findOne!.mockResolvedValue({
      id: 'state-5',
      profileId: 'profile-1',
      status: QualificationStatus.QUALIFIED,
      pausedAt: null,
    });
    profileRepository.findOne!.mockResolvedValue({
      id: 'profile-1',
      currentStreak: 10,
    });
    checkInRepository.findOne!.mockResolvedValue({ checkInDate: '2026-03-12' });
    rewardEventRepository.find!.mockResolvedValue([]);
    sessionRepository.count!.mockResolvedValue(0);
    qualificationRepository.save!.mockImplementation(
      (state: unknown): Promise<unknown> => Promise.resolve(state),
    );

    const snapshot = await service.evaluateProgress('profile-1');

    expect(snapshot.qualificationStatus).toBe(QualificationStatus.PAUSED);
    expect(snapshot.rareRewardAccessActive).toBe(false);

    jest.useRealTimers();
  });
});
