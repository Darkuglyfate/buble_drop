import { Body, Controller, Get, Headers, Post, Query } from '@nestjs/common';
import {
  ClaimService,
  ClaimableTokenBalanceView,
  CreateTokenClaimResult,
} from './claim.service';
import { CreateTokenClaimDto } from './dto/create-token-claim.dto';
import { GetClaimBalancesDto } from './dto/get-claim-balances.dto';
import {
  WALLET_ADDRESS_HEADER,
  WalletBindingService,
} from '../wallet-binding/wallet-binding.service';

@Controller('claim')
export class ClaimController {
  constructor(
    private readonly claimService: ClaimService,
    private readonly walletBindingService: WalletBindingService,
  ) {}

  @Get('balances')
  getClaimableBalances(
    @Query() dto: GetClaimBalancesDto,
  ): Promise<ClaimableTokenBalanceView[]> {
    return this.claimService.getClaimableBalances(dto.profileId);
  }

  @Post('request')
  async createTokenClaim(
    @Body() dto: CreateTokenClaimDto,
    @Headers(WALLET_ADDRESS_HEADER) walletAddressHeader?: string,
  ): Promise<CreateTokenClaimResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      walletAddressHeader,
    );

    return this.claimService.createTokenClaim(dto);
  }
}
