import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { MarkReferralSuccessDto } from './dto/mark-referral-success.dto';
import { AUTH_SESSION_HEADER } from '../auth-session/auth-session.service';
import { WalletBindingService } from '../wallet-binding/wallet-binding.service';
import {
  PartnerTokenDetailView,
  PartnerTokenService,
  PartnerTokenTransparencyView,
  ReferralProgressView,
  ReferralSuccessResult,
  SeasonHubView,
} from './partner-token.service';

@Controller('partner-token')
export class PartnerTokenController {
  constructor(
    private readonly partnerTokenService: PartnerTokenService,
    private readonly walletBindingService: WalletBindingService,
  ) {}

  @Get('transparency')
  getTransparencyList(): Promise<PartnerTokenTransparencyView[]> {
    return this.partnerTokenService.getTransparencyList();
  }

  @Post('referral/success')
  async markReferralSuccessful(
    @Body() dto: MarkReferralSuccessDto,
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<ReferralSuccessResult> {
    await this.walletBindingService.assertReferralAccess(
      dto.referralId,
      authSessionHeader,
    );

    return this.partnerTokenService.markReferralSuccessful(dto.referralId);
  }

  @Get('referral/progress')
  getReferralProgress(
    @Query('profileId') profileId: string,
  ): Promise<ReferralProgressView> {
    return this.partnerTokenService.getReferralProgress(profileId);
  }

  @Get('season-hub')
  getSeasonHub(): Promise<SeasonHubView> {
    return this.partnerTokenService.getSeasonHub();
  }

  @Get('token/:tokenId')
  getTokenDetail(
    @Param('tokenId') tokenId: string,
  ): Promise<PartnerTokenDetailView> {
    return this.partnerTokenService.getTokenDetail(tokenId);
  }
}
