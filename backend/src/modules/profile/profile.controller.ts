import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { GetProfileSummaryDto } from './dto/get-profile-summary.dto';
import {
  WALLET_ADDRESS_HEADER,
  WalletBindingService,
} from '../wallet-binding/wallet-binding.service';
import {
  OnboardingCompletionResult,
  LeaderboardEntry,
  ProfileService,
  ProfileStartupState,
  ProfileSummary,
  RewardsInventoryView,
  StarterAvatarView,
} from './profile.service';

@Controller('profile')
export class ProfileController {
  constructor(
    private readonly profileService: ProfileService,
    private readonly walletBindingService: WalletBindingService,
  ) {}

  @Post('connect-wallet')
  connectWallet(@Body() dto: ConnectWalletDto): Promise<ProfileStartupState> {
    return this.profileService.connectWallet(dto.walletAddress);
  }

  @Get('summary')
  getProfileSummary(
    @Query() dto: GetProfileSummaryDto,
  ): Promise<ProfileSummary> {
    return this.profileService.getProfileSummary(dto.profileId);
  }

  @Post('onboarding/complete')
  async completeOnboarding(
    @Body() dto: CompleteOnboardingDto,
    @Headers(WALLET_ADDRESS_HEADER) walletAddressHeader?: string,
  ): Promise<OnboardingCompletionResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      walletAddressHeader,
    );

    return this.profileService.completeOnboarding(
      dto.profileId,
      dto.nickname,
      dto.avatarId,
    );
  }

  @Get('starter-avatars')
  getStarterAvatars(): Promise<StarterAvatarView[]> {
    return this.profileService.getStarterAvatars();
  }

  @Get('leaderboard')
  getLeaderboard(@Query('limit') limit?: string): Promise<LeaderboardEntry[]> {
    const parsedLimit = limit ? Number(limit) : 20;
    return this.profileService.getLeaderboard(parsedLimit);
  }

  @Get('rewards-inventory')
  getRewardsInventory(
    @Query() dto: GetProfileSummaryDto,
  ): Promise<RewardsInventoryView> {
    return this.profileService.getRewardsInventory(dto.profileId);
  }
}
