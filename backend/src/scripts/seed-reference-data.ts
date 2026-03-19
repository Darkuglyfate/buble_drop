import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource, In } from 'typeorm';
import { AppModule } from '../app.module';
import { ClaimableTokenBalance } from '../modules/claim/entities/claimable-token-balance.entity';
import { BubbleSession } from '../modules/bubble-session/entities/bubble-session.entity';
import { CheckInRecord } from '../modules/check-in/entities/check-in-record.entity';
import { PartnerToken } from '../modules/partner-token/entities/partner-token.entity';
import {
  Referral,
  ReferralStatus,
} from '../modules/partner-token/entities/referral.entity';
import { Season } from '../modules/partner-token/entities/season.entity';
import { Avatar } from '../modules/profile/entities/avatar.entity';
import { CosmeticDefinition } from '../modules/profile/entities/cosmetic-definition.entity';
import {
  NftDefinition,
  NftTier,
} from '../modules/profile/entities/nft-definition.entity';
import { ProfileAvatarUnlock } from '../modules/profile/entities/profile-avatar-unlock.entity';
import { ProfileCosmeticUnlock } from '../modules/profile/entities/profile-cosmetic-unlock.entity';
import { ProfileNftOwnership } from '../modules/profile/entities/profile-nft-ownership.entity';
import { Profile } from '../modules/profile/entities/profile.entity';
import { RankFrameDefinition } from '../modules/profile/entities/rank-frame-definition.entity';
import { UserWallet } from '../modules/profile/entities/user-wallet.entity';
import {
  RewardEvent,
  RewardEventType,
} from '../modules/rewards/entities/reward-event.entity';
import { WeeklyTokenTicket } from '../modules/rewards/entities/weekly-token-ticket.entity';
import {
  QualificationState,
  QualificationStatus,
} from '../modules/qualification/entities/qualification-state.entity';

const logger = new Logger('ReferenceDataSeed');

const RANK_FRAMES: Array<
  Pick<RankFrameDefinition, 'key' | 'label' | 'order' | 'minLifetimeXp'>
> = [
  { key: 'bronze', label: 'Bronze', order: 1, minLifetimeXp: 0 },
  { key: 'silver', label: 'Silver', order: 2, minLifetimeXp: 250 },
  { key: 'gold', label: 'Gold', order: 3, minLifetimeXp: 700 },
  { key: 'platinum', label: 'Platinum', order: 4, minLifetimeXp: 1500 },
  { key: 'diamond', label: 'Diamond', order: 5, minLifetimeXp: 2800 },
  { key: 'master', label: 'Master', order: 6, minLifetimeXp: 4500 },
  { key: 'legend', label: 'Legend', order: 7, minLifetimeXp: 7000 },
];

const STARTER_AVATARS: Array<
  Pick<Avatar, 'key' | 'label' | 'paletteKey' | 'isStarter'>
> = [
  {
    key: 'starter-bubble-blue',
    label: 'Starter Bubble Blue',
    paletteKey: 'blue',
    isStarter: true,
  },
  {
    key: 'starter-bubble-lilac',
    label: 'Starter Bubble Lilac',
    paletteKey: 'lilac',
    isStarter: true,
  },
  {
    key: 'starter-bubble-rose',
    label: 'Starter Bubble Rose',
    paletteKey: 'rose',
    isStarter: true,
  },
  {
    key: 'starter-bubble-mint',
    label: 'Starter Bubble Mint',
    paletteKey: 'mint',
    isStarter: true,
  },
  {
    key: 'starter-bubble-peach',
    label: 'Starter Bubble Peach',
    paletteKey: 'peach',
    isStarter: true,
  },
  {
    key: 'starter-bubble-amber',
    label: 'Starter Bubble Amber',
    paletteKey: 'amber',
    isStarter: true,
  },
  {
    key: 'starter-bubble-sky',
    label: 'Starter Bubble Sky',
    paletteKey: 'sky',
    isStarter: true,
  },
  {
    key: 'starter-bubble-violet',
    label: 'Starter Bubble Violet',
    paletteKey: 'violet',
    isStarter: true,
  },
];

