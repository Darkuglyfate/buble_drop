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
import { EquipStyleDto } from './dto/equip-style.dto';
import { SelectAvatarDto } from './dto/select-avatar.dto';
import {
  AUTH_SESSION_HEADER,
  AuthSessionService,
} from '../auth-session/auth-session.service';
import { WalletBindingService } from '../wallet-binding/wallet-binding.service';
import {
  AvatarSelectionResult,
  OnboardingCompletionResult,
  LeaderboardEntry,
  ProfileService,
  ProfileStartupState,
  ProfileSummary,
  EquippedStyleResult,
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
  async getProfileSummary(
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<ProfileSummary> {
    const profileId =
      await this.walletBindingService.resolveAuthenticatedProfileId(
        authSessionHeader,
      );
    return this.profileService.getProfileSummary(profileId);
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

  @Post('avatar/select')
  async selectAvatar(
    @Body() dto: SelectAvatarDto,
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<AvatarSelectionResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      authSessionHeader,
    );

    return this.profileService.selectAvatar(dto.profileId, dto.avatarId);
  }

  @Post('style/equip')
  async equipStyle(
    @Body() dto: EquipStyleDto,
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<EquippedStyleResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      authSessionHeader,
    );

    return this.profileService.equipStyle(
      dto.profileId,
      dto.rewardId,
      dto.rewardKey,
      dto.rarity,
      dto.source,
      dto.variant,
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
  async getRewardsInventory(
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<RewardsInventoryView> {
    const profileId =
      await this.walletBindingService.resolveAuthenticatedProfileId(
        authSessionHeader,
      );
    return this.profileService.getRewardsInventory(profileId);
  }
}
