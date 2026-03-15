import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClaimableTokenBalance } from '../claim/entities/claimable-token-balance.entity';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { Season } from '../partner-token/entities/season.entity';
import { CosmeticDefinition } from '../profile/entities/cosmetic-definition.entity';
import { NftDefinition } from '../profile/entities/nft-definition.entity';
import { ProfileCosmeticUnlock } from '../profile/entities/profile-cosmetic-unlock.entity';
import { ProfileNftOwnership } from '../profile/entities/profile-nft-ownership.entity';
import { Profile } from '../profile/entities/profile.entity';
import { RewardEvent } from './entities/reward-event.entity';
import { WeeklyTokenTicket } from './entities/weekly-token-ticket.entity';
import { RareRewardService } from './rare-reward.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;

describe('RareRewardService', () => {
  let service: RareRewardService;
  let seasonRepository: MockRepository<Season>;
  let partnerTokenRepository: MockRepository<PartnerToken>;
  let claimableBalanceRepository: MockRepository<ClaimableTokenBalance>;
  let weeklyTokenTicketRepository: MockRepository<WeeklyTokenTicket>;
  let nftDefinitionRepository: MockRepository<NftDefinition>;
  let profileNftOwnershipRepository: MockRepository<ProfileNftOwnership>;
  let cosmeticDefinitionRepository: MockRepository<CosmeticDefinition>;
  let profileCosmeticUnlockRepository: MockRepository<ProfileCosmeticUnlock>;
  let bubbleSessionRepository: MockRepository<BubbleSession>;
  let rewardEventRepository: MockRepository<RewardEvent>;

  beforeEach(async () => {
    seasonRepository = {
      findOne: jest.fn(),
    };
    partnerTokenRepository = {
      findOne: jest.fn(),
    };
    claimableBalanceRepository = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    weeklyTokenTicketRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    nftDefinitionRepository = {
      find: jest.fn(),
    };
    profileNftOwnershipRepository = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    cosmeticDefinitionRepository = {
      find: jest.fn(),
    };
    profileCosmeticUnlockRepository = {
      find: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    bubbleSessionRepository = {
      count: jest.fn(),
    };
    rewardEventRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };

    const passthroughCreate = <T extends object>(
      payload: Partial<T>,
    ): Partial<T> => payload;
    claimableBalanceRepository.create!.mockImplementation(passthroughCreate);
    weeklyTokenTicketRepository.create!.mockImplementation(passthroughCreate);
    profileNftOwnershipRepository.create!.mockImplementation(passthroughCreate);
    profileCosmeticUnlockRepository.create!.mockImplementation(
      passthroughCreate,
    );
    rewardEventRepository.create!.mockImplementation(
      (payload: Partial<RewardEvent>): Partial<RewardEvent> => payload,
    );
    claimableBalanceRepository.save!.mockImplementation(
      (payload: unknown): Promise<unknown> => Promise.resolve(payload),
    );
    weeklyTokenTicketRepository.save!.mockImplementation(
      (payload: unknown): Promise<unknown> => Promise.resolve(payload),
    );
    profileNftOwnershipRepository.save!.mockImplementation(
      (payload: unknown): Promise<unknown> => Promise.resolve(payload),
    );
    profileCosmeticUnlockRepository.save!.mockImplementation(
      (payload: unknown): Promise<unknown> => Promise.resolve(payload),
    );
    rewardEventRepository.save!.mockImplementation(
      (payload: unknown): Promise<unknown> => Promise.resolve(payload),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RareRewardService,
        { provide: getRepositoryToken(Season), useValue: seasonRepository },
        {
          provide: getRepositoryToken(PartnerToken),
          useValue: partnerTokenRepository,
        },
        {
          provide: getRepositoryToken(ClaimableTokenBalance),
          useValue: claimableBalanceRepository,
        },
        {
          provide: getRepositoryToken(WeeklyTokenTicket),
          useValue: weeklyTokenTicketRepository,
        },
        {
          provide: getRepositoryToken(NftDefinition),
          useValue: nftDefinitionRepository,
        },
        {
          provide: getRepositoryToken(ProfileNftOwnership),
          useValue: profileNftOwnershipRepository,
        },
        {
          provide: getRepositoryToken(CosmeticDefinition),
          useValue: cosmeticDefinitionRepository,
        },
        {
          provide: getRepositoryToken(ProfileCosmeticUnlock),
          useValue: profileCosmeticUnlockRepository,
        },
        {
          provide: getRepositoryToken(BubbleSession),
          useValue: bubbleSessionRepository,
        },
        {
          provide: getRepositoryToken(RewardEvent),
          useValue: rewardEventRepository,
        },
      ],
    }).compile();

    service = module.get<RareRewardService>(RareRewardService);
  });

  it('issues token, nft, and cosmetic rewards for an eligible qualified session', async () => {
    seasonRepository.findOne!.mockResolvedValue({
      id: 'season-1',
      isActive: true,
    });
    partnerTokenRepository.findOne!.mockResolvedValue({
      id: 'token-1',
      seasonId: 'season-1',
      symbol: 'BUBL',
    });
    claimableBalanceRepository.findOne!.mockResolvedValue(null);
    nftDefinitionRepository.find!.mockResolvedValue([
      {
        id: 'nft-1',
        key: 'genesis-spark',
        minStreak: 3,
        minXp: 100,
        minSessions: 1,
        dropChancePercent: '100.00',
      },
    ]);
    profileNftOwnershipRepository.find!.mockResolvedValue([]);
    bubbleSessionRepository.count!.mockResolvedValue(1);
    cosmeticDefinitionRepository.find!.mockResolvedValue([
      {
        id: 'cosmetic-1',
        key: 'glossy-aura',
        minStreak: 3,
        minXp: 100,
      },
    ]);
    profileCosmeticUnlockRepository.find!.mockResolvedValue([]);

    const result = await service.issueSessionRareRewards({
      profile: {
        id: 'profile-1',
        totalXp: 140,
        currentStreak: 4,
      } as Profile,
      session: {
        id: 'session-1',
        startedAt: new Date('2026-03-14T10:00:00.000Z'),
        endedAt: new Date('2026-03-14T10:10:00.000Z'),
      } as BubbleSession,
      rareRewardAccessActive: true,
      isCompletionEligible: true,
    });

    expect(result).toEqual({
      tokenSymbolAwarded: 'BUBL',
      tokenAmountAwarded: '1',
      weeklyTicketsIssued: 1,
      nftIdsAwarded: ['nft-1'],
      cosmeticIdsAwarded: ['cosmetic-1'],
      tokenReward: {
        tokenSymbol: 'BUBL',
        tokenAmountAwarded: '1',
        weeklyTicketsIssued: 1,
        seasonId: 'season-1',
        weekStartDate: '2026-03-09',
      },
      nftRewards: [{ id: 'nft-1', key: 'genesis-spark' }],
      cosmeticRewards: [{ id: 'cosmetic-1', key: 'glossy-aura' }],
    });
    expect(claimableBalanceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: 'profile-1',
        tokenSymbol: 'BUBL',
        claimableAmount: '1',
      }),
    );
    expect(profileNftOwnershipRepository.save).toHaveBeenCalledTimes(1);
    expect(profileCosmeticUnlockRepository.save).toHaveBeenCalledTimes(1);
    expect(rewardEventRepository.save).toHaveBeenCalledTimes(3);
  });

  it('skips issuance when session is not eligible or access is inactive', async () => {
    const result = await service.issueSessionRareRewards({
      profile: {
        id: 'profile-1',
        totalXp: 140,
        currentStreak: 4,
      } as Profile,
      session: {
        id: 'session-1',
        startedAt: new Date('2026-03-14T10:00:00.000Z'),
        endedAt: new Date('2026-03-14T10:10:00.000Z'),
      } as BubbleSession,
      rareRewardAccessActive: false,
      isCompletionEligible: true,
    });

    expect(result).toEqual({
      tokenSymbolAwarded: null,
      tokenAmountAwarded: '0',
      weeklyTicketsIssued: 0,
      nftIdsAwarded: [],
      cosmeticIdsAwarded: [],
      tokenReward: null,
      nftRewards: [],
      cosmeticRewards: [],
    });
    expect(claimableBalanceRepository.save).not.toHaveBeenCalled();
    expect(rewardEventRepository.save).not.toHaveBeenCalled();
  });

  it('increments existing token balance and avoids duplicate unlocks', async () => {
    seasonRepository.findOne!.mockResolvedValue({
      id: 'season-1',
      isActive: true,
    });
    partnerTokenRepository.findOne!.mockResolvedValue({
      id: 'token-1',
      seasonId: 'season-1',
      symbol: 'BUBL',
    });
    claimableBalanceRepository.findOne!.mockResolvedValue({
      id: 'balance-1',
      profileId: 'profile-1',
      tokenSymbol: 'BUBL',
      claimableAmount: '10',
    });
    nftDefinitionRepository.find!.mockResolvedValue([
      {
        id: 'nft-1',
        key: 'genesis-spark',
        minStreak: 3,
        minXp: 100,
        minSessions: 1,
        dropChancePercent: '100.00',
      },
    ]);
    profileNftOwnershipRepository.find!.mockResolvedValue([
      { nftDefinitionId: 'nft-1' },
    ]);
    bubbleSessionRepository.count!.mockResolvedValue(5);
    cosmeticDefinitionRepository.find!.mockResolvedValue([
      {
        id: 'cosmetic-1',
        key: 'glossy-aura',
        minStreak: 3,
        minXp: 100,
      },
    ]);
    profileCosmeticUnlockRepository.find!.mockResolvedValue([
      { cosmeticDefinitionId: 'cosmetic-1' },
    ]);

    const result = await service.issueSessionRareRewards({
      profile: {
        id: 'profile-1',
        totalXp: 500,
        currentStreak: 6,
      } as Profile,
      session: {
        id: 'session-2',
        startedAt: new Date('2026-03-14T10:00:00.000Z'),
        endedAt: new Date('2026-03-14T10:10:00.000Z'),
      } as BubbleSession,
      rareRewardAccessActive: true,
      isCompletionEligible: true,
    });

    expect(result).toEqual({
      tokenSymbolAwarded: 'BUBL',
      tokenAmountAwarded: '1',
      weeklyTicketsIssued: 1,
      nftIdsAwarded: [],
      cosmeticIdsAwarded: [],
      tokenReward: {
        tokenSymbol: 'BUBL',
        tokenAmountAwarded: '1',
        weeklyTicketsIssued: 1,
        seasonId: 'season-1',
        weekStartDate: '2026-03-09',
      },
      nftRewards: [],
      cosmeticRewards: [],
    });
    expect(claimableBalanceRepository.save).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'balance-1',
        claimableAmount: '11',
      }),
    );
    expect(profileNftOwnershipRepository.save).not.toHaveBeenCalled();
    expect(profileCosmeticUnlockRepository.save).not.toHaveBeenCalled();
    expect(rewardEventRepository.save).toHaveBeenCalledTimes(1);
  });
});