const SEASONS: Array<
  Pick<Season, 'key' | 'title' | 'startDate' | 'endDate' | 'isActive'>
> = [
  {
    key: 'genesis-bloom',
    title: 'Genesis Bloom',
    startDate: '2026-03-01',
    endDate: '2026-04-30',
    isActive: true,
  },
  {
    key: 'testnet-waves',
    title: 'Testnet Waves',
    startDate: '2026-01-01',
    endDate: '2026-02-28',
    isActive: false,
  },
];

const PARTNER_TOKENS = [
  {
    seasonKey: 'genesis-bloom',
    symbol: 'BUBL',
    name: 'Bubble Bloom',
    contractAddress: '0x1111111111111111111111111111111111111111',
    twitterUrl: 'https://x.com/bubbledrop_bloom',
    chartUrl: 'https://charts.example.com/bubl',
    dexscreenerUrl: 'https://dexscreener.com/base/bubl',
  },
  {
    seasonKey: 'genesis-bloom',
    symbol: 'POP',
    name: 'Pop Pulse',
    contractAddress: '0x2222222222222222222222222222222222222222',
    twitterUrl: 'https://x.com/poppulse_base',
    chartUrl: null,
    dexscreenerUrl: 'https://dexscreener.com/base/pop',
  },
] as const;

const DEMO_WALLETS = [
  {
    id: '10000000-0000-4000-8000-000000000001',
    address: '0x1000000000000000000000000000000000000001',
  },
  {
    id: '10000000-0000-4000-8000-000000000002',
    address: '0x1000000000000000000000000000000000000002',
  },
  {
    id: '10000000-0000-4000-8000-000000000003',
    address: '0x1000000000000000000000000000000000000003',
  },
] as const;

type DemoProfileSeed = {
  id: string;
  walletAddress: string;
  nickname: string;
  avatarKey: string;
  onboardingCompletedOffsetDays: number;
  checkInStreakDays: number;
  completedSessionCount: number;
  referralXpAmount: number;
  seededClaimableRewardCount: number;
  seedRareInventory: boolean;
  expectedQualificationStatus: QualificationStatus;
};

const DEMO_PROFILES: DemoProfileSeed[] = [
  {
    id: '20000000-0000-4000-8000-000000000001',
    walletAddress: '0x1000000000000000000000000000000000000001',
    nickname: 'bubblecaptain',
    avatarKey: 'starter-bubble-blue',
    onboardingCompletedOffsetDays: 10,
    checkInStreakDays: 7,
    completedSessionCount: 8,
    referralXpAmount: 50,
    seededClaimableRewardCount: 3,
    seedRareInventory: true,
    expectedQualificationStatus: QualificationStatus.QUALIFIED,
  },
  {
    id: '20000000-0000-4000-8000-000000000002',
    walletAddress: '0x1000000000000000000000000000000000000002',
    nickname: 'mintmover',
    avatarKey: 'starter-bubble-mint',
    onboardingCompletedOffsetDays: 7,
    checkInStreakDays: 5,
    completedSessionCount: 4,
    referralXpAmount: 0,
    seededClaimableRewardCount: 0,
    seedRareInventory: false,
    expectedQualificationStatus: QualificationStatus.QUALIFIED,
  },
  {
    id: '20000000-0000-4000-8000-000000000003',
    walletAddress: '0x1000000000000000000000000000000000000003',
    nickname: 'roseglow',
    avatarKey: 'starter-bubble-rose',
    onboardingCompletedOffsetDays: 4,
    checkInStreakDays: 3,
    completedSessionCount: 1,
    referralXpAmount: 0,
    seededClaimableRewardCount: 0,
    seedRareInventory: false,
    expectedQualificationStatus: QualificationStatus.IN_PROGRESS,
  },
] as const;

