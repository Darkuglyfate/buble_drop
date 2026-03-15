import { Body, Controller, Headers, Post } from '@nestjs/common';
import {
  BubbleSessionService,
  BubbleSessionActivityRecordResult,
  BubbleSessionCompleteResult,
  BubbleSessionStartResult,
} from './bubble-session.service';
import { CompleteBubbleSessionDto } from './dto/complete-bubble-session.dto';
import { RecordBubbleSessionActivityDto } from './dto/record-bubble-session-activity.dto';
import { StartBubbleSessionDto } from './dto/start-bubble-session.dto';
import {
  WALLET_ADDRESS_HEADER,
  WalletBindingService,
} from '../wallet-binding/wallet-binding.service';

@Controller('bubble-session')
export class BubbleSessionController {
  constructor(
    private readonly bubbleSessionService: BubbleSessionService,
    private readonly walletBindingService: WalletBindingService,
  ) {}

  @Post('start')
  async startSession(
    @Body() dto: StartBubbleSessionDto,
    @Headers(WALLET_ADDRESS_HEADER) walletAddressHeader?: string,
  ): Promise<BubbleSessionStartResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      walletAddressHeader,
    );

    return this.bubbleSessionService.startSession(dto.profileId);
  }

  @Post('complete')
  async completeSession(
    @Body() dto: CompleteBubbleSessionDto,
    @Headers(WALLET_ADDRESS_HEADER) walletAddressHeader?: string,
  ): Promise<BubbleSessionCompleteResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      walletAddressHeader,
    );

    return this.bubbleSessionService.completeSession(
      dto.profileId,
      dto.sessionId,
      dto.activeSeconds,
    );
  }

  @Post('activity')
  async recordActivity(
    @Body() dto: RecordBubbleSessionActivityDto,
    @Headers(WALLET_ADDRESS_HEADER) walletAddressHeader?: string,
  ): Promise<BubbleSessionActivityRecordResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      walletAddressHeader,
    );

    return this.bubbleSessionService.recordActivitySignal(
      dto.profileId,
      dto.sessionId,
    );
  }
}
