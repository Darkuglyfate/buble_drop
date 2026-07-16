import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { RewardLedgerOnchainService } from '../onchain-relay/reward-ledger-onchain.service';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { SeasonService } from '../partner-token/season.service';
import { Profile } from '../profile/entities/profile.entity';
import { UserWallet } from '../profile/entities/user-wallet.entity';
import { GaslessRelayStatus } from '../onchain-relay/gasless-relay.service';
import { ClaimableTokenBalance } from './entities/claimable-token-balance.entity';
import { TokenClaim, TokenClaimStatus } from './entities/token-claim.entity';
import { ClaimService } from './claim.service';
import { RewardWalletPayoutService } from './reward-wallet-payout.service';

type MockRepository<T extends object> = Partial<
  Record<keyof Repository<T>, jest.Mock>
>;
type MockEntityTarget = typeof ClaimableTokenBalance | typeof TokenClaim;
type MutableClaimState = {
  id: string;
  profileId: string;
  tokenSymbol: string;
  amount: string;
  status: TokenClaimStatus;
  txHash: string | null;
  broadcastAt: Date | null;
  reconciledAt: Date | null;
  payoutError: string | null;
  processedAt: Date | null;
  recipientWalletAddress?: string | null;
  tokenContractAddress?: string | null;
};

