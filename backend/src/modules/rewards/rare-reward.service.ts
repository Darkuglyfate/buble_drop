import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import {
  DataSource,
  EntityManager,
  MoreThanOrEqual,
  Repository,
} from 'typeorm';
import { ClaimableTokenBalance } from '../claim/entities/claimable-token-balance.entity';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { RewardLedgerOnchainService } from '../onchain-relay/reward-ledger-onchain.service';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { SeasonService } from '../partner-token/season.service';
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
  seasonId?: string | null;
  idempotencyKey?: string;
  entityManager?: EntityManager;
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

interface RareRewardRepositories {
  partnerTokenRepository: Repository<PartnerToken>;
  claimableBalanceRepository: Repository<ClaimableTokenBalance>;
  weeklyTokenTicketRepository: Repository<WeeklyTokenTicket>;
  nftDefinitionRepository: Repository<NftDefinition>;
  profileNftOwnershipRepository: Repository<ProfileNftOwnership>;
  cosmeticDefinitionRepository: Repository<CosmeticDefinition>;
  profileCosmeticUnlockRepository: Repository<ProfileCosmeticUnlock>;
  userWalletRepository: Repository<UserWallet>;
  bubbleSessionRepository: Repository<BubbleSession>;
  rewardEventRepository: Repository<RewardEvent>;
}

