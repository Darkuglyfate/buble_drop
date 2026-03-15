import { Body, Controller, Headers, Post } from '@nestjs/common';
import { DailyCheckInDto } from './dto/daily-check-in.dto';
import { CheckInService, DailyCheckInResult } from './check-in.service';
import { AUTH_SESSION_HEADER } from '../auth-session/auth-session.service';
import { WalletBindingService } from '../wallet-binding/wallet-binding.service';

@Controller('check-in')
export class CheckInController {
  constructor(
    private readonly checkInService: CheckInService,
    private readonly walletBindingService: WalletBindingService,
  ) {}

  @Post('daily')
  async performDailyCheckIn(
    @Body() dto: DailyCheckInDto,
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<DailyCheckInResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      authSessionHeader,
    );

    return this.checkInService.performDailyCheckIn(dto.profileId, dto.txHash);
  }
}
