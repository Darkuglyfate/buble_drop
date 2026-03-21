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
  processedAt: Date | null;
};

describe('ClaimService', () => {
  let service: ClaimService;
  let profileRepository: MockRepository<Profile>;
  let userWalletRepository: MockRepository<UserWallet>;
  let partnerTokenRepository: MockRepository<PartnerToken>;
  let claimableRepository: MockRepository<ClaimableTokenBalance>;
  let tokenClaimRepository: MockRepository<TokenClaim>;
  let payoutService: { processPendingPayout: jest.Mock };
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
      find: jest.fn().mockResolvedValue([
        {
          id: 'token-1',
          symbol: 'BBB',
          contractAddress: '0x2222222222222222222222222222222222222222',
          season: {
            isActive: true,
          },
          createdAt: new Date('2026-03-14T00:00:00.000Z'),
        },
      ]),
    };
    claimableRepository = {
      find: jest.fn(),
    };
    tokenClaimRepository = {
      save: jest.fn().mockImplementation(
        (claim: unknown): Promise<unknown> => Promise.resolve(claim),
      ),
    };
    payoutService = {
      processPendingPayout: jest.fn(),
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

  it('confirms token claim and reduces claimable balance after payout success', async () => {
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
                    id: typeof claim.id === 'string' ? claim.id : 'claim-1',
                    profileId: String(claim.profileId),
                    tokenSymbol: String(claim.tokenSymbol),
                    amount: String(claim.amount),
                    status: claim.status as TokenClaimStatus,
                    txHash:
                      typeof claim.txHash === 'string' ? claim.txHash : null,
                    processedAt:
                      claim.processedAt instanceof Date
                        ? claim.processedAt
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
    expect(payoutService.processPendingPayout).toHaveBeenCalledWith({
      claimId: 'claim-1',
      profileId: '11111111-1111-4111-8111-111111111111',
      recipientWalletAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'BBB',
      tokenContractAddress: '0x2222222222222222222222222222222222222222',
      amount: '200',
    });
    expect(managerState.balance.claimableAmount).toBe('100');
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
                    processedAt:
                      claim.processedAt instanceof Date
                        ? claim.processedAt
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
    expect(rewardLedgerOnchainService.recordClaimSettlement).not.toHaveBeenCalled();
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
