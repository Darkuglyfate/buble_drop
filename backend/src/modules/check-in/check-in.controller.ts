import { Body, Controller, Headers, Post } from '@nestjs/common';
import { DailyCheckInDto } from './dto/daily-check-in.dto';
import { CheckInService, DailyCheckInResult } from './check-in.service';
import {
  WALLET_ADDRESS_HEADER,
  WalletBindingService,
} from '../wallet-binding/wallet-binding.service';

@Controller('check-in')
export class CheckInController {
  constructor(
    private readonly checkInService: CheckInService,
    private readonly walletBindingService: WalletBindingService,
  ) {}

  @Post('daily')
  async performDailyCheckIn(
    @Body() dto: DailyCheckInDto,
    @Headers(WALLET_ADDRESS_HEADER) walletAddressHeader?: string,
  ): Promise<DailyCheckInResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      walletAddressHeader,
    );

    return this.checkInService.performDailyCheckIn(dto.profileId, dto.txHash);
  }
}
