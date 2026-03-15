import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CheckInRecord } from '../check-in/entities/check-in-record.entity';
import { Profile } from '../profile/entities/profile.entity';
import { XpService, XpSource } from '../rewards/xp.service';
import { PartnerToken } from './entities/partner-token.entity';
import { PartnerTokenPin } from './entities/partner-token-pin.entity';
import { Referral, ReferralStatus } from './entities/referral.entity';
import { Season } from './entities/season.entity';

export interface PartnerTokenTransparencyView {
  id: string;
  name: string;
  contractAddress: string;
  twitterUrl: string;
  chartUrl: string | null;
  dexscreenerUrl: string | null;
  seasonTitle: string;
}

export interface ReferralSuccessResult {
  referralId: string;
  inviterProfileId: string;
  invitedProfileId: string;
  status: ReferralStatus;
  referralXpGranted: number;
  inviterTotalXp: number;
}

export interface ReferralProgressView {
  inviterProfileId: string;
  totalReferrals: number;
  pendingReferrals: number;
  successfulReferrals: number;
  referrals: Array<{
    referralId: string;
    invitedWalletAddress: string;
    invitedProfileId: string | null;
    status: ReferralStatus;
    successfulAt: Date | null;
    createdAt: Date;
  }>;
}

export interface SeasonHubView {
  season: {
    id: string;
    key: string;
    title: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  } | null;
  tokenCount: number;
  tokens: Array<{
    id: string;
    symbol: string;
    name: string;
  }>;
}

export interface PartnerTokenDetailView {
  id: string;
  symbol: string;
  name: string;
  contractAddress: string;
  twitterUrl: string;
  chartUrl: string | null;
  dexscreenerUrl: string | null;
  season: {
    id: string;
    key: string;
    title: string;
    startDate: string;
    endDate: string;
    isActive: boolean;
  };
  pinCount: number;
}

@Injectable()
export class PartnerTokenService {
  constructor(
    @InjectRepository(Season)
    private readonly seasonRepository: Repository<Season>,
    @InjectRepository(PartnerToken)
    private readonly partnerTokenRepository: Repository<PartnerToken>,
    @InjectRepository(PartnerTokenPin)
    private readonly partnerTokenPinRepository: Repository<PartnerTokenPin>,
    @InjectRepository(Referral)
    private readonly referralRepository: Repository<Referral>,
    @InjectRepository(Profile)
    private readonly profileRepository: Repository<Profile>,
    @InjectRepository(CheckInRecord)
    private readonly checkInRecordRepository: Repository<CheckInRecord>,
    private readonly xpService: XpService,
  ) {}

  async getTransparencyList(): Promise<PartnerTokenTransparencyView[]> {
    const tokens = await this.partnerTokenRepository.find({
      relations: {
        season: true,
      },
      order: {
        createdAt: 'DESC',
      },
    });

    return tokens.map((token) => ({
      id: token.id,
      name: token.name,
      contractAddress: token.contractAddress,
      twitterUrl: token.twitterUrl,
      chartUrl: token.chartUrl,
      dexscreenerUrl: token.dexscreenerUrl,
      seasonTitle: token.season?.title ?? 'Unknown season',
    }));
  }

  async markReferralSuccessful(
    referralId: string,
  ): Promise<ReferralSuccessResult> {
    this.assertUuid(referralId, 'Invalid referralId format');

    const referral = await this.referralRepository.findOne({
      where: { id: referralId },
    });
    if (!referral) {
      throw new NotFoundException('Referral not found');
    }

    if (!referral.invitedProfileId) {
      throw new BadRequestException(
        'Referral does not have invited profile linked yet',
      );
    }

    const invitedProfile = await this.profileRepository.findOne({
      where: { id: referral.invitedProfileId },
    });
    if (!invitedProfile) {
      throw new NotFoundException('Invited profile not found');
    }

    if (
      !invitedProfile.nickname ||
      invitedProfile.onboardingCompletedAt === null
    ) {
      throw new BadRequestException(
        'Invited profile has not completed onboarding',
      );
    }

    const firstCheckIn = await this.checkInRecordRepository.findOne({
      where: { profileId: invitedProfile.id },
      order: { checkInDate: 'ASC' },
    });
    if (!firstCheckIn) {
      throw new BadRequestException(
        'Invited profile has not completed first daily check-in',
      );
    }

    const inviterProfile = await this.profileRepository.findOne({
      where: { id: referral.inviterProfileId },
    });
    if (!inviterProfile) {
      throw new NotFoundException('Inviter profile not found');
    }

    if (referral.status === ReferralStatus.SUCCESSFUL) {
      return {
        referralId: referral.id,
        inviterProfileId: referral.inviterProfileId,
        invitedProfileId: referral.invitedProfileId,
        status: referral.status,
        referralXpGranted: 0,
        inviterTotalXp: inviterProfile.totalXp,
      };
    }

    referral.status = ReferralStatus.SUCCESSFUL;
    referral.successfulAt = new Date();
    await this.referralRepository.save(referral);

    const xpGrant = await this.xpService.grantXp(inviterProfile.id, [
      {
        source: XpSource.REFERRAL_SUCCESS,
        amount: 50,
        metadata: {
          referralId: referral.id,
          invitedProfileId: invitedProfile.id,
        },
      },
    ]);

    inviterProfile.totalXp += xpGrant.grantedTotal;
    await this.profileRepository.save(inviterProfile);

    return {
      referralId: referral.id,
      inviterProfileId: referral.inviterProfileId,
      invitedProfileId: invitedProfile.id,
      status: referral.status,
      referralXpGranted: xpGrant.grantedTotal,
      inviterTotalXp: inviterProfile.totalXp,
    };
  }