describe('ClaimService', () => {
  let service: ClaimService;
  let profileRepository: MockRepository<Profile>;
  let userWalletRepository: MockRepository<UserWallet>;
  let partnerTokenRepository: MockRepository<PartnerToken>;
  let seasonService: { getActiveSeason: jest.Mock };
  let claimableRepository: MockRepository<ClaimableTokenBalance>;
  let tokenClaimRepository: MockRepository<TokenClaim>;
  let payoutService: {
    processPendingPayout: jest.Mock;
    broadcastPayout: jest.Mock;
    resolvePayoutReceipt: jest.Mock;
  };
  let rewardLedgerOnchainService: { recordClaimSettlement: jest.Mock };
  let dataSource: { transaction: jest.Mock };

  const availableClaimRelayStatus: GaslessRelayStatus = {
    action: 'claim',
    relayKind: 'backend-sponsored',
    available: true,
    userPaysGas: false,
    reason: null,
  };

  const unavailableClaimRelayStatus: GaslessRelayStatus = {
    action: 'claim',
    relayKind: 'backend-sponsored',
    available: false,
    userPaysGas: false,
    reason: 'claim relay disabled',
  };

  const createUnknownClaimManager = (
    status: TokenClaimStatus = TokenClaimStatus.UNKNOWN,
  ) => {
    const managerState = {
      claim: {
        id: 'claim-unknown',
        profileId: '11111111-1111-4111-8111-111111111111',
        tokenSymbol: 'BBB',
        amount: '200',
        status,
        txHash: '0xabc123',
        broadcastAt: new Date('2026-03-14T00:00:00.000Z'),
        reconciledAt: new Date('2026-03-14T00:01:00.000Z'),
        payoutError: 'receipt polling timed out',
        processedAt: null,
      } as MutableClaimState,
      balance: {
        profileId: '11111111-1111-4111-8111-111111111111',
        seasonId: 'season-active',
        tokenSymbol: 'BBB',
        claimableAmount: '300',
      },
    };
    const claimFindOptions: unknown[] = [];
    const balanceFindOptions: unknown[] = [];
    const claimableSave = jest
      .fn()
      .mockImplementation(
        (
          balance: typeof managerState.balance,
        ): Promise<typeof managerState.balance> => {
          managerState.balance = {
            ...managerState.balance,
            ...balance,
          };
          return Promise.resolve(managerState.balance);
        },
      );
    const manager = {
      getRepository: (entity: MockEntityTarget) => {
        if (entity === ClaimableTokenBalance) {
          return {
            findOne: jest.fn().mockImplementation((options: unknown) => {
              balanceFindOptions.push(options);
              return Promise.resolve(managerState.balance);
            }),
            save: claimableSave,
          };
        }
        if (entity === TokenClaim) {
          return {
            findOne: jest.fn().mockImplementation((options: unknown) => {
              claimFindOptions.push(options);
              return Promise.resolve(managerState.claim);
            }),
            create: jest.fn(),
            save: jest
              .fn()
              .mockImplementation(
                (
                  claim: Record<string, unknown>,
                ): Promise<MutableClaimState> => {
                  managerState.claim = {
                    id:
                      typeof claim.id === 'string'
                        ? claim.id
                        : managerState.claim.id,
                    profileId: String(claim.profileId),
                    tokenSymbol: String(claim.tokenSymbol),
                    amount: String(claim.amount),
                    status: claim.status as TokenClaimStatus,
                    txHash:
                      typeof claim.txHash === 'string' ? claim.txHash : null,
                    broadcastAt:
                      claim.broadcastAt instanceof Date
                        ? claim.broadcastAt
                        : null,
                    reconciledAt:
                      claim.reconciledAt instanceof Date
                        ? claim.reconciledAt
                        : null,
                    payoutError:
                      typeof claim.payoutError === 'string'
                        ? claim.payoutError
                        : null,
                    processedAt:
                      claim.processedAt instanceof Date
                        ? claim.processedAt
                        : null,
                    recipientWalletAddress:
                      typeof claim.recipientWalletAddress === 'string'
                        ? claim.recipientWalletAddress
                        : (managerState.claim.recipientWalletAddress ?? null),
                    tokenContractAddress:
                      typeof claim.tokenContractAddress === 'string'
                        ? claim.tokenContractAddress
                        : (managerState.claim.tokenContractAddress ?? null),
                  };
                  return Promise.resolve(managerState.claim);
                },
              ),
          };
        }
        throw new Error('Unexpected repository');
      },
    };

    return { manager, managerState, claimableSave };
  };

  beforeEach(async () => {
    profileRepository = {
      findOne: jest.fn(),
    };
    userWalletRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'wallet-1',
        address: '0x1111111111111111111111111111111111111111',
      }),
    };
    partnerTokenRepository = {
      findOne: jest.fn().mockResolvedValue({
        id: 'token-1',
        seasonId: 'season-active',
        symbol: 'BBB',
        contractAddress: '0x2222222222222222222222222222222222222222',
        createdAt: new Date('2026-03-14T00:00:00.000Z'),
      }),
    };
    seasonService = {
      getActiveSeason: jest.fn().mockResolvedValue({
        id: 'season-active',
        isActive: true,
        startDate: '2026-03-01',
        endDate: '2026-03-31',
      }),
    };
    claimableRepository = {
      find: jest.fn(),
    };
    tokenClaimRepository = {
      find: jest.fn(),
      findOne: jest.fn(),
      save: jest
        .fn()
        .mockImplementation(
          (claim: unknown): Promise<unknown> => Promise.resolve(claim),
        ),
    };
    payoutService = {
      processPendingPayout: jest.fn(),
      broadcastPayout: jest.fn(),
      resolvePayoutReceipt: jest.fn(),
    };
    rewardLedgerOnchainService = {
      recordClaimSettlement: jest.fn().mockResolvedValue({
        txHash:
          '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
        submitted: true,
        relay: availableClaimRelayStatus,
        claimIdHash:
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      }),
    };
    dataSource = {
      transaction: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClaimService,
        { provide: DataSource, useValue: dataSource },
        { provide: getRepositoryToken(Profile), useValue: profileRepository },
        {
          provide: getRepositoryToken(UserWallet),
          useValue: userWalletRepository,
        },
        {
          provide: getRepositoryToken(PartnerToken),
          useValue: partnerTokenRepository,
        },
        {
          provide: getRepositoryToken(ClaimableTokenBalance),
          useValue: claimableRepository,
        },
        {
          provide: getRepositoryToken(TokenClaim),
          useValue: tokenClaimRepository,
        },
        { provide: RewardWalletPayoutService, useValue: payoutService },
        { provide: SeasonService, useValue: seasonService },
        {
          provide: RewardLedgerOnchainService,
          useValue: rewardLedgerOnchainService,
        },
      ],
    }).compile();

    service = module.get<ClaimService>(ClaimService);
  });

  it('returns positive claimable balances only', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
    });
    claimableRepository.find!.mockResolvedValue([
      {
        tokenSymbol: 'AAA',
        claimableAmount: '0',
        updatedAt: new Date('2026-03-14T00:00:00.000Z'),
      },
      {
        tokenSymbol: 'BBB',
        claimableAmount: '100',
        updatedAt: new Date('2026-03-14T00:00:00.000Z'),
      },
    ]);

    const result = await service.getClaimableBalances(
      '11111111-1111-4111-8111-111111111111',
    );

    expect(result).toHaveLength(1);
    expect(result[0].tokenSymbol).toBe('BBB');
  });

  it('does not re-debit when a concurrent dispatcher confirms the payout', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-1',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });

    const managerState = {
      claim: null as null | MutableClaimState,
      balance: {
        profileId: '11111111-1111-4111-8111-111111111111',
        seasonId: 'season-active',
        tokenSymbol: 'BBB',
        claimableAmount: '300',
      },
    };
    const claimFindOptions: unknown[] = [];
    const balanceFindOptions: unknown[] = [];
    const manager = {
      getRepository: (entity: MockEntityTarget) => {
        if (entity === ClaimableTokenBalance) {
          return {
            findOne: jest.fn().mockImplementation((options: unknown) => {
              balanceFindOptions.push(options);
              return Promise.resolve(managerState.balance);
            }),
            save: jest
              .fn()
              .mockImplementation(
                (
                  balance: typeof managerState.balance,
                ): Promise<typeof managerState.balance> => {
                  managerState.balance = {
                    ...managerState.balance,
                    ...balance,
                  };
                  return Promise.resolve(managerState.balance);
                },
              ),
          };
        }
        if (entity === TokenClaim) {
          return {
            findOne: jest.fn().mockImplementation((options: unknown) => {
              claimFindOptions.push(options);
              return Promise.resolve(managerState.claim);
            }),
            create: jest
              .fn()
              .mockImplementation(
                (payload: Record<string, unknown>) => payload,
              ),
            save: jest
              .fn()
              .mockImplementation(
                (
                  claim: Record<string, unknown>,
                ): Promise<MutableClaimState> => {
                  managerState.claim = {
                    id: typeof claim.id === 'string' ? claim.id : 'claim-1',
                    profileId: String(claim.profileId),
                    tokenSymbol: String(claim.tokenSymbol),
                    amount: String(claim.amount),
                    status: claim.status as TokenClaimStatus,
                    txHash:
                      typeof claim.txHash === 'string' ? claim.txHash : null,
                    broadcastAt:
                      claim.broadcastAt instanceof Date
                        ? claim.broadcastAt
                        : null,
                    reconciledAt:
                      claim.reconciledAt instanceof Date
                        ? claim.reconciledAt
                        : null,
                    payoutError:
                      typeof claim.payoutError === 'string'
                        ? claim.payoutError
                        : null,
                    processedAt:
                      claim.processedAt instanceof Date
                        ? claim.processedAt
                        : null,
                    recipientWalletAddress:
                      typeof claim.recipientWalletAddress === 'string'
                        ? claim.recipientWalletAddress
                        : null,
                    tokenContractAddress:
                      typeof claim.tokenContractAddress === 'string'
                        ? claim.tokenContractAddress
                        : null,
                  };
                  return Promise.resolve(managerState.claim);
                },
              ),
          };
        }
        throw new Error('Unexpected repository');
      },
    };

    dataSource.transaction.mockImplementation(
      (runner: (m: typeof manager) => Promise<unknown>): Promise<unknown> =>
        runner(manager),
    );
    payoutService.processPendingPayout.mockResolvedValue({
      status: TokenClaimStatus.CONFIRMED,
      txHash: '0xabc123',
      relay: availableClaimRelayStatus,
    });
    payoutService.broadcastPayout.mockImplementation(() => {
      if (managerState.claim) {
        managerState.claim.status = TokenClaimStatus.CONFIRMED;
        managerState.claim.txHash = '0xabc123';
        managerState.claim.processedAt = new Date();
      }
      managerState.balance.claimableAmount = '100';
      return Promise.resolve({
        status: TokenClaimStatus.PENDING,
        txHash: '0xabc123',
        payoutError: null,
        relay: availableClaimRelayStatus,
      });
    });
    payoutService.resolvePayoutReceipt.mockResolvedValue({
      status: TokenClaimStatus.CONFIRMED,
      txHash: '0xabc123',
      payoutError: null,
      relay: availableClaimRelayStatus,
    });

    const result = await service.createTokenClaim({
      profileId: '11111111-1111-4111-8111-111111111111',
      tokenSymbol: 'bbb',
      amount: '200',
    });

    expect(result).toMatchObject({
      claimId: 'claim-1',
      profileId: '11111111-1111-4111-8111-111111111111',
      tokenSymbol: 'BBB',
      amount: '200',
      status: TokenClaimStatus.CONFIRMED,
      txHash: '0xabc123',
      remainingClaimableBalance: '100',
      relay: availableClaimRelayStatus,
      settlementRecordedOnchain: true,
      settlementRecordTxHash:
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    });
    expect(result.processedAt).toBeInstanceOf(Date);
    expect(payoutService.broadcastPayout).toHaveBeenCalledWith({
      claimId: 'claim-1',
      profileId: '11111111-1111-4111-8111-111111111111',
      recipientWalletAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'BBB',
      tokenContractAddress: '0x2222222222222222222222222222222222222222',
      amount: '200',
    });
    expect(seasonService.getActiveSeason).toHaveBeenCalledTimes(1);
    expect(partnerTokenRepository.findOne).toHaveBeenCalledWith({
      where: { symbol: 'BBB', seasonId: 'season-active' },
    });
    expect(managerState.balance.claimableAmount).toBe('100');
    expect(claimFindOptions).toContainEqual(
      expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
    );
    expect(balanceFindOptions).toContainEqual({
      where: {
        profileId: '11111111-1111-4111-8111-111111111111',
        seasonId: 'season-active',
        tokenSymbol: 'BBB',
      },
      lock: { mode: 'pessimistic_write' },
    });
    expect(managerState.claim?.processedAt).toBeInstanceOf(Date);
    expect(rewardLedgerOnchainService.recordClaimSettlement).toHaveBeenCalled();
  });

  it('marks token claim as failed and keeps balance unchanged when payout fails', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-1',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });

    const managerState = {
      claim: null as null | MutableClaimState,
      balance: {
        profileId: '11111111-1111-4111-8111-111111111111',
        tokenSymbol: 'BBB',
        claimableAmount: '300',
      },
    };
    const manager = {
      getRepository: (entity: MockEntityTarget) => {
        if (entity === ClaimableTokenBalance) {
          return {
            findOne: jest.fn().mockResolvedValue(managerState.balance),
            save: jest
              .fn()
              .mockImplementation(
                (
                  balance: typeof managerState.balance,
                ): Promise<typeof managerState.balance> => {
                  managerState.balance = {
                    ...managerState.balance,
                    ...balance,
                  };
                  return Promise.resolve(managerState.balance);
                },
              ),
          };
        }
        if (entity === TokenClaim) {
          return {
            findOne: jest
              .fn()
              .mockImplementation(() => Promise.resolve(managerState.claim)),
            create: jest
              .fn()
              .mockImplementation(
                (payload: Record<string, unknown>) => payload,
              ),
            save: jest
              .fn()
              .mockImplementation(
                (
                  claim: Record<string, unknown>,
                ): Promise<MutableClaimState> => {
                  managerState.claim = {
                    id: typeof claim.id === 'string' ? claim.id : 'claim-2',
                    profileId: String(claim.profileId),
                    tokenSymbol: String(claim.tokenSymbol),
                    amount: String(claim.amount),
                    status: claim.status as TokenClaimStatus,
                    txHash:
                      typeof claim.txHash === 'string' ? claim.txHash : null,
                    broadcastAt:
                      claim.broadcastAt instanceof Date
                        ? claim.broadcastAt
                        : null,
                    reconciledAt:
                      claim.reconciledAt instanceof Date
                        ? claim.reconciledAt
                        : null,
                    payoutError:
                      typeof claim.payoutError === 'string'
                        ? claim.payoutError
                        : null,
                    processedAt:
                      claim.processedAt instanceof Date
                        ? claim.processedAt
                        : null,
                    recipientWalletAddress:
                      typeof claim.recipientWalletAddress === 'string'
                        ? claim.recipientWalletAddress
                        : null,
                    tokenContractAddress:
                      typeof claim.tokenContractAddress === 'string'
                        ? claim.tokenContractAddress
                        : null,
                  };
                  return Promise.resolve(managerState.claim);
                },
              ),
          };
        }
        throw new Error('Unexpected repository');
      },
    };

    dataSource.transaction.mockImplementation(
      (runner: (m: typeof manager) => Promise<unknown>): Promise<unknown> =>
        runner(manager),
    );
    payoutService.processPendingPayout.mockResolvedValue({
      status: TokenClaimStatus.FAILED,
      txHash: null,
      relay: unavailableClaimRelayStatus,
    });
    payoutService.broadcastPayout.mockResolvedValue({
      status: TokenClaimStatus.FAILED,
      txHash: null,
      payoutError: 'claim relay disabled',
      relay: unavailableClaimRelayStatus,
    });

    const result = await service.createTokenClaim({
      profileId: '11111111-1111-4111-8111-111111111111',
      tokenSymbol: 'bbb',
      amount: '200',
    });

    expect(result).toMatchObject({
      claimId: 'claim-2',
      profileId: '11111111-1111-4111-8111-111111111111',
      tokenSymbol: 'BBB',
      amount: '200',
      status: TokenClaimStatus.FAILED,
      txHash: null,
      remainingClaimableBalance: '300',
      relay: unavailableClaimRelayStatus,
      settlementRecordedOnchain: false,
      settlementRecordTxHash: null,
    });
    expect(result.processedAt).toBeInstanceOf(Date);
    expect(managerState.balance.claimableAmount).toBe('300');
    expect(managerState.claim?.processedAt).toBeInstanceOf(Date);
    expect(
      rewardLedgerOnchainService.recordClaimSettlement,
    ).not.toHaveBeenCalled();
  });

  it('keeps a broadcast claim unknown when receipt polling times out', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-1',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });

    const managerState = {
      claim: null as null | MutableClaimState,
      balance: {
        profileId: '11111111-1111-4111-8111-111111111111',
        tokenSymbol: 'BBB',
        claimableAmount: '300',
      },
    };
    const manager = {
      getRepository: (entity: MockEntityTarget) => {
        if (entity === ClaimableTokenBalance) {
          return {
            findOne: jest.fn().mockResolvedValue(managerState.balance),
            save: jest
              .fn()
              .mockImplementation(
                (
                  balance: typeof managerState.balance,
                ): Promise<typeof managerState.balance> => {
                  managerState.balance = {
                    ...managerState.balance,
                    ...balance,
                  };
                  return Promise.resolve(managerState.balance);
                },
              ),
          };
        }
        if (entity === TokenClaim) {
          return {
            findOne: jest
              .fn()
              .mockImplementation(() => Promise.resolve(managerState.claim)),
            create: jest
              .fn()
              .mockImplementation(
                (payload: Record<string, unknown>) => payload,
              ),
            save: jest
              .fn()
              .mockImplementation(
                (
                  claim: Record<string, unknown>,
                ): Promise<MutableClaimState> => {
                  managerState.claim = {
                    id: typeof claim.id === 'string' ? claim.id : 'claim-3',
                    profileId: String(claim.profileId),
                    tokenSymbol: String(claim.tokenSymbol),
                    amount: String(claim.amount),
                    status: claim.status as TokenClaimStatus,
                    txHash:
                      typeof claim.txHash === 'string' ? claim.txHash : null,
                    broadcastAt:
                      claim.broadcastAt instanceof Date
                        ? claim.broadcastAt
                        : null,
                    reconciledAt:
                      claim.reconciledAt instanceof Date
                        ? claim.reconciledAt
                        : null,
                    payoutError:
                      typeof claim.payoutError === 'string'
                        ? claim.payoutError
                        : null,
                    processedAt:
                      claim.processedAt instanceof Date
                        ? claim.processedAt
                        : null,
                    recipientWalletAddress:
                      typeof claim.recipientWalletAddress === 'string'
                        ? claim.recipientWalletAddress
                        : null,
                    tokenContractAddress:
                      typeof claim.tokenContractAddress === 'string'
                        ? claim.tokenContractAddress
                        : null,
                  };
                  return Promise.resolve(managerState.claim);
                },
              ),
          };
        }
        throw new Error('Unexpected repository');
      },
    };

    dataSource.transaction.mockImplementation(
      (runner: (m: typeof manager) => Promise<unknown>): Promise<unknown> =>
        runner(manager),
    );
    payoutService.processPendingPayout.mockResolvedValue({
      status: TokenClaimStatus.UNKNOWN,
      txHash: '0xabc123',
      relay: availableClaimRelayStatus,
    });
    payoutService.broadcastPayout.mockImplementation(() => {
      if (managerState.claim) {
        managerState.claim.status = TokenClaimStatus.UNKNOWN;
        managerState.claim.txHash = '0xabc123';
        managerState.claim.broadcastAt = new Date();
      }
      return Promise.resolve({
        status: TokenClaimStatus.PENDING,
        txHash: '0xabc123',
        payoutError: null,
        relay: availableClaimRelayStatus,
      });
    });
    payoutService.resolvePayoutReceipt.mockImplementation(async () => {
      expect(managerState.claim).toMatchObject({
        status: TokenClaimStatus.UNKNOWN,
        txHash: '0xabc123',
      });
      return {
        status: TokenClaimStatus.UNKNOWN,
        txHash: '0xabc123',
        payoutError: 'receipt polling timed out',
        relay: availableClaimRelayStatus,
      };
    });

    const result = await service.createTokenClaim({
      profileId: '11111111-1111-4111-8111-111111111111',
      tokenSymbol: 'bbb',
      amount: '200',
    });

    expect(result).toMatchObject({
      claimId: 'claim-3',
      status: TokenClaimStatus.UNKNOWN,
      txHash: '0xabc123',
      remainingClaimableBalance: '300',
    });
    expect(managerState.claim).toMatchObject({
      status: TokenClaimStatus.UNKNOWN,
      txHash: '0xabc123',
      payoutError: 'receipt polling timed out',
    });
    expect(managerState.claim?.broadcastAt).toBeInstanceOf(Date);
    expect(managerState.claim?.reconciledAt).toBeInstanceOf(Date);
    expect(managerState.claim?.processedAt).toBeNull();
    expect(
      rewardLedgerOnchainService.recordClaimSettlement,
    ).not.toHaveBeenCalled();
  });

  it('reconciles an unknown claim to confirmed and reduces the balance once', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-1',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });

    const managerState = {
      claim: {
        id: 'claim-unknown-confirmed',
        profileId: '11111111-1111-4111-8111-111111111111',
        tokenSymbol: 'BBB',
        amount: '200',
        status: TokenClaimStatus.UNKNOWN,
        txHash: '0xabc123',
        broadcastAt: new Date('2026-03-14T00:00:00.000Z'),
        reconciledAt: new Date('2026-03-14T00:01:00.000Z'),
        payoutError: 'receipt polling timed out',
        processedAt: null,
        recipientWalletAddress: '0x1111111111111111111111111111111111111111',
        tokenContractAddress: '0x2222222222222222222222222222222222222222',
      } as MutableClaimState,
      balance: {
        profileId: '11111111-1111-4111-8111-111111111111',
        tokenSymbol: 'BBB',
        claimableAmount: '300',
      },
    };
    const manager = {
      getRepository: (entity: MockEntityTarget) => {
        if (entity === ClaimableTokenBalance) {
          return {
            findOne: jest.fn().mockResolvedValue(managerState.balance),
            save: jest
              .fn()
              .mockImplementation(
                (
                  balance: typeof managerState.balance,
                ): Promise<typeof managerState.balance> => {
                  managerState.balance = {
                    ...managerState.balance,
                    ...balance,
                  };
                  return Promise.resolve(managerState.balance);
                },
              ),
          };
        }
        if (entity === TokenClaim) {
          return {
            findOne: jest
              .fn()
              .mockImplementation(() => Promise.resolve(managerState.claim)),
            create: jest.fn(),
            save: jest
              .fn()
              .mockImplementation(
                (
                  claim: Record<string, unknown>,
                ): Promise<MutableClaimState> => {
                  managerState.claim = {
                    id:
                      typeof claim.id === 'string'
                        ? claim.id
                        : managerState.claim.id,
                    profileId: String(claim.profileId),
                    tokenSymbol: String(claim.tokenSymbol),
                    amount: String(claim.amount),
                    status: claim.status as TokenClaimStatus,
                    txHash:
                      typeof claim.txHash === 'string' ? claim.txHash : null,
                    broadcastAt:
                      claim.broadcastAt instanceof Date
                        ? claim.broadcastAt
                        : null,
                    reconciledAt:
                      claim.reconciledAt instanceof Date
                        ? claim.reconciledAt
                        : null,
                    payoutError:
                      typeof claim.payoutError === 'string'
                        ? claim.payoutError
                        : null,
                    processedAt:
                      claim.processedAt instanceof Date
                        ? claim.processedAt
                        : null,
                    recipientWalletAddress:
                      typeof claim.recipientWalletAddress === 'string'
                        ? claim.recipientWalletAddress
                        : (managerState.claim.recipientWalletAddress ?? null),
                    tokenContractAddress:
                      typeof claim.tokenContractAddress === 'string'
                        ? claim.tokenContractAddress
                        : (managerState.claim.tokenContractAddress ?? null),
                  };
                  return Promise.resolve(managerState.claim);
                },
              ),
          };
        }
        throw new Error('Unexpected repository');
      },
    };

    tokenClaimRepository.findOne!.mockResolvedValue(managerState.claim);
    dataSource.transaction.mockImplementation(
      (runner: (m: typeof manager) => Promise<unknown>): Promise<unknown> =>
        runner(manager),
    );
    payoutService.resolvePayoutReceipt.mockResolvedValue({
      status: TokenClaimStatus.CONFIRMED,
      txHash: '0xabc123',
      payoutError: null,
      relay: availableClaimRelayStatus,
    });

    const result = await service.createTokenClaim({
      profileId: '11111111-1111-4111-8111-111111111111',
      tokenSymbol: 'bbb',
      amount: '200',
    });

    expect(result).toMatchObject({
      claimId: 'claim-unknown-confirmed',
      status: TokenClaimStatus.CONFIRMED,
      txHash: '0xabc123',
      remainingClaimableBalance: '100',
    });
    expect(managerState.claim).toMatchObject({
      status: TokenClaimStatus.CONFIRMED,
      txHash: '0xabc123',
      payoutError: null,
    });
    expect(managerState.claim.processedAt).toBeInstanceOf(Date);
    expect(managerState.claim.reconciledAt).toBeInstanceOf(Date);
    expect(managerState.balance.claimableAmount).toBe('100');
    expect(payoutService.broadcastPayout).not.toHaveBeenCalled();
    expect(
      rewardLedgerOnchainService.recordClaimSettlement,
    ).toHaveBeenCalledTimes(1);
  });

  it('marks an unknown claim failed when its receipt is reverted', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-1',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    const { manager, managerState, claimableSave } =
      createUnknownClaimManager();

    tokenClaimRepository.findOne!.mockResolvedValue(managerState.claim);
    dataSource.transaction.mockImplementation(
      (runner: (m: typeof manager) => Promise<unknown>): Promise<unknown> =>
        runner(manager),
    );
    payoutService.resolvePayoutReceipt.mockResolvedValue({
      status: TokenClaimStatus.FAILED,
      txHash: '0xabc123',
      payoutError: 'Payout transaction reverted',
      relay: availableClaimRelayStatus,
    });

    const result = await service.createTokenClaim({
      profileId: '11111111-1111-4111-8111-111111111111',
      tokenSymbol: 'bbb',
      amount: '200',
    });

    expect(result).toMatchObject({
      claimId: 'claim-unknown',
      status: TokenClaimStatus.FAILED,
      txHash: '0xabc123',
      remainingClaimableBalance: '300',
    });
    expect(managerState.claim).toMatchObject({
      status: TokenClaimStatus.FAILED,
      txHash: '0xabc123',
      payoutError: 'Payout transaction reverted',
    });
    expect(managerState.claim.processedAt).toBeInstanceOf(Date);
    expect(managerState.claim.reconciledAt).toBeInstanceOf(Date);
    expect(managerState.balance.claimableAmount).toBe('300');
    expect(claimableSave).not.toHaveBeenCalled();
    expect(payoutService.broadcastPayout).not.toHaveBeenCalled();
    expect(
      rewardLedgerOnchainService.recordClaimSettlement,
    ).not.toHaveBeenCalled();
  });

  it('reconciles a pending claim that already has a broadcast hash', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-1',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    const { manager, managerState } = createUnknownClaimManager(
      TokenClaimStatus.PENDING,
    );

    tokenClaimRepository.findOne!.mockImplementation(({ where }) =>
      Promise.resolve(
        where.status === TokenClaimStatus.UNKNOWN ? null : managerState.claim,
      ),
    );
    dataSource.transaction.mockImplementation(
      (runner: (m: typeof manager) => Promise<unknown>): Promise<unknown> =>
        runner(manager),
    );
    payoutService.resolvePayoutReceipt.mockResolvedValue({
      status: TokenClaimStatus.CONFIRMED,
      txHash: '0xabc123',
      payoutError: null,
      relay: availableClaimRelayStatus,
    });

    const result = await service.createTokenClaim({
      profileId: '11111111-1111-4111-8111-111111111111',
      tokenSymbol: 'bbb',
      amount: '200',
    });

    expect(result).toMatchObject({
      claimId: 'claim-unknown',
      status: TokenClaimStatus.CONFIRMED,
      txHash: '0xabc123',
      remainingClaimableBalance: '100',
    });
    expect(payoutService.broadcastPayout).not.toHaveBeenCalled();
  });

  it('settles a reconciled claim using its persisted payout context', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-current',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    const { manager, managerState } = createUnknownClaimManager();
    managerState.claim.recipientWalletAddress =
      '0x3333333333333333333333333333333333333333';
    managerState.claim.tokenContractAddress =
      '0x4444444444444444444444444444444444444444';

    tokenClaimRepository.findOne!.mockResolvedValue(managerState.claim);
    dataSource.transaction.mockImplementation(
      (runner: (m: typeof manager) => Promise<unknown>): Promise<unknown> =>
        runner(manager),
    );
    payoutService.resolvePayoutReceipt.mockResolvedValue({
      status: TokenClaimStatus.CONFIRMED,
      txHash: '0xabc123',
      payoutError: null,
      relay: availableClaimRelayStatus,
    });

    await service.createTokenClaim({
      profileId: '11111111-1111-4111-8111-111111111111',
      tokenSymbol: 'bbb',
      amount: '200',
    });

    expect(userWalletRepository.findOne).not.toHaveBeenCalled();
    expect(partnerTokenRepository.findOne).not.toHaveBeenCalled();
    expect(
      rewardLedgerOnchainService.recordClaimSettlement,
    ).toHaveBeenCalledWith(
      expect.objectContaining({
        walletAddress: '0x3333333333333333333333333333333333333333',
        tokenContractAddress: '0x4444444444444444444444444444444444444444',
        tokenSymbol: 'BBB',
      }),
    );
  });

  it('blocks a duplicate claim retry while receipt reconciliation remains unknown', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-1',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    const { manager, managerState, claimableSave } =
      createUnknownClaimManager();

    tokenClaimRepository.findOne!.mockResolvedValue(managerState.claim);
    dataSource.transaction.mockImplementation(
      (runner: (m: typeof manager) => Promise<unknown>): Promise<unknown> =>
        runner(manager),
    );
    payoutService.resolvePayoutReceipt.mockResolvedValue({
      status: TokenClaimStatus.UNKNOWN,
      txHash: '0xabc123',
      payoutError: 'receipt polling timed out',
      relay: availableClaimRelayStatus,
    });

    await expect(
      service.createTokenClaim({
        profileId: '11111111-1111-4111-8111-111111111111',
        tokenSymbol: 'bbb',
        amount: '200',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(managerState.claim).toMatchObject({
      status: TokenClaimStatus.UNKNOWN,
      txHash: '0xabc123',
      payoutError: 'receipt polling timed out',
    });
    expect(managerState.claim.reconciledAt).toBeInstanceOf(Date);
    expect(managerState.balance.claimableAmount).toBe('300');
    expect(claimableSave).not.toHaveBeenCalled();
    expect(payoutService.broadcastPayout).not.toHaveBeenCalled();
    expect(
      rewardLedgerOnchainService.recordClaimSettlement,
    ).not.toHaveBeenCalled();
  });

  it('rejects claim requests when onboarding is incomplete', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      nickname: null,
      currentAvatarId: null,
      onboardingCompletedAt: null,
    });

    await expect(
      service.createTokenClaim({
        profileId: '11111111-1111-4111-8111-111111111111',
        tokenSymbol: 'BBB',
        amount: '1',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(payoutService.processPendingPayout).not.toHaveBeenCalled();
  });

  it('automatically terminalizes an unprepared pending payout that cannot be prepared', async () => {
    const queuedClaim = {
      id: 'claim-crash-window',
      profileId: '11111111-1111-4111-8111-111111111111',
      seasonId: 'season-active',
      tokenSymbol: 'BBB',
      amount: '5',
      status: TokenClaimStatus.PENDING,
      txHash: null,
      recipientWalletAddress: '0x1111111111111111111111111111111111111111',
      tokenContractAddress: '0x2222222222222222222222222222222222222222',
      serializedPayoutTransaction: null,
      payoutError: null,
      reconciledAt: null,
      processedAt: null,
    } as TokenClaim;
    tokenClaimRepository.find!.mockResolvedValue([queuedClaim]);
    payoutService.broadcastPayout.mockResolvedValue({
      status: TokenClaimStatus.FAILED,
      txHash: null,
      payoutError: 'Reward payout wallet is unavailable',
      relay: unavailableClaimRelayStatus,
    });
    const claimSave = jest
      .fn()
      .mockImplementation((claim: TokenClaim) => Promise.resolve(claim));
    const manager = {
      getRepository: (entity: MockEntityTarget) => {
        if (entity !== TokenClaim) {
          throw new Error('Unexpected repository');
        }
        return {
          findOne: jest.fn().mockResolvedValue(queuedClaim),
          save: claimSave,
        };
      },
    };
    dataSource.transaction.mockImplementation(
      (runner: (value: typeof manager) => Promise<unknown>) => runner(manager),
    );

    const terminalized = await service.processPreparedPayouts();

    expect(terminalized).toBe(1);
    expect(payoutService.broadcastPayout).toHaveBeenCalledWith({
      claimId: 'claim-crash-window',
      profileId: '11111111-1111-4111-8111-111111111111',
      recipientWalletAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'BBB',
      tokenContractAddress: '0x2222222222222222222222222222222222222222',
      amount: '5',
    });
    expect(claimSave).toHaveBeenCalledWith(
      expect.objectContaining({
        status: TokenClaimStatus.FAILED,
        payoutError: 'Reward payout wallet is unavailable',
      }),
    );
  });

  it('rejects payout when there is no date-active season', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-1',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });
    tokenClaimRepository.findOne!.mockResolvedValue(null);
    seasonService.getActiveSeason.mockResolvedValue(null);

    await expect(
      service.createTokenClaim({
        profileId: '11111111-1111-4111-8111-111111111111',
        tokenSymbol: 'BBB',
        amount: '1',
      }),
    ).rejects.toThrow('Active season not found');

    expect(partnerTokenRepository.findOne).not.toHaveBeenCalled();
    expect(dataSource.transaction).not.toHaveBeenCalled();
  });

  it('rejects claim above available balance', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-1',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });

    const manager = {
      getRepository: (entity: MockEntityTarget) => {
        if (entity === ClaimableTokenBalance) {
          return {
            findOne: jest.fn().mockResolvedValue({
              profileId: '11111111-1111-4111-8111-111111111111',
              tokenSymbol: 'BBB',
              claimableAmount: '10',
            }),
            save: jest.fn(),
          };
        }
        if (entity === TokenClaim) {
          return {
            findOne: jest.fn().mockResolvedValue(null),
            create: jest.fn(),
            save: jest.fn(),
          };
        }
        throw new Error('Unexpected repository');
      },
    };

    dataSource.transaction.mockImplementation(
      (runner: (m: typeof manager) => Promise<unknown>): Promise<unknown> =>
        runner(manager),
    );

    await expect(
      service.createTokenClaim({
        profileId: '11111111-1111-4111-8111-111111111111',
        tokenSymbol: 'BBB',
        amount: '11',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects when pending claim already exists', async () => {
    profileRepository.findOne!.mockResolvedValue({
      id: '11111111-1111-4111-8111-111111111111',
      walletId: 'wallet-1',
      nickname: 'ready',
      currentAvatarId: 'avatar-1',
      onboardingCompletedAt: new Date('2026-03-14T00:00:00.000Z'),
    });

    const manager = {
      getRepository: (entity: MockEntityTarget) => {
        if (entity === ClaimableTokenBalance) {
          return {
            findOne: jest.fn(),
            save: jest.fn(),
          };
        }
        if (entity === TokenClaim) {
          return {
            findOne: jest.fn().mockResolvedValue({
              id: 'pending-1',
              status: TokenClaimStatus.PENDING,
            }),
            create: jest.fn(),
            save: jest.fn(),
          };
        }
        throw new Error('Unexpected repository');
      },
    };

    dataSource.transaction.mockImplementation(
      (runner: (m: typeof manager) => Promise<unknown>): Promise<unknown> =>
        runner(manager),
    );

    await expect(
      service.createTokenClaim({
        profileId: '11111111-1111-4111-8111-111111111111',
        tokenSymbol: 'BBB',
        amount: '1',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('throws when profile does not exist', async () => {
    profileRepository.findOne!.mockResolvedValue(null);

    await expect(
      service.getClaimableBalances('11111111-1111-4111-8111-111111111111'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
