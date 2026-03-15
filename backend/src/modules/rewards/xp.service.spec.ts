import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RewardEvent } from './entities/reward-event.entity';
import { XpService, XpSource } from './xp.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('XpService', () => {
  let service: XpService;
  let rewardEventRepository: MockRepository<RewardEvent>;

  beforeEach(async () => {
    rewardEventRepository = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        XpService,
        {
          provide: getRepositoryToken(RewardEvent),
          useValue: rewardEventRepository,
        },
      ],
    }).compile();

    service = module.get<XpService>(XpService);
  });

  it('applies daily cap across multiple sources', async () => {
    rewardEventRepository.find!.mockResolvedValue([{ xpAmount: 90 }]);
    rewardEventRepository.create!.mockImplementation(
      (payload: Record<string, unknown>): Record<string, unknown> => payload,
    );
    rewardEventRepository.save!.mockImplementation(
      (items: unknown): Promise<unknown> => Promise.resolve(items),
    );

    const result = await service.grantXp('profile-1', [
      { source: XpSource.DAILY_CHECK_IN, amount: 20 },
      { source: XpSource.SESSION_ACTIVE_PLAY, amount: 20 },
    ]);

    expect(result.grantedTotal).toBe(10);
    expect(result.remainingDailyCap).toBe(0);
    expect(result.grantedAllocations).toEqual([
      {
        source: XpSource.DAILY_CHECK_IN,
        requestedAmount: 20,
        grantedAmount: 10,
      },
      {
        source: XpSource.SESSION_ACTIVE_PLAY,
        requestedAmount: 20,
        grantedAmount: 0,
      },
    ]);
  });
});