const DEMO_NFT_DEFINITIONS: Array<
  Pick<
    NftDefinition,
    | 'key'
    | 'label'
    | 'tier'
    | 'minStreak'
    | 'minXp'
    | 'minSessions'
    | 'dropChancePercent'
    | 'cooldownDays'
  >
> = [
  {
    key: 'genesis-spark',
    label: 'Genesis Spark',
    tier: NftTier.SIMPLE,
    minStreak: 3,
    minXp: 100,
    minSessions: 1,
    dropChancePercent: '100.00',
    cooldownDays: 0,
  },
];

const DEMO_COSMETIC_DEFINITIONS: Array<
  Pick<CosmeticDefinition, 'key' | 'label' | 'minStreak' | 'minXp'>
> = [
  {
    key: 'glossy-aura',
    label: 'Glossy Aura',
    minStreak: 3,
    minXp: 100,
  },
];

const DEMO_REFERRALS = [
  {
    id: '30000000-0000-4000-8000-000000000001',
    inviterProfileId: '20000000-0000-4000-8000-000000000001',
    invitedWalletAddress: '0x1000000000000000000000000000000000000002',
    invitedProfileId: '20000000-0000-4000-8000-000000000002',
    status: ReferralStatus.SUCCESSFUL,
    successfulAt: new Date('2026-03-13T12:00:00.000Z'),
  },
  {
    id: '30000000-0000-4000-8000-000000000002',
    inviterProfileId: '20000000-0000-4000-8000-000000000001',
    invitedWalletAddress: '0x1000000000000000000000000000000000000099',
    invitedProfileId: null,
    status: ReferralStatus.PENDING,
    successfulAt: null,
  },
] as const;

