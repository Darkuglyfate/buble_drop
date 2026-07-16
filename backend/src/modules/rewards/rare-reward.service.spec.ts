import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ClaimableTokenBalance } from '../claim/entities/claimable-token-balance.entity';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { RewardLedgerOnchainService } from '../onchain-relay/reward-ledger-onchain.service';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { Season } from '../partner-token/entities/season.entity';
import { SeasonService } from '../partner-token/season.service';
import { CosmeticDefinition } from '../profile/entities/cosmetic-definition.entity';
import { NftDefinition } from '../profile/entities/nft-definition.entity';
import { ProfileCosmeticUnlock } from '../profile/entities/profile-cosmetic-unlock.entity';
import { ProfileNftOwnership } from '../profile/entities/profile-nft-ownership.entity';
import { Profile } from '../profile/entities/profile.entity';
import { UserWallet } from '../profile/entities/user-wallet.entity';
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
  let userWalletRepository: MockRepository<UserWallet>;
  let bubbleSessionRepository: MockRepository<BubbleSession>;
  let rewardEventRepository: MockRepository<RewardEvent>;
  let rewardLedgerOnchainService: { grantOwnership: jest.Mock };
  let dataSource: { transaction: jest.Mock };

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
    userWalletRepository = {
      findOne: jest.fn(),
    };
    bubbleSessionRepository = {
      count: jest.fn(),
    };
    rewardEventRepository = {
      create: jest.fn(),
      save: jest.fn(),
    };
    rewardLedgerOnchainService = {
      grantOwnership: jest.fn(),
    };
    dataSource = {
      transaction: jest.fn(),
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
    const repositoryByEntity = new Map<unknown, unknown>([
      [Season, seasonRepository],
      [PartnerToken, partnerTokenRepository],
      [ClaimableTokenBalance, claimableBalanceRepository],
      [WeeklyTokenTicket, weeklyTokenTicketRepository],
      [NftDefinition, nftDefinitionRepository],
      [ProfileNftOwnership, profileNftOwnershipRepository],
      [CosmeticDefinition, cosmeticDefinitionRepository],
      [ProfileCosmeticUnlock, profileCosmeticUnlockRepository],
      [UserWallet, userWalletRepository],
      [BubbleSession, bubbleSessionRepository],
      [RewardEvent, rewardEventRepository],
    ]);
    dataSource.transaction.mockImplementation(
      (
        runner: (manager: {
          getRepository: (entity: unknown) => unknown;
        }) => unknown,
      ) =>
        runner({
          getRepository: (entity: unknown) => repositoryByEntity.get(entity),
        }),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RareRewardService,
        { provide: DataSource, useValue: dataSource },
        SeasonService,
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
          provide: getRepositoryToken(UserWallet),
          useValue: userWalletRepository,
        },
        {
          provide: getRepositoryToken(BubbleSession),
          useValue: bubbleSessionRepository,
        },
        {
          provide: getRepositoryToken(RewardEvent),
          useValue: rewardEventRepository,
        },
        {
          provide: RewardLedgerOnchainService,
          useValue: rewardLedgerOnchainService,
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

  it('derives every durable reward side effect from an entitlement idempotency key', async () => {
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

    const input = {
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
      idempotencyKey: 'rare-reward:entitlement-1',
    };

    await service.issueSessionRareRewards(input);

    expect(weeklyTokenTicketRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'rare-reward:entitlement-1:token-ticket',
      }),
    );
    expect(profileNftOwnershipRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'rare-reward:entitlement-1:nft:nft-1',
      }),
    );
    expect(profileCosmeticUnlockRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        idempotencyKey: 'rare-reward:entitlement-1:cosmetic:cosmetic-1',
      }),
    );
    expect(rewardEventRepository.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        idempotencyKey: 'rare-reward:entitlement-1:token',
      }),
    );
    expect(rewardEventRepository.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        idempotencyKey: 'rare-reward:entitlement-1:nft:nft-1',
      }),
    );
    expect(rewardEventRepository.create).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({
        idempotencyKey: 'rare-reward:entitlement-1:cosmetic:cosmetic-1',
      }),
    );
  });

  it('rejects issuance when an ownership grant is not submitted', async () => {
    seasonRepository.findOne!.mockResolvedValue(null);
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
    cosmeticDefinitionRepository.find!.mockResolvedValue([]);
    userWalletRepository.findOne!.mockResolvedValue({
      id: 'wallet-1',
      address: '0x1111111111111111111111111111111111111111',
    });
    rewardLedgerOnchainService.grantOwnership.mockResolvedValue({
      txHash: null,
      submitted: false,
      relay: {
        action: 'ownership',
        relayKind: 'backend-sponsored',
        available: false,
        userPaysGas: false,
        reason: 'reward ledger ownership grant failed',
      },
      rewardKeyHash:
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    });

    await expect(
      service.issueSessionRareRewards({
        profile: {
          id: 'profile-1',
          walletId: 'wallet-1',
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
        idempotencyKey: 'rare-reward:entitlement-1',
      }),
    ).rejects.toThrow('Reward ownership grant was not submitted');

    expect(rewardLedgerOnchainService.grantOwnership).toHaveBeenCalledWith({
      walletAddress: '0x1111111111111111111111111111111111111111',
      rewardKey: 'genesis-spark',
      rewardType: 'nft',
      sourceId: 'rare-reward:entitlement-1:nft:nft-1',
    });
    expect(rewardEventRepository.save).not.toHaveBeenCalled();
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

  it.each([
    ['future', '2026-03-16', '2026-03-31'],
    ['expired', '2026-03-01', '2026-03-14'],
  ])(
    'does not issue a token for an active %s season',
    async (_label, startDate, endDate) => {
      jest.useFakeTimers().setSystemTime(new Date('2026-03-15T12:00:00.000Z'));
      seasonRepository.findOne!.mockImplementation(async (options) => {
        const where = options?.where as Record<string, unknown>;
        return where.startDate && where.endDate
          ? null
          : ({ id: 'season-1', startDate, endDate, isActive: true } as Season);
      });
      partnerTokenRepository.findOne!.mockResolvedValue({
        id: 'token-1',
        seasonId: 'season-1',
        symbol: 'BUBL',
      });
      claimableBalanceRepository.findOne!.mockResolvedValue(null);
      nftDefinitionRepository.find!.mockResolvedValue([]);
      cosmeticDefinitionRepository.find!.mockResolvedValue([]);

      const result = await service.issueSessionRareRewards({
        profile: {
          id: 'profile-1',
          totalXp: 140,
          currentStreak: 4,
        } as Profile,
        session: {
          id: 'session-1',
          startedAt: new Date('2026-03-15T10:00:00.000Z'),
          endedAt: new Date('2026-03-15T10:10:00.000Z'),
        } as BubbleSession,
        rareRewardAccessActive: true,
        isCompletionEligible: true,
      });

      expect(result.tokenReward).toBeNull();
      expect(partnerTokenRepository.findOne).not.toHaveBeenCalled();
      expect(claimableBalanceRepository.save).not.toHaveBeenCalled();
      jest.useRealTimers();
    },
  );

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
      seasonId: 'season-1',
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
      {
        nftDefinitionId: 'nft-1',
        acquiredAt: new Date('2026-03-01T00:00:00.000Z'),
        nftDefinition: { cooldownDays: 0 },
      },
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
        seasonId: 'season-1',
        claimableAmount: '11',
      }),
    );
    expect(claimableBalanceRepository.findOne).toHaveBeenCalledWith({
      where: {
        profileId: 'profile-1',
        seasonId: 'season-1',
        tokenSymbol: 'BUBL',
      },
      lock: { mode: 'pessimistic_write' },
    });
    expect(profileNftOwnershipRepository.save).not.toHaveBeenCalled();
    expect(profileCosmeticUnlockRepository.save).not.toHaveBeenCalled();
    expect(rewardEventRepository.save).toHaveBeenCalledTimes(1);
  });

  it('blocks every new NFT before the latest ownership cooldown expires', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
    seasonRepository.findOne!.mockResolvedValue(null);
    nftDefinitionRepository.find!.mockResolvedValue([
      {
        id: 'nft-new',
        key: 'new-drop',
        minStreak: 0,
        minXp: 0,
        minSessions: 0,
        dropChancePercent: '100.00',
      },
    ]);
    profileNftOwnershipRepository.find!.mockResolvedValue([
      {
        nftDefinitionId: 'nft-old',
        acquiredAt: new Date('2026-03-14T12:00:01.000Z'),
        nftDefinition: { cooldownDays: 7 },
      },
    ]);
    bubbleSessionRepository.count!.mockResolvedValue(1);
    cosmeticDefinitionRepository.find!.mockResolvedValue([]);

    const result = await service.issueSessionRareRewards({
      profile: {
        id: 'profile-1',
        totalXp: 500,
        currentStreak: 8,
      } as Profile,
      session: {
        id: 'session-cooldown',
        startedAt: new Date('2026-03-20T11:50:00.000Z'),
        endedAt: new Date('2026-03-20T12:00:00.000Z'),
      } as BubbleSession,
      rareRewardAccessActive: true,
      isCompletionEligible: true,
    });

    expect(result.nftRewards).toEqual([]);
    expect(profileNftOwnershipRepository.save).not.toHaveBeenCalled();
    expect(profileNftOwnershipRepository.find).toHaveBeenCalledWith({
      where: { profileId: 'profile-1' },
      relations: { nftDefinition: true },
      order: { acquiredAt: 'DESC' },
    });
    jest.useRealTimers();
  });

  it('uses the longest cooldown when latest ownership timestamps are tied', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-20T12:00:00.000Z'));
    seasonRepository.findOne!.mockResolvedValue(null);
    nftDefinitionRepository.find!.mockResolvedValue([
      {
        id: 'nft-new',
        key: 'new-drop',
        minStreak: 0,
        minXp: 0,
        minSessions: 0,
        dropChancePercent: '100.00',
        cooldownDays: 0,
      },
    ]);
    profileNftOwnershipRepository.find!.mockResolvedValue([
      {
        nftDefinitionId: 'nft-zero-cooldown',
        acquiredAt: new Date('2026-03-14T12:00:00.000Z'),
        nftDefinition: { cooldownDays: 0 },
      },
      {
        nftDefinitionId: 'nft-seven-day-cooldown',
        acquiredAt: new Date('2026-03-14T12:00:00.000Z'),
        nftDefinition: { cooldownDays: 7 },
      },
    ]);
    bubbleSessionRepository.count!.mockResolvedValue(1);
    cosmeticDefinitionRepository.find!.mockResolvedValue([]);

    const result = await service.issueSessionRareRewards({
      profile: {
        id: 'profile-1',
        totalXp: 500,
        currentStreak: 8,
      } as Profile,
      session: {
        id: 'session-tied-cooldown',
        startedAt: new Date('2026-03-20T11:50:00.000Z'),
        endedAt: new Date('2026-03-20T12:00:00.000Z'),
      } as BubbleSession,
      rareRewardAccessActive: true,
      isCompletionEligible: true,
    });

    expect(result.nftRewards).toEqual([]);
    expect(profileNftOwnershipRepository.save).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('allows a new NFT exactly when the latest ownership cooldown expires', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-21T12:00:00.000Z'));
    seasonRepository.findOne!.mockResolvedValue(null);
    nftDefinitionRepository.find!.mockResolvedValue([
      {
        id: 'nft-new',
        key: 'new-drop',
        minStreak: 0,
        minXp: 0,
        minSessions: 0,
        dropChancePercent: '100.00',
      },
    ]);
    profileNftOwnershipRepository.find!.mockResolvedValue([
      {
        nftDefinitionId: 'nft-old',
        acquiredAt: new Date('2026-03-14T12:00:00.000Z'),
        nftDefinition: { cooldownDays: 7 },
      },
    ]);
    bubbleSessionRepository.count!.mockResolvedValue(1);
    cosmeticDefinitionRepository.find!.mockResolvedValue([]);

    const result = await service.issueSessionRareRewards({
      profile: {
        id: 'profile-1',
        totalXp: 500,
        currentStreak: 8,
      } as Profile,
      session: {
        id: 'session-expiry',
        startedAt: new Date('2026-03-21T11:50:00.000Z'),
        endedAt: new Date('2026-03-21T12:00:00.000Z'),
      } as BubbleSession,
      rareRewardAccessActive: true,
      isCompletionEligible: true,
    });

    expect(result.nftRewards).toEqual([{ id: 'nft-new', key: 'new-drop' }]);
    expect(profileNftOwnershipRepository.save).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('allows a new NFT immediately when the latest ownership cooldown is zero', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-14T12:00:00.000Z'));
    seasonRepository.findOne!.mockResolvedValue(null);
    nftDefinitionRepository.find!.mockResolvedValue([
      {
        id: 'nft-new',
        key: 'new-drop',
        minStreak: 0,
        minXp: 0,
        minSessions: 0,
        dropChancePercent: '100.00',
      },
    ]);
    profileNftOwnershipRepository.find!.mockResolvedValue([
      {
        nftDefinitionId: 'nft-old',
        acquiredAt: new Date('2026-03-14T12:00:00.000Z'),
        nftDefinition: { cooldownDays: 0 },
      },
    ]);
    bubbleSessionRepository.count!.mockResolvedValue(1);
    cosmeticDefinitionRepository.find!.mockResolvedValue([]);

    const result = await service.issueSessionRareRewards({
      profile: {
        id: 'profile-1',
        totalXp: 500,
        currentStreak: 8,
      } as Profile,
      session: {
        id: 'session-no-cooldown',
        startedAt: new Date('2026-03-14T11:50:00.000Z'),
        endedAt: null,
      } as BubbleSession,
      rareRewardAccessActive: true,
      isCompletionEligible: true,
    });

    expect(result.nftRewards).toEqual([{ id: 'nft-new', key: 'new-drop' }]);
    expect(profileNftOwnershipRepository.save).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('stops the same reward issue after awarding an NFT with a positive cooldown', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-14T12:00:00.000Z'));
    seasonRepository.findOne!.mockResolvedValue(null);
    nftDefinitionRepository.find!.mockResolvedValue([
      {
        id: 'nft-first',
        key: 'first-drop',
        minStreak: 0,
        minXp: 0,
        minSessions: 0,
        dropChancePercent: '100.00',
        cooldownDays: 7,
      },
      {
        id: 'nft-second',
        key: 'second-drop',
        minStreak: 0,
        minXp: 0,
        minSessions: 0,
        dropChancePercent: '100.00',
        cooldownDays: 0,
      },
    ]);
    profileNftOwnershipRepository.find!.mockResolvedValue([]);
    bubbleSessionRepository.count!.mockResolvedValue(1);
    cosmeticDefinitionRepository.find!.mockResolvedValue([]);

    const result = await service.issueSessionRareRewards({
      profile: {
        id: 'profile-1',
        totalXp: 500,
        currentStreak: 8,
      } as Profile,
      session: {
        id: 'session-sequential-cooldown',
        startedAt: new Date('2026-03-14T11:50:00.000Z'),
        endedAt: new Date('2026-03-14T12:00:00.000Z'),
      } as BubbleSession,
      rareRewardAccessActive: true,
      isCompletionEligible: true,
    });

    expect(result.nftRewards).toEqual([{ id: 'nft-first', key: 'first-drop' }]);
    expect(profileNftOwnershipRepository.create).toHaveBeenCalledTimes(1);
    expect(profileNftOwnershipRepository.create).toHaveBeenCalledWith(
      expect.objectContaining({ nftDefinitionId: 'nft-first' }),
    );
    expect(profileNftOwnershipRepository.create).not.toHaveBeenCalledWith(
      expect.objectContaining({ nftDefinitionId: 'nft-second' }),
    );
    expect(profileNftOwnershipRepository.save).toHaveBeenCalledTimes(1);
    jest.useRealTimers();
  });

  it('still skips a permanently owned NFT after its cooldown expires', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-03-21T12:00:00.000Z'));
    seasonRepository.findOne!.mockResolvedValue(null);
    nftDefinitionRepository.find!.mockResolvedValue([
      {
        id: 'nft-owned',
        key: 'owned-drop',
        minStreak: 0,
        minXp: 0,
        minSessions: 0,
        dropChancePercent: '100.00',
      },
    ]);
    profileNftOwnershipRepository.find!.mockResolvedValue([
      {
        nftDefinitionId: 'nft-owned',
        acquiredAt: new Date('2026-03-14T12:00:00.000Z'),
        nftDefinition: { cooldownDays: 7 },
      },
    ]);
    bubbleSessionRepository.count!.mockResolvedValue(1);
    cosmeticDefinitionRepository.find!.mockResolvedValue([]);

    const result = await service.issueSessionRareRewards({
      profile: {
        id: 'profile-1',
        totalXp: 500,
        currentStreak: 8,
      } as Profile,
      session: {
        id: 'session-owned',
        startedAt: new Date('2026-03-21T11:50:00.000Z'),
        endedAt: new Date('2026-03-21T12:00:00.000Z'),
      } as BubbleSession,
      rareRewardAccessActive: true,
      isCompletionEligible: true,
    });

    expect(result.nftRewards).toEqual([]);
    expect(profileNftOwnershipRepository.save).not.toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('uses the entitlement season for delayed token issuance', async () => {
    seasonRepository.findOne!.mockResolvedValue({
      id: 'season-current',
      isActive: true,
    });
    partnerTokenRepository.findOne!.mockResolvedValue({
      id: 'token-old',
      seasonId: 'season-old',
      symbol: 'OLD',
    });
    claimableBalanceRepository.findOne!.mockResolvedValue(null);
    nftDefinitionRepository.find!.mockResolvedValue([]);
    cosmeticDefinitionRepository.find!.mockResolvedValue([]);

    const input = {
      profile: {
        id: 'profile-1',
        totalXp: 500,
        currentStreak: 8,
      } as Profile,
      session: {
        id: 'session-old',
        seasonId: 'season-old',
        startedAt: new Date('2026-03-14T10:00:00.000Z'),
        endedAt: new Date('2026-03-14T10:10:00.000Z'),
      } as BubbleSession,
      seasonId: 'season-old',
      rareRewardAccessActive: true,
      isCompletionEligible: true,
      idempotencyKey: 'rare-reward:session-old',
    };

    const result = await service.issueSessionRareRewards(input);

    expect(partnerTokenRepository.findOne).toHaveBeenCalledWith({
      where: { seasonId: 'season-old' },
      order: { createdAt: 'ASC' },
    });
    expect(result.tokenReward).toEqual(
      expect.objectContaining({ seasonId: 'season-old', tokenSymbol: 'OLD' }),
    );
  });
});
