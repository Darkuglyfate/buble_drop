import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { ClaimableTokenBalance } from '../claim/entities/claimable-token-balance.entity';
import { QualificationStatus } from '../qualification/entities/qualification-state.entity';
import { QualificationService } from '../qualification/qualification.service';
import { XpService, XpSource } from '../rewards/xp.service';
import { Avatar } from './entities/avatar.entity';
import { CosmeticDefinition } from './entities/cosmetic-definition.entity';
import { NftDefinition } from './entities/nft-definition.entity';
import { Profile } from './entities/profile.entity';
import { ProfileAvatarUnlock } from './entities/profile-avatar-unlock.entity';
import { ProfileCosmeticUnlock } from './entities/profile-cosmetic-unlock.entity';
import { ProfileNftOwnership } from './entities/profile-nft-ownership.entity';
import { RankFrameDefinition } from './entities/rank-frame-definition.entity';
import { UserWallet } from './entities/user-wallet.entity';

export interface ProfileStartupState {
  walletId: string;
  walletAddress: string;
  profileId: string;
  nickname: string | null;
  currentAvatarId: string | null;
  totalXp: number;
  currentStreak: number;
  needsOnboarding: boolean;
}

export interface OnboardingCompletionResult {
  profileId: string;
  nickname: string;
  avatarId: string;
  onboardingCompletedAt: Date;
  onboardingXpGranted: number;
  totalXp: number;
  needsOnboarding: false;
}

export interface AvatarSelectionResult {
  profileId: string;
  avatarId: string;
  avatarLabel: string;
}

const DEFAULT_ONBOARDING_XP_AMOUNT = 20;

export interface ProfileSummary {
  onboardingState: {
    needsOnboarding: boolean;
    onboardingCompletedAt: Date | null;
  };
  profileIdentity: {
    profileId: string;
    walletAddress: string;
    nickname: string | null;
  };
  avatarState: {
    currentAvatar: {
      id: string;
      key: string;
      label: string;
    } | null;
    unlockedAvatarCount: number;
  };
  xpSummary: {
    totalXp: number;
    currentStreak: number;
  };
  rankFrameState: {
    currentFrame: {
      id: string;
      key: string;
      label: string;
      minLifetimeXp: number;
    } | null;
    nextFrame: {
      id: string;
      key: string;
      label: string;
      minLifetimeXp: number;
      xpToReach: number;
    } | null;
  };
  qualificationState: {
    status: QualificationStatus;
  };
  rareRewardAccess: {
    active: boolean;
  };
  claimableTokenBalanceSummary: {
    totalClaimableAmount: string;
    tokenCount: number;
    balances: Array<{
      tokenSymbol: string;
      claimableAmount: string;
    }>;
  };
  styleState: {
    equippedStyle:
      | {
          rewardId: string;
          rewardKey: string;
          rarity: 'common' | 'rare' | 'epic' | 'legendary';
          source: 'nft' | 'cosmetic';
          variant: string;
          appliedAt: string;
        }
      | null;
  };
}

export interface EquippedStyleResult {
  profileId: string;
  equippedStyle: {
    rewardId: string;
    rewardKey: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    source: 'nft' | 'cosmetic';
    variant: string;
    appliedAt: string;
  };
}

export interface StarterAvatarView {
  id: string;
  key: string;
  label: string;
}

export interface LeaderboardEntry {
  rank: number;
  profileId: string;
  nickname: string;
  totalXp: number;
  currentStreak: number;
}