async function seedReferenceData(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    const rankFrameRepository = dataSource.getRepository(RankFrameDefinition);
    const avatarRepository = dataSource.getRepository(Avatar);
    const seasonRepository = dataSource.getRepository(Season);
    const partnerTokenRepository = dataSource.getRepository(PartnerToken);
    const walletRepository = dataSource.getRepository(UserWallet);
    const profileRepository = dataSource.getRepository(Profile);
    const profileAvatarUnlockRepository =
      dataSource.getRepository(ProfileAvatarUnlock);
    const checkInRecordRepository = dataSource.getRepository(CheckInRecord);
    const bubbleSessionRepository = dataSource.getRepository(BubbleSession);
    const claimableBalanceRepository = dataSource.getRepository(
      ClaimableTokenBalance,
    );
    const rewardEventRepository = dataSource.getRepository(RewardEvent);
    const weeklyTokenTicketRepository =
      dataSource.getRepository(WeeklyTokenTicket);
    const nftDefinitionRepository = dataSource.getRepository(NftDefinition);
    const nftOwnershipRepository =
      dataSource.getRepository(ProfileNftOwnership);
    const cosmeticDefinitionRepository =
      dataSource.getRepository(CosmeticDefinition);
    const cosmeticUnlockRepository = dataSource.getRepository(
      ProfileCosmeticUnlock,
    );
    const qualificationStateRepository =
      dataSource.getRepository(QualificationState);
    const referralRepository = dataSource.getRepository(Referral);
    const seedNow = new Date();

    await rankFrameRepository.upsert(RANK_FRAMES, ['key']);
    await avatarRepository.upsert(STARTER_AVATARS, ['key']);
    await seasonRepository.upsert(SEASONS, ['key']);

    const starterAvatars = await avatarRepository.find({
      where: STARTER_AVATARS.map((avatar) => ({ key: avatar.key })),
    });
    const starterAvatarByKey = new Map(
      starterAvatars.map((avatar) => [avatar.key, avatar]),
    );

    const seasons = await seasonRepository.find({
      where: SEASONS.map((season) => ({ key: season.key })),
    });
    const seasonByKey = new Map(seasons.map((season) => [season.key, season]));
    const activeSeason = seasons.find((season) => season.isActive) ?? null;
    const profileIdByWalletAddress = new Map<string, string>();

    for (const walletSeed of DEMO_WALLETS) {
      const existingWallet = await walletRepository.findOne({
        where: { address: walletSeed.address },
      });
      await walletRepository.save(
        walletRepository.create({
          id: existingWallet?.id ?? walletSeed.id,
          address: walletSeed.address,
        }),
      );
    }

    for (const profileSeed of DEMO_PROFILES) {
      const wallet = await walletRepository.findOneOrFail({
        where: { address: profileSeed.walletAddress },
      });
      const avatar = starterAvatarByKey.get(profileSeed.avatarKey);
      if (!avatar) {
        throw new Error(
          `Starter avatar missing for profile seed: ${profileSeed.avatarKey}`,
        );
      }

      const existingProfile = await profileRepository.findOne({
        where: { walletId: wallet.id },
      });
      const profile = await profileRepository.save(
        profileRepository.create({
          id: existingProfile?.id ?? profileSeed.id,
          walletId: wallet.id,
          nickname: profileSeed.nickname,
          currentAvatarId: avatar.id,
          totalXp: 0,
          currentStreak: 0,
          onboardingCompletedAt: buildDateAtUtcOffset(
            seedNow,
            -profileSeed.onboardingCompletedOffsetDays,
            12,
            0,
            0,
          ),
        }),
      );
      profileIdByWalletAddress.set(profileSeed.walletAddress, profile.id);

      const existingUnlock = await profileAvatarUnlockRepository.findOne({
        where: {
          profileId: profile.id,
          avatarId: avatar.id,
        },
      });
      if (!existingUnlock) {
        await profileAvatarUnlockRepository.save(
          profileAvatarUnlockRepository.create({
            profileId: profile.id,
            avatarId: avatar.id,
          }),
        );
      }
    }

    const resolvedDemoProfileIds = DEMO_PROFILES.map((profileSeed) => {
      const profileId = profileIdByWalletAddress.get(profileSeed.walletAddress);
      if (!profileId) {
        throw new Error(
          `Resolved profile missing for wallet: ${profileSeed.walletAddress}`,
        );
      }
      return profileId;
    });

    await rewardEventRepository.delete({
      profileId: In(resolvedDemoProfileIds),
    });
    await weeklyTokenTicketRepository.delete({
      profileId: In(resolvedDemoProfileIds),
    });
    await claimableBalanceRepository.delete({
      profileId: In(resolvedDemoProfileIds),
    });
    await bubbleSessionRepository.delete({
      profileId: In(resolvedDemoProfileIds),
    });
    await checkInRecordRepository.delete({
      profileId: In(resolvedDemoProfileIds),
    });
    await qualificationStateRepository.delete({
      profileId: In(resolvedDemoProfileIds),
    });
    await nftOwnershipRepository.delete({
      profileId: In(resolvedDemoProfileIds),
    });
    await cosmeticUnlockRepository.delete({
      profileId: In(resolvedDemoProfileIds),
    });

    await partnerTokenRepository.upsert(
      PARTNER_TOKENS.map((token) => {
        const season = seasonByKey.get(token.seasonKey);
        if (!season) {
          throw new Error(
            `Season missing for partner token seed: ${token.seasonKey}`,
          );
        }

        return {
          seasonId: season.id,
          symbol: token.symbol,
          name: token.name,
          contractAddress: token.contractAddress,
          twitterUrl: token.twitterUrl,
          chartUrl: token.chartUrl,
          dexscreenerUrl: token.dexscreenerUrl,
        };
      }),
      ['seasonId', 'symbol'],
    );

    await nftDefinitionRepository.upsert(DEMO_NFT_DEFINITIONS, ['key']);
    const seededNft = await nftDefinitionRepository.findOneOrFail({
      where: { key: DEMO_NFT_DEFINITIONS[0].key },
    });

    await cosmeticDefinitionRepository.upsert(DEMO_COSMETIC_DEFINITIONS, [
      'key',
    ]);
    const seededCosmetic = await cosmeticDefinitionRepository.findOneOrFail({
      where: { key: DEMO_COSMETIC_DEFINITIONS[0].key },
    });

    const resolvedReferrals = DEMO_REFERRALS.map((referral) => {
      const inviterSeed = DEMO_PROFILES.find(
        (profile) => profile.id === referral.inviterProfileId,
      );
      if (!inviterSeed) {
        throw new Error(
          `Inviter profile seed missing for referral: ${referral.id}`,
        );
      }
      const inviterProfileId = profileIdByWalletAddress.get(
        inviterSeed.walletAddress,
      );
      if (!inviterProfileId) {
        throw new Error(
          `Resolved inviter profile missing for wallet: ${inviterSeed.walletAddress}`,
        );
      }

      let invitedProfileId: string | null = null;
      if (referral.invitedProfileId) {
        const invitedSeed = DEMO_PROFILES.find(
          (profile) => profile.id === referral.invitedProfileId,
        );
        if (!invitedSeed) {
          throw new Error(
            `Invited profile seed missing for referral: ${referral.id}`,
          );
        }
        invitedProfileId =
          profileIdByWalletAddress.get(invitedSeed.walletAddress) ??
          referral.invitedProfileId;
      }

      return {
        id: referral.id,
        inviterProfileId,
        invitedWalletAddress: referral.invitedWalletAddress,
        invitedProfileId,
        status: referral.status,
        successfulAt: referral.successfulAt,
      };
    });
    await referralRepository.upsert(resolvedReferrals, [
      'inviterProfileId',
      'invitedWalletAddress',
    ]);

    const activePartnerToken = activeSeason
      ? await partnerTokenRepository.findOne({
          where: { seasonId: activeSeason.id },
          order: { createdAt: 'ASC' },
        })
      : null;
    const createdRewardEvents: RewardEvent[] = [];
    let seededClaimableBalanceCount = 0;

    for (const profileSeed of DEMO_PROFILES) {
      const profileId = profileIdByWalletAddress.get(profileSeed.walletAddress);
      if (!profileId) {
        throw new Error(
          `Resolved profile missing for wallet: ${profileSeed.walletAddress}`,
        );
      }

      const profile = await profileRepository.findOneOrFail({
        where: { id: profileId },
      });
      const completedSessions: BubbleSession[] = [];
      const totalXpParts: number[] = [];
      const onboardingCompletedAt = buildDateAtUtcOffset(
        seedNow,
        -profileSeed.onboardingCompletedOffsetDays,
        12,
        0,
        0,
      );

      createdRewardEvents.push(
        rewardEventRepository.create({
          profileId,
          eventType: RewardEventType.XP,
          xpAmount: 20,
          tokenSymbol: null,
          metadata: {
            source: 'onboarding_completion',
          },
          createdAt: onboardingCompletedAt,
        }),
      );
      totalXpParts.push(20);

      const checkInRecords = Array.from(
        { length: profileSeed.checkInStreakDays },
        (_, index) => {
          const dayOffset = -(profileSeed.checkInStreakDays - 1 - index);
          const checkInDate = getUtcDateKey(
            buildDateAtUtcOffset(seedNow, dayOffset, 9, 0, 0),
          );
          createdRewardEvents.push(
            rewardEventRepository.create({
              profileId,
              eventType: RewardEventType.XP,
              xpAmount: 20,
              tokenSymbol: null,
              metadata: {
                source: 'daily_check_in',
                checkInDate,
              },
              createdAt: buildDateAtUtcOffset(seedNow, dayOffset, 9, 5, 0),
            }),
          );
          totalXpParts.push(20);

          return checkInRecordRepository.create({
            profileId,
            checkInDate,
            txHash: null,
          });
        },
      );
      await checkInRecordRepository.save(checkInRecords);

      const sessionDayOffsets = buildSessionDayOffsets(
        profileSeed.completedSessionCount,
      );
      for (const [index, dayOffset] of sessionDayOffsets.entries()) {
        const startedAt = buildDateAtUtcOffset(
          seedNow,
          dayOffset,
          14 + (index % 3),
          0,
          0,
        );
        const endedAt = new Date(startedAt.getTime() + 10 * 60 * 1000);
        const session = await bubbleSessionRepository.save(
          bubbleSessionRepository.create({
            profileId,
            startedAt,
            endedAt,
            activeSeconds: 360,
            isCompleted: true,
          }),
        );
        completedSessions.push(session);

        const sessionEvents = [
          {
            xpAmount: 30,
            source: 'session_reward_bubbles',
          },
          {
            xpAmount: 20,
            source: 'session_active_play',
          },
          {
            xpAmount: 20,
            source: 'session_completion_bonus',
          },
        ] as const;
        for (const event of sessionEvents) {
          createdRewardEvents.push(
            rewardEventRepository.create({
              profileId,
              eventType: RewardEventType.XP,
              xpAmount: event.xpAmount,
              tokenSymbol: null,
              metadata: {
                source: event.source,
                sessionId: session.id,
                sessionDurationSeconds: 600,
                activeSeconds: 360,
              },
              createdAt: endedAt,
            }),
          );
          totalXpParts.push(event.xpAmount);
        }
      }

      if (profileSeed.referralXpAmount > 0) {
        createdRewardEvents.push(
          rewardEventRepository.create({
            profileId,
            eventType: RewardEventType.XP,
            xpAmount: profileSeed.referralXpAmount,
            tokenSymbol: null,
            metadata: {
              source: 'referral_success',
            },
            createdAt: buildDateAtUtcOffset(seedNow, -1, 16, 0, 0),
          }),
        );
        totalXpParts.push(profileSeed.referralXpAmount);
      }

      const rareRewardSessions = completedSessions.slice(
        -profileSeed.seededClaimableRewardCount,
      );
      if (activePartnerToken && rareRewardSessions.length > 0) {
        const claimableAmount = rareRewardSessions.length.toString();

        await claimableBalanceRepository.save(
          claimableBalanceRepository.create({
            profileId,
            tokenSymbol: activePartnerToken.symbol,
            claimableAmount,
          }),
        );
        seededClaimableBalanceCount += 1;

        for (const session of rareRewardSessions) {
          await weeklyTokenTicketRepository.save(
            weeklyTokenTicketRepository.create({
              profileId,
              weekStartDate: getUtcWeekStartDate(
                session.endedAt ?? session.startedAt,
              ),
              tokenSymbol: activePartnerToken.symbol,
              weight: 1,
            }),
          );
          createdRewardEvents.push(
            rewardEventRepository.create({
              profileId,
              eventType: RewardEventType.TOKEN_TICKET,
              xpAmount: null,
              tokenSymbol: activePartnerToken.symbol,
              metadata: {
                sessionId: session.id,
                seasonId: activeSeason?.id ?? null,
                weekStartDate: getUtcWeekStartDate(
                  session.endedAt ?? session.startedAt,
                ),
                amountAwarded: '1',
              },
              createdAt: session.endedAt ?? session.startedAt,
            }),
          );
        }

        if (profileSeed.seedRareInventory) {
          const sourceSession = rareRewardSessions[0];
          await nftOwnershipRepository.save(
            nftOwnershipRepository.create({
              profileId,
              nftDefinitionId: seededNft.id,
            }),
          );
          await cosmeticUnlockRepository.save(
            cosmeticUnlockRepository.create({
              profileId,
              cosmeticDefinitionId: seededCosmetic.id,
            }),
          );

          createdRewardEvents.push(
            rewardEventRepository.create({
              profileId,
              eventType: RewardEventType.NFT,
              xpAmount: null,
              tokenSymbol: null,
              metadata: {
                sessionId: sourceSession.id,
                nftDefinitionId: seededNft.id,
                nftKey: seededNft.key,
              },
              createdAt: sourceSession.endedAt ?? sourceSession.startedAt,
            }),
          );
          createdRewardEvents.push(
            rewardEventRepository.create({
              profileId,
              eventType: RewardEventType.COSMETIC,
              xpAmount: null,
              tokenSymbol: null,
              metadata: {
                sessionId: sourceSession.id,
                cosmeticDefinitionId: seededCosmetic.id,
                cosmeticKey: seededCosmetic.key,
              },
              createdAt: sourceSession.endedAt ?? sourceSession.startedAt,
            }),
          );
        }
      }

      profile.totalXp = totalXpParts.reduce((sum, value) => sum + value, 0);
      profile.currentStreak = profileSeed.checkInStreakDays;
      profile.onboardingCompletedAt = onboardingCompletedAt;
      await profileRepository.save(profile);

      const qualificationState = qualificationStateRepository.create({
        profileId,
        status: profileSeed.expectedQualificationStatus,
        qualifiedAt:
          profileSeed.expectedQualificationStatus ===
          QualificationStatus.QUALIFIED
            ? (completedSessions[Math.min(3, completedSessions.length - 1)]
                ?.endedAt ?? buildDateAtUtcOffset(seedNow, -1, 18, 0, 0))
            : null,
        pausedAt: null,
        restoredAt: null,
      });
      await qualificationStateRepository.save(qualificationState);
    }

    await rewardEventRepository.save(createdRewardEvents);

    logger.log(`Seeded rank frames: ${RANK_FRAMES.length}`);
    logger.log(`Seeded starter avatars: ${STARTER_AVATARS.length}`);
    logger.log(`Seeded seasons: ${SEASONS.length}`);
    logger.log(`Seeded partner tokens: ${PARTNER_TOKENS.length}`);
    logger.log(`Seeded demo profiles: ${DEMO_PROFILES.length}`);
    logger.log(
      `Seeded demo claimable balances: ${seededClaimableBalanceCount}`,
    );
    logger.log(
      `Primary demo wallet for local UI bootstrap: ${DEMO_PROFILES[0].walletAddress}`,
    );
    logger.log(
      `Primary demo profileId for read surfaces: ${
        profileIdByWalletAddress.get(DEMO_PROFILES[0].walletAddress) ??
        DEMO_PROFILES[0].id
      }`,
    );
    logger.log('Reference data seeding completed successfully.');
  } finally {
    await app.close();
  }
}

void seedReferenceData().catch((error) => {
  logger.error(
    'Reference data seeding failed.',
    error instanceof Error ? error.stack : String(error),
  );
  process.exitCode = 1;
});

function buildDateAtUtcOffset(
  baseDate: Date,
  offsetDays: number,
  hours: number,
  minutes: number,
  seconds: number,
): Date {
  const date = new Date(baseDate);
  date.setUTCHours(hours, minutes, seconds, 0);
  date.setUTCDate(date.getUTCDate() + offsetDays);
  return date;
}

function getUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildSessionDayOffsets(count: number): number[] {
  return Array.from({ length: count }, (_, index) => -(count - 1 - index));
}

function getUtcWeekStartDate(date: Date): string {
  const normalized = new Date(date);
  normalized.setUTCHours(0, 0, 0, 0);
  const weekday = normalized.getUTCDay();
  const diffToMonday = (weekday + 6) % 7;
  normalized.setUTCDate(normalized.getUTCDate() - diffToMonday);
  return normalized.toISOString().slice(0, 10);
}
