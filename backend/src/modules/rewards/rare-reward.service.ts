import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { MoreThanOrEqual, Repository } from 'typeorm';
import { ClaimableTokenBalance } from '../claim/entities/claimable-token-balance.entity';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { RewardLedgerOnchainService } from '../onchain-relay/reward-ledger-onchain.service';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { Season } from '../partner-token/entities/season.entity';
import { CosmeticDefinition } from '../profile/entities/cosmetic-definition.entity';
import { NftDefinition } from '../profile/entities/nft-definition.entity';
import { ProfileCosmeticUnlock } from '../profile/entities/profile-cosmetic-unlock.entity';
import { ProfileNftOwnership } from '../profile/entities/profile-nft-ownership.entity';
import { Profile } from '../profile/entities/profile.entity';
import { UserWallet } from '../profile/entities/user-wallet.entity';
import { RewardEvent, RewardEventType } from './entities/reward-event.entity';
import { WeeklyTokenTicket } from './entities/weekly-token-ticket.entity';

const CLAIMABLE_TOKEN_REWARD_AMOUNT = 1n;
const MIN_ACTIVE_SECONDS_FOR_RARE_REWARD_SESSION = 180;

export interface RareRewardIssueInput {
  profile: Profile;
  session: BubbleSession;
  rareRewardAccessActive: boolean;
  isCompletionEligible: boolean;
}

export interface RareRewardTokenOutcome {
  tokenSymbol: string;
  tokenAmountAwarded: string;
  weeklyTicketsIssued: number;
  seasonId: string;
  weekStartDate: string;
}

export interface RareRewardCollectibleOutcome {
  id: string;
  key: string;
}

export interface RareRewardIssueResult {
  tokenSymbolAwarded: string | null;
  tokenAmountAwarded: string;
  weeklyTicketsIssued: number;
  nftIdsAwarded: string[];
  cosmeticIdsAwarded: string[];
  tokenReward: RareRewardTokenOutcome | null;
  nftRewards: RareRewardCollectibleOutcome[];
  cosmeticRewards: RareRewardCollectibleOutcome[];
}

@Injectable()
export class RareRewardService {
  constructor(
    @InjectRepository(Season)
    private readonly seasonRepository: Repository<Season>,
    @InjectRepository(PartnerToken)
    private readonly partnerTokenRepository: Repository<PartnerToken>,
    @InjectRepository(ClaimableTokenBalance)
    private readonly claimableBalanceRepository: Repository<ClaimableTokenBalance>,
    @InjectRepository(WeeklyTokenTicket)
    private readonly weeklyTokenTicketRepository: Repository<WeeklyTokenTicket>,
    @InjectRepository(NftDefinition)
    private readonly nftDefinitionRepository: Repository<NftDefinition>,
    @InjectRepository(ProfileNftOwnership)
    private readonly profileNftOwnershipRepository: Repository<ProfileNftOwnership>,
    @InjectRepository(CosmeticDefinition)
    private readonly cosmeticDefinitionRepository: Repository<CosmeticDefinition>,
    @InjectRepository(ProfileCosmeticUnlock)
    private readonly profileCosmeticUnlockRepository: Repository<ProfileCosmeticUnlock>,
    @InjectRepository(UserWallet)
    private readonly userWalletRepository: Repository<UserWallet>,
    @InjectRepository(BubbleSession)
    private readonly bubbleSessionRepository: Repository<BubbleSession>,
    @InjectRepository(RewardEvent)
    private readonly rewardEventRepository: Repository<RewardEvent>,
    private readonly rewardLedgerOnchainService: RewardLedgerOnchainService,
  ) {}

  async issueSessionRareRewards(
    input: RareRewardIssueInput,
  ): Promise<RareRewardIssueResult> {
    if (!input.rareRewardAccessActive || !input.isCompletionEligible) {
      return {
        tokenSymbolAwarded: null,
        tokenAmountAwarded: '0',
        weeklyTicketsIssued: 0,
        nftIdsAwarded: [],
        cosmeticIdsAwarded: [],
        tokenReward: null,
        nftRewards: [],
        cosmeticRewards: [],
      };
    }

    const tokenReward = await this.issueTokenReward(
      input.profile,
      input.session,
    );
    const nftRewards = await this.issueNftRewards(input.profile, input.session);
    const cosmeticRewards = await this.issueCosmeticRewards(
      input.profile,
      input.session,
    );

    return {
      tokenSymbolAwarded: tokenReward.tokenSymbolAwarded,
      tokenAmountAwarded: tokenReward.tokenAmountAwarded,
      weeklyTicketsIssued: tokenReward.weeklyTicketsIssued,
      nftIdsAwarded: nftRewards.map((reward) => reward.id),
      cosmeticIdsAwarded: cosmeticRewards.map((reward) => reward.id),
      tokenReward: tokenReward.tokenReward,
      nftRewards,
      cosmeticRewards,
    };
  }

