import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { CheckInRecord } from '../check-in/entities/check-in-record.entity';
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

  beforeEach(async () => {
    qualificationRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
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
      ],
    }).compile();

    service = module.get<QualificationService>(QualificationService);
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

  it('pauses and restores after new cycle when thresholds met since pause', async () => {
    const pausedAt = new Date('2026-03-10T00:00:00.000Z');
    qualificationRepository.findOne!.mockResolvedValueOnce({
      id: 'state-3',
      profileId: 'profile-1',
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
