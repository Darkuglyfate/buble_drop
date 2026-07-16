import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, IsNull, Repository } from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { UserWallet } from '../profile/entities/user-wallet.entity';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { SeasonService } from '../partner-token/season.service';
import { CreateTokenClaimDto } from './dto/create-token-claim.dto';
import { ClaimableTokenBalance } from './entities/claimable-token-balance.entity';
import { TokenClaim, TokenClaimStatus } from './entities/token-claim.entity';
import { GaslessRelayStatus } from '../onchain-relay/gasless-relay.service';
import { RewardLedgerOnchainService } from '../onchain-relay/reward-ledger-onchain.service';
import { RewardWalletPayoutService } from './reward-wallet-payout.service';

export interface ClaimableTokenBalanceView {
  tokenSymbol: string;
  claimableAmount: string;
  updatedAt: Date;
}

export interface CreateTokenClaimResult {
  claimId: string;
  profileId: string;
  tokenSymbol: string;
  amount: string;
  status: TokenClaimStatus;
  txHash: string | null;
  broadcastAt: Date | null;
  reconciledAt: Date | null;
  payoutError: string | null;
  processedAt: Date | null;
  remainingClaimableBalance: string;
  relay: GaslessRelayStatus;
  settlementRecordedOnchain: boolean;
  settlementRecordTxHash: string | null;
}

type ClaimPayoutResult = {
  status:
    | TokenClaimStatus.CONFIRMED
    | TokenClaimStatus.FAILED
    | TokenClaimStatus.UNKNOWN;
  txHash: string | null;
  payoutError: string | null;
  relay: GaslessRelayStatus;
};