  private async issueTokenReward(
    profile: Profile,
    session: BubbleSession,
  ): Promise<{
    tokenSymbolAwarded: string | null;
    tokenAmountAwarded: string;
    weeklyTicketsIssued: number;
    tokenReward: RareRewardTokenOutcome | null;
  }> {
    const activeSeason = await this.seasonRepository.findOne({
      where: { isActive: true },
      order: { startDate: 'DESC' },
    });
    if (!activeSeason) {
      return {
        tokenSymbolAwarded: null,
        tokenAmountAwarded: '0',
        weeklyTicketsIssued: 0,
        tokenReward: null,
      };
    }

    const partnerToken = await this.partnerTokenRepository.findOne({
      where: { seasonId: activeSeason.id },
      order: { createdAt: 'ASC' },
    });
    if (!partnerToken) {
      return {
        tokenSymbolAwarded: null,
        tokenAmountAwarded: '0',
        weeklyTicketsIssued: 0,
        tokenReward: null,
      };
    }

    const weekStartDate = this.getUtcWeekStartDate(
      session.endedAt ?? session.startedAt,
    );
    const ticket = this.weeklyTokenTicketRepository.create({
      profileId: profile.id,
      weekStartDate,
      tokenSymbol: partnerToken.symbol,
      weight: 1,
    });
    await this.weeklyTokenTicketRepository.save(ticket);

    const existingBalance = await this.claimableBalanceRepository.findOne({
      where: {
        profileId: profile.id,
        tokenSymbol: partnerToken.symbol,
      },
    });

    const nextAmount = (
      this.parseAmount(existingBalance?.claimableAmount ?? '0') +
      CLAIMABLE_TOKEN_REWARD_AMOUNT
    ).toString();

    const balance = this.claimableBalanceRepository.create({
      id: existingBalance?.id,
      profileId: profile.id,
      tokenSymbol: partnerToken.symbol,
      claimableAmount: nextAmount,
    });
    await this.claimableBalanceRepository.save(balance);

    await this.rewardEventRepository.save(
      this.rewardEventRepository.create({
        profileId: profile.id,
        eventType: RewardEventType.TOKEN_TICKET,
        xpAmount: null,
        tokenSymbol: partnerToken.symbol,
        metadata: {
          sessionId: session.id,
          seasonId: activeSeason.id,
          weekStartDate,
          amountAwarded: CLAIMABLE_TOKEN_REWARD_AMOUNT.toString(),
        },
      }),
    );

    return {
      tokenSymbolAwarded: partnerToken.symbol,
      tokenAmountAwarded: CLAIMABLE_TOKEN_REWARD_AMOUNT.toString(),
      weeklyTicketsIssued: 1,
      tokenReward: {
        tokenSymbol: partnerToken.symbol,
        tokenAmountAwarded: CLAIMABLE_TOKEN_REWARD_AMOUNT.toString(),
        weeklyTicketsIssued: 1,
        seasonId: activeSeason.id,
        weekStartDate,
      },
    };
  }

  private async issueNftRewards(
    profile: Profile,
    session: BubbleSession,
  ): Promise<RareRewardCollectibleOutcome[]> {
    const eligibleDefinitions = (
      await this.nftDefinitionRepository.find()
    ).filter(
      (definition) =>
        definition.minStreak <= profile.currentStreak &&
        definition.minXp <= profile.totalXp,
    );
    if (eligibleDefinitions.length === 0) {
      return [];
    }

    const validCompletedSessions = await this.bubbleSessionRepository.count({
      where: {
        profileId: profile.id,
        isCompleted: true,
        activeSeconds: MoreThanOrEqual(
          MIN_ACTIVE_SECONDS_FOR_RARE_REWARD_SESSION,
        ),
      },
    });

    const existingOwnerships = await this.profileNftOwnershipRepository.find({
      where: { profileId: profile.id },
    });
    const ownedDefinitionIds = new Set(
      existingOwnerships.map((ownership) => ownership.nftDefinitionId),
    );

    const awardedRewards: RareRewardCollectibleOutcome[] = [];

    for (const definition of eligibleDefinitions) {
      if (ownedDefinitionIds.has(definition.id)) {
        continue;
      }
      if (definition.minSessions > validCompletedSessions) {
        continue;
      }
      if (
        !this.passesNftDropChance(
          profile.id,
          session.id,
          definition.id,
          definition.dropChancePercent,
        )
      ) {
        continue;
      }

      const ownership = this.profileNftOwnershipRepository.create({
        profileId: profile.id,
        nftDefinitionId: definition.id,
      });
      await this.profileNftOwnershipRepository.save(ownership);
      awardedRewards.push({
        id: definition.id,
        key: definition.key,
      });
      await this.mirrorOwnershipGrant(profile.walletId, {
        rewardKey: definition.key,
        rewardType: 'nft',
        sourceId: definition.id,
      });

      await this.rewardEventRepository.save(
        this.rewardEventRepository.create({
          profileId: profile.id,
          eventType: RewardEventType.NFT,
          xpAmount: null,
          tokenSymbol: null,
          metadata: {
            sessionId: session.id,
            nftDefinitionId: definition.id,
            nftKey: definition.key,
          },
        }),
      );
    }

    return awardedRewards;
  }

