import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { UserWallet } from '../profile/entities/user-wallet.entity';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { QualificationService } from '../qualification/qualification.service';
import { CreateTokenClaimDto } from './dto/create-token-claim.dto';
import { ClaimableTokenBalance } from './entities/claimable-token-balance.entity';
import { TokenClaim, TokenClaimStatus } from './entities/token-claim.entity';
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
  processedAt: Date | null;
  remainingClaimableBalance: string;
}

@Injectable()
export class ClaimService {
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
    private readonly qualificationService: QualificationService,
    private readonly payoutService: RewardWalletPayoutService,
  ) {}

  async getClaimableBalances(
    profileId: string,
  ): Promise<ClaimableTokenBalanceView[]> {
    this.assertUuid(profileId, 'Invalid profileId format');
    await this.ensureProfileExists(profileId);

    const balances = await this.claimableBalanceRepository.find({
      where: { profileId },
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

    const qualification = await this.qualificationService.evaluateProgress(
      dto.profileId,
    );
    if (!qualification.rareRewardAccessActive) {
      throw new ForbiddenException(
        'Rare reward access is not active. Claim requests are unavailable in XP-only mode',
      );
    }

    const tokenSymbol = dto.tokenSymbol.trim().toUpperCase();
    if (!tokenSymbol) {
      throw new BadRequestException('tokenSymbol is required');
    }

    const requestedAmount = this.parsePositiveAmount(dto.amount);

    const createdClaim = await this.dataSource.transaction(async (manager) => {
      const claimableRepository = manager.getRepository(ClaimableTokenBalance);
      const claimRepository = manager.getRepository(TokenClaim);

      const existingPendingClaim = await claimRepository.findOne({
        where: {
          profileId: dto.profileId,
          tokenSymbol,
          status: TokenClaimStatus.PENDING,
        },
      });
      if (existingPendingClaim) {
        throw new ConflictException(
          'Pending claim already exists for this token',
        );
      }

      const balance = await claimableRepository.findOne({
        where: {
          profileId: dto.profileId,
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
        tokenSymbol,
        amount: requestedAmount.toString(),
        status: TokenClaimStatus.PENDING,
        txHash: null,
        processedAt: null,
      });
      return claimRepository.save(tokenClaim);
    });

    let payoutResult: Awaited<
      ReturnType<RewardWalletPayoutService['processPendingPayout']>
    >;
    try {
      const payoutExecutionContext = await this.getPayoutExecutionContext(
        profile,
        tokenSymbol,
      );
      payoutResult = await this.payoutService.processPendingPayout({
        claimId: createdClaim.id,
        profileId: createdClaim.profileId,
        recipientWalletAddress: payoutExecutionContext.recipientWalletAddress,
        tokenSymbol: createdClaim.tokenSymbol,
        tokenContractAddress: payoutExecutionContext.tokenContractAddress,
        amount: createdClaim.amount,
      });
    } catch {
      payoutResult = {
        status: TokenClaimStatus.FAILED,
        txHash: null,
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
        });
        if (!claim) {
          throw new NotFoundException('Token claim not found');
        }

        const balance = await claimableRepository.findOne({
          where: {
            profileId: dto.profileId,
            tokenSymbol,
          },
        });
        if (!balance) {
          throw new NotFoundException('Claimable token balance not found');
        }

        const currentBalance = this.parseAmount(balance.claimableAmount);
        let remainingClaimableBalance = balance.claimableAmount;
        const processedAt = new Date();

        if (payoutResult.status === TokenClaimStatus.CONFIRMED) {
          if (requestedAmount > currentBalance) {
            claim.status = TokenClaimStatus.FAILED;
            claim.txHash = null;
            claim.processedAt = processedAt;
          } else {
            const nextBalance = currentBalance - requestedAmount;
            balance.claimableAmount = nextBalance.toString();
            await claimableRepository.save(balance);
            remainingClaimableBalance = balance.claimableAmount;
            claim.status = TokenClaimStatus.CONFIRMED;
            claim.txHash = payoutResult.txHash;
            claim.processedAt = processedAt;
          }
        } else {
          claim.status = TokenClaimStatus.FAILED;
          claim.txHash = null;
          claim.processedAt = processedAt;
        }

        const savedClaim = await claimRepository.save(claim);

        return {
          savedClaim,
          remainingClaimableBalance,
        };
      },
    );

    return {
      claimId: finalizedClaim.savedClaim.id,
      profileId: finalizedClaim.savedClaim.profileId,
      tokenSymbol: finalizedClaim.savedClaim.tokenSymbol,
      amount: finalizedClaim.savedClaim.amount,
      status: finalizedClaim.savedClaim.status,
      txHash: finalizedClaim.savedClaim.txHash,
      processedAt: finalizedClaim.savedClaim.processedAt,
      remainingClaimableBalance: finalizedClaim.remainingClaimableBalance,
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
  }> {
    const wallet = await this.userWalletRepository.findOne({
      where: { id: profile.walletId },
    });
    if (!wallet) {
      throw new NotFoundException('Reward payout wallet target not found');
    }

    const partnerTokens = await this.partnerTokenRepository.find({
      where: { symbol: tokenSymbol },
      relations: { season: true },
      order: { createdAt: 'DESC' },
    });
    const activePartnerToken =
      partnerTokens.find((partnerToken) => partnerToken.season?.isActive) ??
      partnerTokens[0];
    if (!activePartnerToken) {
      throw new NotFoundException('Partner token contract not found');
    }

    return {
      recipientWalletAddress: wallet.address,
      tokenContractAddress: activePartnerToken.contractAddress,
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
}