@Injectable()
export class ClaimService {
  private readonly logger = new Logger(ClaimService.name);

  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(UserWallet)
    private readonly userWalletRepository: Repository<UserWallet>,
    @InjectRepository(PartnerToken)
    private readonly partnerTokenRepository: Repository<PartnerToken>,
    @InjectRepository(ClaimableTokenBalance)
    private readonly claimableBalanceRepository: Repository<ClaimableTokenBalance>,
    @InjectRepository(TokenClaim)
    private readonly tokenClaimRepository: Repository<TokenClaim>,
    private readonly payoutService: RewardWalletPayoutService,
    private readonly rewardLedgerOnchainService: RewardLedgerOnchainService,
    private readonly seasonService: SeasonService,
  ) {}

  async getClaimableBalances(
    profileId: string,
  ): Promise<ClaimableTokenBalanceView[]> {
    this.assertUuid(profileId, 'Invalid profileId format');
    await this.ensureProfileExists(profileId);

    const activeSeason = await this.seasonService.getActiveSeason();
    if (!activeSeason) {
      return [];
    }

    const balances = await this.claimableBalanceRepository.find({
      where: { profileId, seasonId: activeSeason.id },
      order: { tokenSymbol: 'ASC' },
    });

    return balances
      .filter((item) => this.parseAmount(item.claimableAmount) > 0n)
      .map((item) => ({
        tokenSymbol: item.tokenSymbol,
        claimableAmount: item.claimableAmount,
        updatedAt: item.updatedAt,
      }));
  }

  async createTokenClaim(
    dto: CreateTokenClaimDto,
  ): Promise<CreateTokenClaimResult> {
    this.assertUuid(dto.profileId, 'Invalid profileId format');
    const profile = await this.getProfileOrThrow(dto.profileId);
    this.assertOnboardingCompleted(profile);

    const tokenSymbol = dto.tokenSymbol.trim().toUpperCase();
    if (!tokenSymbol) {
      throw new BadRequestException('tokenSymbol is required');
    }

    const requestedAmount = this.parsePositiveAmount(dto.amount);

    const activeClaim = await this.tokenClaimRepository.findOne({
      where: {
        profileId: dto.profileId,
        tokenSymbol,
        status: In([TokenClaimStatus.PENDING, TokenClaimStatus.UNKNOWN]),
      },
    });
    if (activeClaim) {
      if (activeClaim.txHash) {
        return this.reconcileBroadcastClaim(activeClaim);
      }
      throw new ConflictException('Active claim already exists for this token');
    }

    const payoutExecutionContext = await this.getPayoutExecutionContext(
      profile,
      tokenSymbol,
    );

    const createdClaim = await this.dataSource.transaction(async (manager) => {
      const claimableRepository = manager.getRepository(ClaimableTokenBalance);
      const claimRepository = manager.getRepository(TokenClaim);

      const existingActiveClaim = await claimRepository.findOne({
        where: {
          profileId: dto.profileId,
          tokenSymbol,
          status: In([TokenClaimStatus.PENDING, TokenClaimStatus.UNKNOWN]),
        },
      });
      if (existingActiveClaim) {
        throw new ConflictException(
          'Active claim already exists for this token',
        );
      }

      const balance = await claimableRepository.findOne({
        where: {
          profileId: dto.profileId,
          seasonId: payoutExecutionContext.seasonId,
          tokenSymbol,
        },
      });
      if (!balance) {
        throw new NotFoundException('Claimable token balance not found');
      }

      const currentBalance = this.parseAmount(balance.claimableAmount);
      if (requestedAmount > currentBalance) {
        throw new BadRequestException(
          'Requested amount exceeds claimable balance',
        );
      }

      const tokenClaim = claimRepository.create({
        profileId: dto.profileId,
        seasonId: payoutExecutionContext.seasonId,
        tokenSymbol,
        amount: requestedAmount.toString(),
        status: TokenClaimStatus.PENDING,
        txHash: null,
        recipientWalletAddress: payoutExecutionContext.recipientWalletAddress,
        tokenContractAddress: payoutExecutionContext.tokenContractAddress,
        payoutSenderAddress: null,
        payoutNonce: null,
        serializedPayoutTransaction: null,
        broadcastAt: null,
        reconciledAt: null,
        payoutError: null,
        processedAt: null,
        settlementRecordTxHash: null,
        settlementRecordedAt: null,
      });
      return claimRepository.save(tokenClaim);
    });

    let payoutResult: ClaimPayoutResult;
    let broadcastTxHash: string | null = null;
    let broadcastAttempted = false;
    let payoutRelay: GaslessRelayStatus = {
      action: 'claim',
      relayKind: 'backend-sponsored',
      available: false,
      userPaysGas: false,
      reason: 'claim relay execution failed before submission',
    };
    try {
      if (
        !createdClaim.recipientWalletAddress ||
        !createdClaim.tokenContractAddress
      ) {
        throw new Error('Token claim is missing immutable payout context');
      }
      broadcastAttempted = true;
      const broadcastResult = await this.payoutService.broadcastPayout({
        claimId: createdClaim.id,
        profileId: createdClaim.profileId,
        recipientWalletAddress: createdClaim.recipientWalletAddress,
        tokenSymbol: createdClaim.tokenSymbol,
        tokenContractAddress: createdClaim.tokenContractAddress,
        amount: createdClaim.amount,
      });
      payoutRelay = broadcastResult.relay;

      if (broadcastResult.status === TokenClaimStatus.FAILED) {
        payoutResult = {
          status: TokenClaimStatus.FAILED,
          txHash: null,
          payoutError: broadcastResult.payoutError,
          relay: broadcastResult.relay,
        };
      } else if (
        broadcastResult.status === TokenClaimStatus.UNKNOWN ||
        !broadcastResult.txHash
      ) {
        payoutResult = {
          status: TokenClaimStatus.UNKNOWN,
          txHash: broadcastResult.txHash,
          payoutError: broadcastResult.payoutError,
          relay: broadcastResult.relay,
        };
      } else {
        broadcastTxHash = broadcastResult.txHash;
        try {
          payoutResult = await this.payoutService.resolvePayoutReceipt({
            claimId: createdClaim.id,
            txHash: broadcastTxHash,
            relay: broadcastResult.relay,
          });
        } catch (error) {
          payoutResult = {
            status: TokenClaimStatus.UNKNOWN,
            txHash: broadcastTxHash,
            payoutError: this.errorMessage(error),
            relay: broadcastResult.relay,
          };
        }
      }
    } catch (error) {
      payoutResult = {
        status: broadcastAttempted
          ? TokenClaimStatus.UNKNOWN
          : TokenClaimStatus.FAILED,
        txHash: broadcastTxHash,
        payoutError: this.errorMessage(error),
        relay: payoutRelay,
      };
    }

    const finalizedClaim = await this.dataSource.transaction(
      async (manager) => {
        const claimableRepository = manager.getRepository(
          ClaimableTokenBalance,
        );
        const claimRepository = manager.getRepository(TokenClaim);

        const claim = await claimRepository.findOne({
          where: { id: createdClaim.id, profileId: dto.profileId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!claim) {
          throw new NotFoundException('Token claim not found');
        }

        const balance = await claimableRepository.findOne({
          where: {
            profileId: dto.profileId,
            seasonId: payoutExecutionContext.seasonId,
            tokenSymbol,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!balance) {
          throw new NotFoundException('Claimable token balance not found');
        }

        let remainingClaimableBalance = balance.claimableAmount;
        if (
          claim.status !== TokenClaimStatus.UNKNOWN &&
          claim.status !== TokenClaimStatus.PENDING
        ) {
          return { savedClaim: claim, remainingClaimableBalance };
        }

        const currentBalance = this.parseAmount(balance.claimableAmount);
        const reconciledAt = new Date();

        if (payoutResult.status === TokenClaimStatus.CONFIRMED) {
          if (requestedAmount > currentBalance) {
            throw new BadRequestException(
              'Claimable balance changed before payout confirmation',
            );
          } else {
            const nextBalance = currentBalance - requestedAmount;
            balance.claimableAmount = nextBalance.toString();
            await claimableRepository.save(balance);
            remainingClaimableBalance = balance.claimableAmount;
            claim.status = TokenClaimStatus.CONFIRMED;
            claim.txHash = payoutResult.txHash;
            claim.payoutError = null;
            claim.reconciledAt = reconciledAt;
            claim.processedAt = reconciledAt;
          }
        } else if (payoutResult.status === TokenClaimStatus.UNKNOWN) {
          claim.status = TokenClaimStatus.UNKNOWN;
          claim.txHash = payoutResult.txHash ?? claim.txHash;
          claim.broadcastAt = claim.broadcastAt ?? reconciledAt;
          claim.payoutError = payoutResult.payoutError;
          claim.reconciledAt = reconciledAt;
          claim.processedAt = null;
        } else {
          claim.status = TokenClaimStatus.FAILED;
          claim.txHash = payoutResult.txHash ?? claim.txHash;
          claim.payoutError = payoutResult.payoutError;
          claim.reconciledAt = reconciledAt;
          claim.processedAt = reconciledAt;
        }

        const savedClaim = await claimRepository.save(claim);

        return {
          savedClaim,
          remainingClaimableBalance,
        };
      },
    );

    let settlementRecordedOnchain = false;
    let settlementRecordTxHash: string | null = null;
    if (
      finalizedClaim.savedClaim.status === TokenClaimStatus.CONFIRMED &&
      finalizedClaim.savedClaim.txHash &&
      this.hasPersistedPayoutContext(finalizedClaim.savedClaim)
    ) {
      const settlementResult =
        await this.rewardLedgerOnchainService.recordClaimSettlement({
          claimId: finalizedClaim.savedClaim.id,
          walletAddress: finalizedClaim.savedClaim.recipientWalletAddress,
          tokenContractAddress: finalizedClaim.savedClaim.tokenContractAddress,
          tokenSymbol: finalizedClaim.savedClaim.tokenSymbol,
          amount: finalizedClaim.savedClaim.amount,
          payoutTxHash: finalizedClaim.savedClaim.txHash,
        });
      settlementRecordedOnchain = settlementResult.submitted;
      settlementRecordTxHash = settlementResult.txHash;

      if (settlementResult.submitted) {
        finalizedClaim.savedClaim.settlementRecordTxHash =
          settlementResult.txHash;
        finalizedClaim.savedClaim.settlementRecordedAt = new Date();
        await this.tokenClaimRepository.save(finalizedClaim.savedClaim);
      }
    }

    return {
      claimId: finalizedClaim.savedClaim.id,
      profileId: finalizedClaim.savedClaim.profileId,
      tokenSymbol: finalizedClaim.savedClaim.tokenSymbol,
      amount: finalizedClaim.savedClaim.amount,
      status: finalizedClaim.savedClaim.status,
      txHash: finalizedClaim.savedClaim.txHash,
      broadcastAt: finalizedClaim.savedClaim.broadcastAt,
      reconciledAt: finalizedClaim.savedClaim.reconciledAt,
      payoutError: finalizedClaim.savedClaim.payoutError,
      processedAt: finalizedClaim.savedClaim.processedAt,
      remainingClaimableBalance: finalizedClaim.remainingClaimableBalance,
      relay: payoutResult.relay,
      settlementRecordedOnchain,
      settlementRecordTxHash,
    };
  }

  async processPreparedPayouts(limit = 100): Promise<number> {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new RangeError('Prepared payout batch limit must be from 1 to 100');
    }
    const claims = await this.tokenClaimRepository.find({
      where: {
        status: In([TokenClaimStatus.PENDING, TokenClaimStatus.UNKNOWN]),
      },
      order: { broadcastAt: 'ASC', createdAt: 'ASC' },
      take: limit,
    });

    let terminalized = 0;
    for (const queuedClaim of claims) {
      let claim = queuedClaim;
      if (!claim.txHash || !claim.serializedPayoutTransaction) {
        if (claim.status !== TokenClaimStatus.PENDING) {
          continue;
        }
        if (!this.hasPersistedPayoutContext(claim)) {
          if (
            await this.failUnpreparedClaim(
              claim,
              'Pending payout is missing immutable payout context',
            )
          ) {
            terminalized += 1;
          }
          continue;
        }
        const broadcastResult = await this.payoutService.broadcastPayout({
          claimId: claim.id,
          profileId: claim.profileId,
          recipientWalletAddress: claim.recipientWalletAddress,
          tokenSymbol: claim.tokenSymbol,
          tokenContractAddress: claim.tokenContractAddress,
          amount: claim.amount,
        });
        if (broadcastResult.status === TokenClaimStatus.FAILED) {
          if (
            await this.failUnpreparedClaim(
              claim,
              broadcastResult.payoutError ?? 'Payout preparation failed',
            )
          ) {
            terminalized += 1;
          }
          continue;
        }
        const preparedClaim = await this.tokenClaimRepository.findOne({
          where: { id: claim.id, profileId: claim.profileId },
        });
        if (!preparedClaim?.txHash) {
          continue;
        }
        claim = preparedClaim;
      }
      try {
        const result = await this.reconcileBroadcastClaim(claim);
        if (
          result.status === TokenClaimStatus.CONFIRMED ||
          result.status === TokenClaimStatus.FAILED
        ) {
          terminalized += 1;
        }
      } catch (error) {
        if (!(error instanceof ConflictException)) {
          this.logger.error(
            `Prepared payout reconciliation failed claim=${claim.id}: ${this.errorMessage(error)}`,
          );
        }
      }
    }
    return terminalized;
  }

  private async failUnpreparedClaim(
    queuedClaim: TokenClaim,
    payoutError: string,
  ): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const claimRepository = manager.getRepository(TokenClaim);
      const claim = await claimRepository.findOne({
        where: { id: queuedClaim.id, profileId: queuedClaim.profileId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !claim ||
        claim.status !== TokenClaimStatus.PENDING ||
        claim.txHash ||
        claim.serializedPayoutTransaction
      ) {
        return false;
      }
      const now = new Date();
      claim.status = TokenClaimStatus.FAILED;
      claim.payoutError = payoutError;
      claim.reconciledAt = now;
      claim.processedAt = now;
      await claimRepository.save(claim);
      return true;
    });
  }

  private async reconcileBroadcastClaim(
    activeClaim: TokenClaim,
  ): Promise<CreateTokenClaimResult> {
    if (!activeClaim.txHash) {
      throw new ConflictException('Active claim is missing its payout hash');
    }

    let payoutResult: ClaimPayoutResult;
    try {
      payoutResult = await this.payoutService.resolvePayoutReceipt({
        claimId: activeClaim.id,
        txHash: activeClaim.txHash,
      });
    } catch (error) {
      payoutResult = {
        status: TokenClaimStatus.UNKNOWN,
        txHash: activeClaim.txHash,
        payoutError: this.errorMessage(error),
        relay: this.unavailableClaimRelay(),
      };
    }

    const finalizedClaim = await this.dataSource.transaction(
      async (manager) => {
        const claimableRepository = manager.getRepository(
          ClaimableTokenBalance,
        );
        const claimRepository = manager.getRepository(TokenClaim);
        const claim = await claimRepository.findOne({
          where: { id: activeClaim.id, profileId: activeClaim.profileId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!claim) {
          throw new NotFoundException('Token claim not found');
        }

        const balance = await claimableRepository.findOne({
          where: {
            profileId: claim.profileId,
            seasonId: claim.seasonId ?? IsNull(),
            tokenSymbol: claim.tokenSymbol,
          },
          lock: { mode: 'pessimistic_write' },
        });
        if (!balance) {
          throw new NotFoundException('Claimable token balance not found');
        }

        let remainingClaimableBalance = balance.claimableAmount;
        if (
          claim.status !== TokenClaimStatus.UNKNOWN &&
          claim.status !== TokenClaimStatus.PENDING
        ) {
          return {
            savedClaim: claim,
            remainingClaimableBalance,
          };
        }

        const reconciledAt = new Date();
        if (payoutResult.status === TokenClaimStatus.CONFIRMED) {
          const claimAmount = this.parseAmount(claim.amount);
          const currentBalance = this.parseAmount(balance.claimableAmount);
          if (claimAmount > currentBalance) {
            throw new BadRequestException(
              'Claimable balance changed before payout confirmation',
            );
          }

          balance.claimableAmount = (currentBalance - claimAmount).toString();
          await claimableRepository.save(balance);
          remainingClaimableBalance = balance.claimableAmount;
          claim.status = TokenClaimStatus.CONFIRMED;
          claim.txHash = payoutResult.txHash;
          claim.payoutError = null;
          claim.reconciledAt = reconciledAt;
          claim.processedAt = reconciledAt;
        } else if (payoutResult.status === TokenClaimStatus.FAILED) {
          claim.status = TokenClaimStatus.FAILED;
          claim.txHash = payoutResult.txHash ?? claim.txHash;
          claim.payoutError = payoutResult.payoutError;
          claim.reconciledAt = reconciledAt;
          claim.processedAt = reconciledAt;
        } else {
          claim.status = TokenClaimStatus.UNKNOWN;
          claim.txHash = payoutResult.txHash ?? claim.txHash;
          claim.payoutError = payoutResult.payoutError;
          claim.reconciledAt = reconciledAt;
          claim.processedAt = null;
        }

        const savedClaim = await claimRepository.save(claim);
        return {
          savedClaim,
          remainingClaimableBalance,
        };
      },
    );

    if (finalizedClaim.savedClaim.status === TokenClaimStatus.UNKNOWN) {
      throw new ConflictException('Payout receipt is still unresolved');
    }

    let settlementRecordedOnchain = false;
    let settlementRecordTxHash: string | null = null;
    if (
      finalizedClaim.savedClaim.status === TokenClaimStatus.CONFIRMED &&
      finalizedClaim.savedClaim.txHash &&
      !finalizedClaim.savedClaim.settlementRecordedAt &&
      this.hasPersistedPayoutContext(finalizedClaim.savedClaim)
    ) {
      const settlementResult =
        await this.rewardLedgerOnchainService.recordClaimSettlement({
          claimId: finalizedClaim.savedClaim.id,
          walletAddress: finalizedClaim.savedClaim.recipientWalletAddress,
          tokenContractAddress: finalizedClaim.savedClaim.tokenContractAddress,
          tokenSymbol: finalizedClaim.savedClaim.tokenSymbol,
          amount: finalizedClaim.savedClaim.amount,
          payoutTxHash: finalizedClaim.savedClaim.txHash,
        });
      settlementRecordedOnchain = settlementResult.submitted;
      settlementRecordTxHash = settlementResult.txHash;

      if (settlementResult.submitted) {
        finalizedClaim.savedClaim.settlementRecordTxHash =
          settlementResult.txHash;
        finalizedClaim.savedClaim.settlementRecordedAt = new Date();
        await this.tokenClaimRepository.save(finalizedClaim.savedClaim);
      }
    }

    return {
      claimId: finalizedClaim.savedClaim.id,
      profileId: finalizedClaim.savedClaim.profileId,
      tokenSymbol: finalizedClaim.savedClaim.tokenSymbol,
      amount: finalizedClaim.savedClaim.amount,
      status: finalizedClaim.savedClaim.status,
      txHash: finalizedClaim.savedClaim.txHash,
      broadcastAt: finalizedClaim.savedClaim.broadcastAt,
      reconciledAt: finalizedClaim.savedClaim.reconciledAt,
      payoutError: finalizedClaim.savedClaim.payoutError,
      processedAt: finalizedClaim.savedClaim.processedAt,
      remainingClaimableBalance: finalizedClaim.remainingClaimableBalance,
      relay: payoutResult.relay,
      settlementRecordedOnchain,
      settlementRecordTxHash,
    };
  }

  private async ensureProfileExists(profileId: string): Promise<void> {
    await this.getProfileOrThrow(profileId);
  }

  private async getPayoutExecutionContext(
    profile: Profile,
    tokenSymbol: string,
  ): Promise<{
    recipientWalletAddress: string;
    tokenContractAddress: string;
    seasonId: string;
  }> {
    const wallet = await this.userWalletRepository.findOne({
      where: { id: profile.walletId },
    });
    if (!wallet) {
      throw new NotFoundException('Reward payout wallet target not found');
    }

    const activeSeason = await this.seasonService.getActiveSeason();
    if (!activeSeason) {
      throw new NotFoundException('Active season not found');
    }

    const activePartnerToken = await this.partnerTokenRepository.findOne({
      where: { symbol: tokenSymbol, seasonId: activeSeason.id },
    });
    if (!activePartnerToken) {
      throw new NotFoundException(
        'Partner token contract not found for active season',
      );
    }

    return {
      recipientWalletAddress: wallet.address,
      tokenContractAddress: activePartnerToken.contractAddress,
      seasonId: activeSeason.id,
    };
  }

  private async getProfileOrThrow(profileId: string): Promise<Profile> {
    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    return profile;
  }

  private assertOnboardingCompleted(profile: Profile): void {
    const needsOnboarding =
      profile.onboardingCompletedAt === null ||
      profile.nickname === null ||
      profile.currentAvatarId === null;
    if (needsOnboarding) {
      throw new ForbiddenException(
        'Onboarding must be completed before claim requests are available',
      );
    }
  }

  private assertUuid(value: string, message: string): void {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
        value,
      )
    ) {
      throw new BadRequestException(message);
    }
  }

  private parsePositiveAmount(value: string): bigint {
    const amount = this.parseAmount(value);
    if (amount <= 0n) {
      throw new BadRequestException('Claim amount must be greater than zero');
    }
    return amount;
  }

  private parseAmount(value: string): bigint {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
      throw new BadRequestException(
        'Amount must be a non-negative integer string',
      );
    }
    return BigInt(normalized);
  }

  private hasPersistedPayoutContext(claim: TokenClaim): claim is TokenClaim & {
    recipientWalletAddress: string;
    tokenContractAddress: string;
  } {
    return Boolean(
      claim.recipientWalletAddress?.trim() &&
      claim.tokenContractAddress?.trim() &&
      claim.tokenSymbol.trim(),
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error
      ? error.message
      : 'claim payout execution failed';
  }

  private unavailableClaimRelay(): GaslessRelayStatus {
    return {
      action: 'claim',
      relayKind: 'backend-sponsored',
      available: false,
      userPaysGas: false,
      reason: 'claim receipt resolution failed',
    };
  }
}