  private async issueCosmeticRewards(
    profile: Profile,
    session: BubbleSession,
  ): Promise<RareRewardCollectibleOutcome[]> {
    const eligibleDefinitions = (
      await this.cosmeticDefinitionRepository.find()
    ).filter(
      (definition) =>
        definition.minStreak <= profile.currentStreak &&
        definition.minXp <= profile.totalXp,
    );
    if (eligibleDefinitions.length === 0) {
      return [];
    }

    const existingUnlocks = await this.profileCosmeticUnlockRepository.find({
      where: { profileId: profile.id },
    });
    const unlockedDefinitionIds = new Set(
      existingUnlocks.map((unlock) => unlock.cosmeticDefinitionId),
    );

    const awardedRewards: RareRewardCollectibleOutcome[] = [];

    for (const definition of eligibleDefinitions) {
      if (unlockedDefinitionIds.has(definition.id)) {
        continue;
      }

      const unlock = this.profileCosmeticUnlockRepository.create({
        profileId: profile.id,
        cosmeticDefinitionId: definition.id,
      });
      await this.profileCosmeticUnlockRepository.save(unlock);
      awardedRewards.push({
        id: definition.id,
        key: definition.key,
      });
      await this.mirrorOwnershipGrant(profile.walletId, {
        rewardKey: definition.key,
        rewardType: 'cosmetic',
        sourceId: definition.id,
      });

      await this.rewardEventRepository.save(
        this.rewardEventRepository.create({
          profileId: profile.id,
          eventType: RewardEventType.COSMETIC,
          xpAmount: null,
          tokenSymbol: null,
          metadata: {
            sessionId: session.id,
            cosmeticDefinitionId: definition.id,
            cosmeticKey: definition.key,
          },
        }),
      );
    }

    return awardedRewards;
  }

  private getUtcWeekStartDate(date: Date): string {
    const normalized = new Date(date);
    normalized.setUTCHours(0, 0, 0, 0);
    const weekday = normalized.getUTCDay();
    const diffToMonday = (weekday + 6) % 7;
    normalized.setUTCDate(normalized.getUTCDate() - diffToMonday);
    return normalized.toISOString().slice(0, 10);
  }

  private parseAmount(value: string): bigint {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
      return 0n;
    }
    return BigInt(normalized);
  }

  private passesNftDropChance(
    profileId: string,
    sessionId: string,
    nftDefinitionId: string,
    dropChancePercent: string,
  ): boolean {
    const chance = Number.parseFloat(dropChancePercent);
    if (!Number.isFinite(chance) || chance <= 0) {
      return false;
    }
    if (chance >= 100) {
      return true;
    }

    const seed = `${profileId}:${sessionId}:${nftDefinitionId}`;
    const hash = createHash('sha256').update(seed).digest('hex').slice(0, 8);
    const bucket = Number.parseInt(hash, 16) % 10_000;
    return bucket < Math.floor(chance * 100);
  }

  private async mirrorOwnershipGrant(
    walletId: string,
    input: {
      rewardKey: string;
      rewardType: 'nft' | 'cosmetic';
      sourceId: string;
    },
  ): Promise<void> {
    const wallet = await this.userWalletRepository.findOne({
      where: { id: walletId },
    });
    if (!wallet) {
      return;
    }

    await this.rewardLedgerOnchainService.grantOwnership({
      walletAddress: wallet.address,
      rewardKey: input.rewardKey,
      rewardType: input.rewardType,
      sourceId: input.sourceId,
    });
  }
}