export interface RewardsInventoryView {
  profileId: string;
  nftCount: number;
  cosmeticCount: number;
  nfts: Array<{
    id: string;
    key: string;
    label: string;
    tier: string;
    acquiredAt: Date;
  }>;
  cosmetics: Array<{
    id: string;
    key: string;
    label: string;
    unlockedAt: Date;
  }>;
}

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(UserWallet)
    private readonly walletRepository: Repository<UserWallet>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(Avatar)
    private readonly avatarRepository: Repository<Avatar>,
    @InjectRepository(ProfileAvatarUnlock)
    private readonly profileAvatarUnlockRepository: Repository<ProfileAvatarUnlock>,
    @InjectRepository(RankFrameDefinition)
    private readonly rankFrameDefinitionRepository: Repository<RankFrameDefinition>,
    @InjectRepository(ProfileNftOwnership)
    private readonly profileNftOwnershipRepository: Repository<ProfileNftOwnership>,
    @InjectRepository(NftDefinition)
    private readonly nftDefinitionRepository: Repository<NftDefinition>,
    @InjectRepository(ProfileCosmeticUnlock)
    private readonly profileCosmeticUnlockRepository: Repository<ProfileCosmeticUnlock>,
    @InjectRepository(CosmeticDefinition)
    private readonly cosmeticDefinitionRepository: Repository<CosmeticDefinition>,
    @InjectRepository(ClaimableTokenBalance)
    private readonly claimableTokenBalanceRepository: Repository<ClaimableTokenBalance>,
    private readonly qualificationService: QualificationService,
    private readonly xpService: XpService,
  ) {}

  async connectWallet(walletAddress: string): Promise<ProfileStartupState> {
    const normalizedAddress = this.normalizeWalletAddress(walletAddress);

    let wallet = await this.walletRepository.findOne({
      where: { address: normalizedAddress },
    });

    if (!wallet) {
      wallet = this.walletRepository.create({
        address: normalizedAddress,
      });
      wallet = await this.walletRepository.save(wallet);
    }

    let profile = await this.profileRepository.findOne({
      where: { walletId: wallet.id },
    });

    if (!profile) {
      profile = this.profileRepository.create({
        walletId: wallet.id,
        nickname: null,
        currentAvatarId: null,
        totalXp: 0,
        currentStreak: 0,
        onboardingCompletedAt: null,
      });
      profile = await this.profileRepository.save(profile);
    }

    return {
      walletId: wallet.id,
      walletAddress: wallet.address,
      profileId: profile.id,
      nickname: profile.nickname,
      currentAvatarId: profile.currentAvatarId,
      totalXp: profile.totalXp,
      currentStreak: profile.currentStreak,
      needsOnboarding:
        profile.onboardingCompletedAt === null ||
        profile.nickname === null ||
        profile.currentAvatarId === null,
    };
  }

  async completeOnboarding(
    profileId: string,
    nickname: string,
    avatarId: string,
  ): Promise<OnboardingCompletionResult> {
    this.assertUuid(profileId, 'Invalid profileId format');
    this.assertUuid(avatarId, 'Invalid avatarId format');

    const normalizedNickname = nickname.trim();
    if (!normalizedNickname || normalizedNickname.length > 32) {
      throw new BadRequestException(
        'Nickname must be between 1 and 32 characters',
      );
    }

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }

    if (profile.onboardingCompletedAt !== null) {
      throw new ConflictException(
        'Onboarding has already been completed for this profile',
      );
    }

    const starterAvatars = await this.avatarRepository.find({
      where: { isStarter: true },
      order: { createdAt: 'ASC' },
    });
    const starterAvatar =
      starterAvatars.find((avatar) => avatar.id === avatarId) ?? null;
    if (!starterAvatar) {
      throw new BadRequestException(
        'Avatar must be one of approved starter avatars',
      );
    }

    profile.nickname = normalizedNickname;
    profile.currentAvatarId = starterAvatar.id;
    profile.onboardingCompletedAt = new Date();

    await this.ensureStarterAvatarsUnlocked(
      profile.id,
      starterAvatars.map((avatar) => avatar.id),
    );

    let onboardingXpGranted = 0;
    const onboardingXpAmount = this.getConfiguredNonNegativeInteger(
      'ONBOARDING_XP_AMOUNT',
      DEFAULT_ONBOARDING_XP_AMOUNT,
    );
    if (onboardingXpAmount > 0) {
      const xpGrant = await this.xpService.grantXp(profile.id, [
        {
          source: XpSource.ONBOARDING_COMPLETION,
          amount: onboardingXpAmount,
          metadata: {
            avatarId: starterAvatar.id,
          },
        },
      ]);
      onboardingXpGranted = xpGrant.grantedTotal;
      profile.totalXp += onboardingXpGranted;
    }

    const savedProfile = await this.profileRepository.save(profile);

    return {
      profileId: savedProfile.id,
      nickname: savedProfile.nickname ?? normalizedNickname,
      avatarId: savedProfile.currentAvatarId ?? starterAvatar.id,
      onboardingCompletedAt: savedProfile.onboardingCompletedAt ?? new Date(),
      onboardingXpGranted,
      totalXp: savedProfile.totalXp,
      needsOnboarding: false,
    };
  }

  async getStarterAvatars(): Promise<StarterAvatarView[]> {
    const startedAt = Date.now();

    try {
      const avatars = await this.avatarRepository.find({
        where: { isStarter: true },
        order: { createdAt: 'ASC' },
      });

      const durationMs = Date.now() - startedAt;
      if (durationMs > 1000) {
        this.logger.warn(
          `Starter avatar query completed slowly in ${durationMs}ms`,
        );
      }

      return avatars.map((avatar) => ({
        id: avatar.id,
        key: avatar.key,
        label: avatar.label,
      }));
    } catch (error) {
      const durationMs = Date.now() - startedAt;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(
        `Starter avatar query failed after ${durationMs}ms: ${message}`,
      );
      throw error;
    }
  }

  async selectAvatar(
    profileId: string,
    avatarId: string,
  ): Promise<AvatarSelectionResult> {
    this.assertUuid(profileId, 'Invalid profileId format');
    this.assertUuid(avatarId, 'Invalid avatarId format');

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    this.assertOnboardingCompleted(
      profile,
      'Onboarding must be completed before avatar switch is allowed',
    );

    const avatar = await this.avatarRepository.findOne({
      where: { id: avatarId, isStarter: true },
    });
    if (!avatar) {
      throw new BadRequestException(
        'Avatar must be one of approved starter avatars',
      );
    }

    profile.currentAvatarId = avatar.id;
    const savedProfile = await this.profileRepository.save(profile);

    return {
      profileId: savedProfile.id,
      avatarId: avatar.id,
      avatarLabel: avatar.label,
    };
  }

  async getProfileSummary(profileId: string): Promise<ProfileSummary> {
    this.assertUuid(profileId, 'Invalid profileId format');

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new BadRequestException('Profile not found');
    }

    const wallet = await this.walletRepository.findOne({
      where: { id: profile.walletId },
    });
    if (!wallet) {
      throw new BadRequestException('Wallet not found for profile');
    }

    const currentAvatar = profile.currentAvatarId
      ? await this.avatarRepository.findOne({
          where: { id: profile.currentAvatarId },
        })
      : null;
    const unlockedAvatarCount = await this.profileAvatarUnlockRepository.count({
      where: { profileId: profile.id },
    });

    const rankFrames = await this.rankFrameDefinitionRepository.find({
      order: { minLifetimeXp: 'ASC' },
    });
    const currentFrame =
      rankFrames
        .filter((frame) => frame.minLifetimeXp <= profile.totalXp)
        .slice(-1)[0] ?? null;
    const nextFrame =
      rankFrames.find((frame) => frame.minLifetimeXp > profile.totalXp) ?? null;

    const qualification = await this.qualificationService.evaluateProgress(
      profile.id,
    );
    const qualificationStatus = qualification.qualificationStatus;
    const rareRewardAccessActive = qualification.rareRewardAccessActive;

    const balances = await this.claimableTokenBalanceRepository.find({
      where: { profileId: profile.id },
      order: { tokenSymbol: 'ASC' },
    });
    const positiveBalances = balances
      .filter((item) => this.parseAmount(item.claimableAmount) > 0n)
      .map((item) => ({
        tokenSymbol: item.tokenSymbol,
        claimableAmount: item.claimableAmount,
      }));
    const totalClaimableAmount = positiveBalances
      .reduce((sum, item) => sum + this.parseAmount(item.claimableAmount), 0n)
      .toString();
    const needsOnboarding = this.profileNeedsOnboarding(profile);

    return {
      onboardingState: {
        needsOnboarding,
        onboardingCompletedAt: profile.onboardingCompletedAt,
      },
      profileIdentity: {
        profileId: profile.id,
        walletAddress: wallet.address,
        nickname: profile.nickname,
      },
      avatarState: {
        currentAvatar: currentAvatar
          ? {
              id: currentAvatar.id,
              key: currentAvatar.key,
              label: currentAvatar.label,
            }
          : null,
        unlockedAvatarCount,
      },
      xpSummary: {
        totalXp: profile.totalXp,
        currentStreak: profile.currentStreak,
      },
      rankFrameState: {
        currentFrame: currentFrame
          ? {
              id: currentFrame.id,
              key: currentFrame.key,
              label: currentFrame.label,
              minLifetimeXp: currentFrame.minLifetimeXp,
            }
          : null,
        nextFrame: nextFrame
          ? {
              id: nextFrame.id,
              key: nextFrame.key,
              label: nextFrame.label,
              minLifetimeXp: nextFrame.minLifetimeXp,
              xpToReach: Math.max(0, nextFrame.minLifetimeXp - profile.totalXp),
            }
          : null,
      },
      qualificationState: {
        status: qualificationStatus,
      },
      rareRewardAccess: {
        active: rareRewardAccessActive,
      },
      claimableTokenBalanceSummary: {
        totalClaimableAmount,
        tokenCount: positiveBalances.length,
        balances: positiveBalances,
      },
      styleState: {
        equippedStyle: await this.loadEquippedStyleSnapshot(profile.id),
      },
    };
  }

  async equipStyle(
    profileId: string,
    rewardId: string,
    rewardKey: string,
    rarity: 'common' | 'rare' | 'epic' | 'legendary',
    source: 'nft' | 'cosmetic',
    variant: string,
  ): Promise<EquippedStyleResult> {
    this.assertUuid(profileId, 'Invalid profileId format');
    this.assertUuid(rewardId, 'Invalid rewardId format');

    const normalizedRewardKey = rewardKey.trim();
    if (!normalizedRewardKey) {
      throw new BadRequestException('rewardKey must not be empty');
    }
    const normalizedVariant = variant.trim();
    if (!normalizedVariant) {
      throw new BadRequestException('variant must not be empty');
    }

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    this.assertOnboardingCompleted(
      profile,
      'Onboarding must be completed before style equip is allowed',
    );

    const equippedStyle: EquippedStyleResult['equippedStyle'] = {
      rewardId,
      rewardKey: normalizedRewardKey,
      rarity,
      source,
      variant: normalizedVariant,
      appliedAt: new Date().toISOString(),
    };

    try {
      await this.profileRepository.query(
        `UPDATE "profiles" SET "equippedStyleSnapshot" = $1, "updatedAt" = now() WHERE "id" = $2`,
        [JSON.stringify(equippedStyle), profile.id],
      );
    } catch (error) {
      if (this.isMissingEquippedStyleSnapshotColumnError(error)) {
        throw new ConflictException(
          'Style sync is temporarily unavailable. Apply profile migration and retry.',
        );
      }
      throw error;
    }

    return {
      profileId: profile.id,
      equippedStyle,
    };
  }

  async getLeaderboard(limit = 20): Promise<LeaderboardEntry[]> {
    const normalizedLimit = Number.isFinite(limit)
      ? Math.min(Math.max(Math.floor(limit), 1), 100)
      : 20;

    const profiles = await this.profileRepository.find({
      order: { totalXp: 'DESC', currentStreak: 'DESC', createdAt: 'ASC' },
      take: normalizedLimit,
    });

    return profiles.map((profile, index) => ({
      rank: index + 1,
      profileId: profile.id,
      nickname: profile.nickname ?? `Player-${profile.id.slice(0, 8)}`,
      totalXp: profile.totalXp,
      currentStreak: profile.currentStreak,
    }));
  }

  async getRewardsInventory(profileId: string): Promise<RewardsInventoryView> {
    this.assertUuid(profileId, 'Invalid profileId format');

    const profile = await this.profileRepository.findOne({
      where: { id: profileId },
    });
    if (!profile) {
      throw new NotFoundException('Profile not found');
    }
    this.assertOnboardingCompleted(
      profile,
      'Onboarding must be completed before rewards inventory is available',
    );

    const nftOwnerships = await this.profileNftOwnershipRepository.find({
      where: { profileId },
      order: { acquiredAt: 'DESC' },
    });
    const nftDefinitions = nftOwnerships.length
      ? await this.nftDefinitionRepository.find({
          where: {
            id: In(nftOwnerships.map((item) => item.nftDefinitionId)),
          },
        })
      : [];
    const nftDefinitionMap = new Map(
      nftDefinitions.map((item) => [item.id, item]),
    );

    const cosmeticUnlocks = await this.profileCosmeticUnlockRepository.find({
      where: { profileId },
      order: { unlockedAt: 'DESC' },
    });
    const cosmeticDefinitions = cosmeticUnlocks.length
      ? await this.cosmeticDefinitionRepository.find({
          where: {
            id: In(cosmeticUnlocks.map((item) => item.cosmeticDefinitionId)),
          },
        })
      : [];
    const cosmeticDefinitionMap = new Map(
      cosmeticDefinitions.map((item) => [item.id, item]),
    );

    const nfts = nftOwnerships
      .map((ownership) => {
        const definition = nftDefinitionMap.get(ownership.nftDefinitionId);
        if (!definition) {
          return null;
        }
        return {
          id: definition.id,
          key: definition.key,
          label: definition.label,
          tier: definition.tier,
          acquiredAt: ownership.acquiredAt,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    const cosmetics = cosmeticUnlocks
      .map((unlock) => {
        const definition = cosmeticDefinitionMap.get(
          unlock.cosmeticDefinitionId,
        );
        if (!definition) {
          return null;
        }
        return {
          id: definition.id,
          key: definition.key,
          label: definition.label,
          unlockedAt: unlock.unlockedAt,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      profileId,
      nftCount: nfts.length,
      cosmeticCount: cosmetics.length,
      nfts,
      cosmetics,
    };
  }

  private normalizeWalletAddress(walletAddress: string): string {
    const normalized = walletAddress.trim().toLowerCase();
    if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
      throw new BadRequestException('Invalid wallet address format');
    }
    return normalized;
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

  private parseAmount(value: string): bigint {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
      throw new BadRequestException(
        'Amount must be a non-negative integer string',
      );
    }
    return BigInt(normalized);
  }

  private getConfiguredNonNegativeInteger(
    key: string,
    defaultValue: number,
  ): number {
    const rawValue = this.configService.get<string | number | undefined>(key);
    if (typeof rawValue === 'number' && Number.isFinite(rawValue)) {
      return Math.max(0, Math.floor(rawValue));
    }
    if (typeof rawValue === 'string' && rawValue.trim() !== '') {
      const parsed = Number(rawValue);
      if (Number.isFinite(parsed)) {
        return Math.max(0, Math.floor(parsed));
      }
    }
    return defaultValue;
  }

  private profileNeedsOnboarding(profile: Profile): boolean {
    return (
      profile.onboardingCompletedAt === null ||
      profile.nickname === null ||
      profile.currentAvatarId === null
    );
  }

  private assertOnboardingCompleted(profile: Profile, message: string): void {
    if (this.profileNeedsOnboarding(profile)) {
      throw new ForbiddenException(message);
    }
  }

  private async loadEquippedStyleSnapshot(
    profileId: string,
  ): Promise<ProfileSummary['styleState']['equippedStyle']> {
    try {
      const rows = (await this.profileRepository.query(
        `SELECT "equippedStyleSnapshot" FROM "profiles" WHERE "id" = $1`,
        [profileId],
      )) as Array<{ equippedStyleSnapshot: ProfileSummary['styleState']['equippedStyle'] }>;
      return rows[0]?.equippedStyleSnapshot ?? null;
    } catch (error) {
      if (this.isMissingEquippedStyleSnapshotColumnError(error)) {
        return null;
      }
      throw error;
    }
  }

  private isMissingEquippedStyleSnapshotColumnError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === '42703'
    );
  }

  private async ensureStarterAvatarsUnlocked(
    profileId: string,
    starterAvatarIds: string[],
  ): Promise<void> {
    for (const starterAvatarId of starterAvatarIds) {
      const existingUnlock = await this.profileAvatarUnlockRepository.findOne({
        where: {
          profileId,
          avatarId: starterAvatarId,
        },
      });

      if (existingUnlock) {
        continue;
      }

      const starterUnlock = this.profileAvatarUnlockRepository.create({
        profileId,
        avatarId: starterAvatarId,
      });
      await this.profileAvatarUnlockRepository.save(starterUnlock);
    }
  }
}