@Injectable()
export class RareRewardService {
  constructor(
    private readonly dataSource: DataSource,
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
    private readonly seasonService: SeasonService,
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

    if (!input.entityManager) {
      return this.dataSource.transaction((entityManager) =>
        this.issueSessionRareRewards({ ...input, entityManager }),
      );
    }

    const repositories = this.getRepositories(input.entityManager);

    const tokenReward = await this.issueTokenReward(
      input.profile,
      input.session,
      input.seasonId,
      input.idempotencyKey,
      repositories,
      input.entityManager,
    );
    const nftRewards = await this.issueNftRewards(
      input.profile,
      input.session,
      input.seasonId === undefined
        ? (input.session.seasonId ?? null)
        : input.seasonId,
      input.idempotencyKey,
      repositories,
    );
    const cosmeticRewards = await this.issueCosmeticRewards(
      input.profile,
      input.session,
      input.seasonId === undefined
        ? (input.session.seasonId ?? null)
        : input.seasonId,
      input.idempotencyKey,
      repositories,
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
    seasonId: string | null | undefined,
    entitlementIdempotencyKey?: string,
    repositories?: RareRewardRepositories,
    entityManager?: EntityManager,
  ): Promise<{
    tokenSymbolAwarded: string | null;
    tokenAmountAwarded: string;
    weeklyTicketsIssued: number;
    tokenReward: RareRewardTokenOutcome | null;
  }> {
    const rewardRepositories = repositories ?? this.getRepositories();
    const resolvedSeasonId =
      seasonId === undefined
        ? ((await this.seasonService.getActiveSeason(new Date(), entityManager))
            ?.id ?? null)
        : seasonId;
    if (!resolvedSeasonId) {
      return {
        tokenSymbolAwarded: null,
        tokenAmountAwarded: '0',
        weeklyTicketsIssued: 0,
        tokenReward: null,
      };
    }

    const partnerToken =
      await rewardRepositories.partnerTokenRepository.findOne({
        where: { seasonId: resolvedSeasonId },
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
    const ticket = rewardRepositories.weeklyTokenTicketRepository.create({
      profileId: profile.id,
      seasonId: resolvedSeasonId,
      weekStartDate,
      tokenSymbol: partnerToken.symbol,
      weight: 1,
      idempotencyKey: this.getSideEffectIdempotencyKey(
        entitlementIdempotencyKey,
        'token-ticket',
      ),
    });
    await rewardRepositories.weeklyTokenTicketRepository.save(ticket);

    const existingBalance =
      await rewardRepositories.claimableBalanceRepository.findOne({
        where: {
          profileId: profile.id,
          seasonId: resolvedSeasonId,
          tokenSymbol: partnerToken.symbol,
        },
        lock: { mode: 'pessimistic_write' },
      });

    const nextAmount = (
      this.parseAmount(existingBalance?.claimableAmount ?? '0') +
      CLAIMABLE_TOKEN_REWARD_AMOUNT
    ).toString();

    const balance = rewardRepositories.claimableBalanceRepository.create({
      id: existingBalance?.id,
      profileId: profile.id,
      seasonId: resolvedSeasonId,
      tokenSymbol: partnerToken.symbol,
      claimableAmount: nextAmount,
    });
    await rewardRepositories.claimableBalanceRepository.save(balance);

    await rewardRepositories.rewardEventRepository.save(
      rewardRepositories.rewardEventRepository.create({
        profileId: profile.id,
        seasonId: resolvedSeasonId,
        eventType: RewardEventType.TOKEN_TICKET,
        xpAmount: null,
        tokenSymbol: partnerToken.symbol,
        idempotencyKey: this.getSideEffectIdempotencyKey(
          entitlementIdempotencyKey,
          'token',
        ),
        metadata: {
          sessionId: session.id,
          seasonId: resolvedSeasonId,
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
        seasonId: resolvedSeasonId,
        weekStartDate,
      },
    };
  }

  private async issueNftRewards(
    profile: Profile,
    session: BubbleSession,
    seasonId: string | null,
    entitlementIdempotencyKey?: string,
    repositories?: RareRewardRepositories,
  ): Promise<RareRewardCollectibleOutcome[]> {
    const rewardRepositories = repositories ?? this.getRepositories();
    const eligibleDefinitions = (
      await rewardRepositories.nftDefinitionRepository.find()
    ).filter(
      (definition) =>
        definition.minStreak <= profile.currentStreak &&
        definition.minXp <= profile.totalXp,
    );
    if (eligibleDefinitions.length === 0) {
      return [];
    }

    const validCompletedSessions =
      await rewardRepositories.bubbleSessionRepository.count({
        where: {
          profileId: profile.id,
          isCompleted: true,
          activeSeconds: MoreThanOrEqual(
            MIN_ACTIVE_SECONDS_FOR_RARE_REWARD_SESSION,
          ),
        },
      });

    const existingOwnerships =
      await rewardRepositories.profileNftOwnershipRepository.find({
        where: { profileId: profile.id },
        relations: { nftDefinition: true },
        order: { acquiredAt: 'DESC' },
      });
    const ownedDefinitionIds = new Set(
      existingOwnerships.map((ownership) => ownership.nftDefinitionId),
    );
    const latestAcquiredAt = existingOwnerships.reduce<number | null>(
      (latestTimestamp, ownership) => {
        const acquiredAt = ownership.acquiredAt.getTime();
        return latestTimestamp === null
          ? acquiredAt
          : Math.max(latestTimestamp, acquiredAt);
      },
      null,
    );
    const cooldownExpiresAt =
      latestAcquiredAt === null
        ? null
        : existingOwnerships.reduce((latestExpiry, ownership) => {
            if (ownership.acquiredAt.getTime() !== latestAcquiredAt) {
              return latestExpiry;
            }
            return Math.max(
              latestExpiry,
              latestAcquiredAt +
                (ownership.nftDefinition?.cooldownDays ?? 0) *
                  24 *
                  60 *
                  60 *
                  1000,
            );
          }, latestAcquiredAt);
    const rewardAt = session.endedAt ?? new Date();
    if (cooldownExpiresAt !== null && rewardAt.getTime() < cooldownExpiresAt) {
      return [];
    }

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

      const ownership = rewardRepositories.profileNftOwnershipRepository.create(
        {
          profileId: profile.id,
          nftDefinitionId: definition.id,
          idempotencyKey: this.getSideEffectIdempotencyKey(
            entitlementIdempotencyKey,
            `nft:${definition.id}`,
          ),
        },
      );
      await rewardRepositories.profileNftOwnershipRepository.save(ownership);
      awardedRewards.push({
        id: definition.id,
        key: definition.key,
      });
      await this.mirrorOwnershipGrant(profile.walletId, rewardRepositories, {
        rewardKey: definition.key,
        rewardType: 'nft',
        sourceId:
          this.getSideEffectIdempotencyKey(
            entitlementIdempotencyKey,
            `nft:${definition.id}`,
          ) ?? definition.id,
      });

      await rewardRepositories.rewardEventRepository.save(
        rewardRepositories.rewardEventRepository.create({
          profileId: profile.id,
          seasonId,
          eventType: RewardEventType.NFT,
          xpAmount: null,
          tokenSymbol: null,
          idempotencyKey: this.getSideEffectIdempotencyKey(
            entitlementIdempotencyKey,
            `nft:${definition.id}`,
          ),
          metadata: {
            sessionId: session.id,
            nftDefinitionId: definition.id,
            nftKey: definition.key,
          },
        }),
      );
      if (definition.cooldownDays > 0) {
        break;
      }
    }

    return awardedRewards;
  }

  private async issueCosmeticRewards(
    profile: Profile,
    session: BubbleSession,
    seasonId: string | null,
    entitlementIdempotencyKey?: string,
    repositories?: RareRewardRepositories,
  ): Promise<RareRewardCollectibleOutcome[]> {
    const rewardRepositories = repositories ?? this.getRepositories();
    const eligibleDefinitions = (
      await rewardRepositories.cosmeticDefinitionRepository.find()
    ).filter(
      (definition) =>
        definition.minStreak <= profile.currentStreak &&
        definition.minXp <= profile.totalXp,
    );
    if (eligibleDefinitions.length === 0) {
      return [];
    }

    const existingUnlocks =
      await rewardRepositories.profileCosmeticUnlockRepository.find({
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

      const unlock = rewardRepositories.profileCosmeticUnlockRepository.create({
        profileId: profile.id,
        cosmeticDefinitionId: definition.id,
        idempotencyKey: this.getSideEffectIdempotencyKey(
          entitlementIdempotencyKey,
          `cosmetic:${definition.id}`,
        ),
      });
      await rewardRepositories.profileCosmeticUnlockRepository.save(unlock);
      awardedRewards.push({
        id: definition.id,
        key: definition.key,
      });
      await this.mirrorOwnershipGrant(profile.walletId, rewardRepositories, {
        rewardKey: definition.key,
        rewardType: 'cosmetic',
        sourceId:
          this.getSideEffectIdempotencyKey(
            entitlementIdempotencyKey,
            `cosmetic:${definition.id}`,
          ) ?? definition.id,
      });

      await rewardRepositories.rewardEventRepository.save(
        rewardRepositories.rewardEventRepository.create({
          profileId: profile.id,
          seasonId,
          eventType: RewardEventType.COSMETIC,
          xpAmount: null,
          tokenSymbol: null,
          idempotencyKey: this.getSideEffectIdempotencyKey(
            entitlementIdempotencyKey,
            `cosmetic:${definition.id}`,
          ),
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

  private getSideEffectIdempotencyKey(
    entitlementIdempotencyKey: string | undefined,
    suffix: string,
  ): string | null {
    const normalized = entitlementIdempotencyKey?.trim();
    return normalized ? `${normalized}:${suffix}` : null;
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
    repositories: RareRewardRepositories,
    input: {
      rewardKey: string;
      rewardType: 'nft' | 'cosmetic';
      sourceId: string;
    },
  ): Promise<void> {
    const wallet = await repositories.userWalletRepository.findOne({
      where: { id: walletId },
    });
    if (!wallet) {
      return;
    }

    const ownershipGrant = await this.rewardLedgerOnchainService.grantOwnership(
      {
        walletAddress: wallet.address,
        rewardKey: input.rewardKey,
        rewardType: input.rewardType,
        sourceId: input.sourceId,
      },
    );
    if (!ownershipGrant.submitted) {
      throw new Error('Reward ownership grant was not submitted');
    }
  }

  private getRepositories(
    entityManager?: EntityManager,
  ): RareRewardRepositories {
    if (!entityManager) {
      return {
        partnerTokenRepository: this.partnerTokenRepository,
        claimableBalanceRepository: this.claimableBalanceRepository,
        weeklyTokenTicketRepository: this.weeklyTokenTicketRepository,
        nftDefinitionRepository: this.nftDefinitionRepository,
        profileNftOwnershipRepository: this.profileNftOwnershipRepository,
        cosmeticDefinitionRepository: this.cosmeticDefinitionRepository,
        profileCosmeticUnlockRepository: this.profileCosmeticUnlockRepository,
        userWalletRepository: this.userWalletRepository,
        bubbleSessionRepository: this.bubbleSessionRepository,
        rewardEventRepository: this.rewardEventRepository,
      };
    }

    return {
      partnerTokenRepository: entityManager.getRepository(PartnerToken),
      claimableBalanceRepository: entityManager.getRepository(
        ClaimableTokenBalance,
      ),
      weeklyTokenTicketRepository:
        entityManager.getRepository(WeeklyTokenTicket),
      nftDefinitionRepository: entityManager.getRepository(NftDefinition),
      profileNftOwnershipRepository:
        entityManager.getRepository(ProfileNftOwnership),
      cosmeticDefinitionRepository:
        entityManager.getRepository(CosmeticDefinition),
      profileCosmeticUnlockRepository: entityManager.getRepository(
        ProfileCosmeticUnlock,
      ),
      userWalletRepository: entityManager.getRepository(UserWallet),
      bubbleSessionRepository: entityManager.getRepository(BubbleSession),
      rewardEventRepository: entityManager.getRepository(RewardEvent),
    };
  }
}
