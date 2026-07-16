import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import {
  ClaimService,
  ClaimableTokenBalanceView,
  CreateTokenClaimResult,
} from './claim.service';
import { CreateTokenClaimDto } from './dto/create-token-claim.dto';
import { AUTH_SESSION_HEADER } from '../auth-session/auth-session.service';
import { WalletBindingService } from '../wallet-binding/wallet-binding.service';

@Controller('claim')
export class ClaimController {
  constructor(
    private readonly claimService: ClaimService,
    private readonly walletBindingService: WalletBindingService,
  ) {}

  @Get('balances')
  async getClaimableBalances(
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<ClaimableTokenBalanceView[]> {
    const profileId =
      await this.walletBindingService.resolveAuthenticatedProfileId(
        authSessionHeader,
      );
    return this.claimService.getClaimableBalances(profileId);
  }

  @Post('request')
  async createTokenClaim(
    @Body() dto: CreateTokenClaimDto,
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<CreateTokenClaimResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      authSessionHeader,
    );

    return this.claimService.createTokenClaim(dto);
  }
}