  async getReferralProgress(
    inviterProfileId: string,
  ): Promise<ReferralProgressView> {
    this.assertUuid(inviterProfileId, 'Invalid profileId format');

    const inviter = await this.profileRepository.findOne({
      where: { id: inviterProfileId },
    });
    if (!inviter) {
      throw new NotFoundException('Profile not found');
    }
    this.assertOnboardingCompleted(
      inviter,
      'Onboarding must be completed before referral progress is available',
    );

    const referrals = await this.referralRepository.find({
      where: { inviterProfileId },
      order: { createdAt: 'DESC' },
    });

    const successfulReferrals = referrals.filter(
      (item) => item.status === ReferralStatus.SUCCESSFUL,
    ).length;

    return {
      inviterProfileId,
      totalReferrals: referrals.length,
      pendingReferrals: referrals.length - successfulReferrals,
      successfulReferrals,
      referrals: referrals.map((item) => ({
        referralId: item.id,
        invitedWalletAddress: item.invitedWalletAddress,
        invitedProfileId: item.invitedProfileId,
        status: item.status,
        successfulAt: item.successfulAt,
        createdAt: item.createdAt,
      })),
    };
  }

  async getSeasonHub(): Promise<SeasonHubView> {
    const activeSeason = await this.seasonRepository.findOne({
      where: { isActive: true },
      order: { startDate: 'DESC' },
    });

    if (!activeSeason) {
      return {
        season: null,
        tokenCount: 0,
        tokens: [],
      };
    }

    const tokens = await this.partnerTokenRepository.find({
      where: { seasonId: activeSeason.id },
      order: { createdAt: 'DESC' },
    });

    return {
      season: {
        id: activeSeason.id,
        key: activeSeason.key,
        title: activeSeason.title,
        startDate: activeSeason.startDate,
        endDate: activeSeason.endDate,
        isActive: activeSeason.isActive,
      },
      tokenCount: tokens.length,
      tokens: tokens.map((item) => ({
        id: item.id,
        symbol: item.symbol,
        name: item.name,
      })),
    };
  }

  async getTokenDetail(tokenId: string): Promise<PartnerTokenDetailView> {
    this.assertUuid(tokenId, 'Invalid tokenId format');

    const token = await this.partnerTokenRepository.findOne({
      where: { id: tokenId },
      relations: {
        season: true,
      },
    });
    if (!token) {
      throw new NotFoundException('Partner token not found');
    }

    const pinCount = await this.partnerTokenPinRepository.count({
      where: { partnerTokenId: token.id },
    });

    return {
      id: token.id,
      symbol: token.symbol,
      name: token.name,
      contractAddress: token.contractAddress,
      twitterUrl: token.twitterUrl,
      chartUrl: token.chartUrl,
      dexscreenerUrl: token.dexscreenerUrl,
      season: {
        id: token.season.id,
        key: token.season.key,
        title: token.season.title,
        startDate: token.season.startDate,
        endDate: token.season.endDate,
        isActive: token.season.isActive,
      },
      pinCount,
    };
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

  private assertOnboardingCompleted(profile: Profile, message: string): void {
    const needsOnboarding =
      profile.onboardingCompletedAt === null ||
      profile.nickname === null ||
      profile.currentAvatarId === null;
    if (needsOnboarding) {
      throw new ForbiddenException(message);
    }
  }
}
