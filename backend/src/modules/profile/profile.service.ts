import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { In, QueryFailedError, Repository } from 'typeorm';
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
const DEFAULT_STARTER_AVATAR_KEY = 'starter-bubble-blue';

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
    testingOverrideActive: boolean;
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

    try {
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
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      const userMessage = this.describeConnectWalletFailure(error);
      this.logger.error(
        `connectWallet failed for ${normalizedAddress}: ${userMessage}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw new InternalServerErrorException(userMessage);
    }
  }

  private describeConnectWalletFailure(error: unknown): string {
    if (error instanceof QueryFailedError) {
      const msg = error.message;
      const driver = error.driverError as { code?: string } | undefined;
      const code = driver?.code;
      if (code === '42P01' || /does not exist/i.test(msg)) {
        return 'Database tables missing — on API server run: npm run db:migration:run';
      }
      if (code === '28P01' || code === '3D000') {
        return 'PostgreSQL rejected login or database name — check DATABASE_URL';
      }
      if (
        /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|Connection terminated/i.test(msg) ||
        /Connection terminated/i.test(String(error))
      ) {
        return 'Cannot reach PostgreSQL — verify DATABASE_URL host/port and that Postgres is running';
      }
      return `Database error (${code ?? 'SQL'}): ${msg.slice(0, 140)}`;
    }
    if (error instanceof Error) {
      if (/ECONNREFUSED|ENOTFOUND|getaddrinfo/i.test(error.message)) {
        return 'Cannot reach database — check DATABASE_URL on the API server';
      }
      return error.message.slice(0, 200);
    }
    return 'Unexpected error while creating profile — check API logs';
  }

  async completeOnboarding(
    profileId: string,
    nickname: string,
    avatarId?: string,
  ): Promise<OnboardingCompletionResult> {
    this.assertUuid(profileId, 'Invalid profileId format');
    if (avatarId) {
      this.assertUuid(avatarId, 'Invalid avatarId format');
    }

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
      (avatarId
        ? starterAvatars.find((avatar) => avatar.id === avatarId) ?? null
        : starterAvatars.find((avatar) => avatar.key === DEFAULT_STARTER_AVATAR_KEY) ??
          starterAvatars[0] ??
          null);
    if (!starterAvatar) {
      throw new BadRequestException(
        avatarId
          ? 'Avatar must be one of approved starter avatars'
          : 'Approved starter avatars are unavailable',
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
    const testingOverrideActive = this.isAllSkinsTestingOverrideEnabled();

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
        testingOverrideActive,
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
    const testingOverrideActive = this.isAllSkinsTestingOverrideEnabled();
    if (!testingOverrideActive) {
      const qualificationSnapshot =
        await this.qualificationService.evaluateProgress(profileId);
      if (!qualificationSnapshot.rareRewardAccessActive) {
        throw new ForbiddenException(
          'Style apply is locked until game progression rules are met',
        );
      }

      if (source === 'nft') {
        const ownership = await this.profileNftOwnershipRepository.findOne({
          where: { profileId: profile.id, nftDefinitionId: rewardId },
        });
        if (!ownership) {
          throw new ForbiddenException(
            'This NFT style is not owned by the current profile',
          );
        }
      } else {
        const unlock = await this.profileCosmeticUnlockRepository.findOne({
          where: { profileId: profile.id, cosmeticDefinitionId: rewardId },
        });
        if (!unlock) {
          throw new ForbiddenException(
            'This cosmetic style is not unlocked for the current profile',
          );
        }
      }
    }

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
    const testingOverrideActive = this.isAllSkinsTestingOverrideEnabled();

    const nftOwnerships = await this.profileNftOwnershipRepository.find({
      where: { profileId },
      order: { acquiredAt: 'DESC' },
    });
    const nftDefinitions = testingOverrideActive
      ? await this.nftDefinitionRepository.find()
      : nftOwnerships.length
        ? await this.nftDefinitionRepository.find({
            where: {
              id: In(nftOwnerships.map((item) => item.nftDefinitionId)),
            },
          })
        : [];
    const nftDefinitionMap = new Map(
      nftDefinitions.map((item) => [item.id, item]),
    );
    const nftOwnershipMap = new Map(
      nftOwnerships.map((item) => [item.nftDefinitionId, item]),
    );

    const cosmeticUnlocks = await this.profileCosmeticUnlockRepository.find({
      where: { profileId },
      order: { unlockedAt: 'DESC' },
    });
    const cosmeticDefinitions = testingOverrideActive
      ? await this.cosmeticDefinitionRepository.find()
      : cosmeticUnlocks.length
        ? await this.cosmeticDefinitionRepository.find({
            where: {
              id: In(cosmeticUnlocks.map((item) => item.cosmeticDefinitionId)),
            },
          })
        : [];
    const cosmeticDefinitionMap = new Map(
      cosmeticDefinitions.map((item) => [item.id, item]),
    );
    const cosmeticUnlockMap = new Map(
      cosmeticUnlocks.map((item) => [item.cosmeticDefinitionId, item]),
    );

    const nfts = nftDefinitions.map((definition) => {
      const ownership = nftOwnershipMap.get(definition.id);
      return {
        id: definition.id,
        key: definition.key,
        label: definition.label,
        tier: definition.tier,
        acquiredAt: ownership?.acquiredAt ?? new Date(0),
      };
    });

    const cosmetics = cosmeticDefinitions.map((definition) => {
      const unlock = cosmeticUnlockMap.get(definition.id);
      return {
        id: definition.id,
        key: definition.key,
        label: definition.label,
        unlockedAt: unlock?.unlockedAt ?? new Date(0),
      };
    });

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

  private isAllSkinsTestingOverrideEnabled(): boolean {
    const rawValue = this.configService.get<string | boolean | undefined>(
      'BUBBLEDROP_TEST_UNLOCK_ALL_SKINS',
    );
    if (typeof rawValue === 'boolean') {
      return rawValue;
    }
    if (typeof rawValue === 'string') {
      const normalized = rawValue.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }
    // Temporary QA default: keep unlock-all enabled when env is not provided,
    // so remote test sessions can immediately access all skins.
    return true;
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
