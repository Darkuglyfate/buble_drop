import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Query,
} from '@nestjs/common';
import { CompleteOnboardingDto } from './dto/complete-onboarding.dto';
import { ConnectWalletDto } from './dto/connect-wallet.dto';
import { GetProfileSummaryDto } from './dto/get-profile-summary.dto';
import {
  AUTH_SESSION_HEADER,
  AuthSessionService,
} from '../auth-session/auth-session.service';
import { WalletBindingService } from '../wallet-binding/wallet-binding.service';
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
    private readonly authSessionService: AuthSessionService,
    private readonly walletBindingService: WalletBindingService,
  ) {}

  @Post('connect-wallet')
  connectWallet(
    @Body() dto: ConnectWalletDto,
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<ProfileStartupState> {
    const authenticatedWalletAddress =
      this.authSessionService.getAuthenticatedWalletAddress(authSessionHeader);
    if (
      dto.walletAddress?.trim() &&
      dto.walletAddress.trim().toLowerCase() !== authenticatedWalletAddress
    ) {
      throw new ForbiddenException(
        'Verified auth session does not match requested wallet bootstrap',
      );
    }

    return this.profileService.connectWallet(authenticatedWalletAddress);
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
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<OnboardingCompletionResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      authSessionHeader,
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
