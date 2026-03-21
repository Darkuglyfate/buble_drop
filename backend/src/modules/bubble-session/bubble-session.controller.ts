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
import { AUTH_SESSION_HEADER } from '../auth-session/auth-session.service';
import { WalletBindingService } from '../wallet-binding/wallet-binding.service';

@Controller('bubble-session')
export class BubbleSessionController {
  constructor(
    private readonly bubbleSessionService: BubbleSessionService,
    private readonly walletBindingService: WalletBindingService,
  ) {}

  @Post('start')
  async startSession(
    @Body() dto: StartBubbleSessionDto,
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<BubbleSessionStartResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      authSessionHeader,
    );

    return this.bubbleSessionService.startSession(dto.profileId);
  }

  @Post('complete')
  async completeSession(
    @Body() dto: CompleteBubbleSessionDto,
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<BubbleSessionCompleteResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      authSessionHeader,
    );

    return this.bubbleSessionService.completeSession(
      dto.profileId,
      dto.sessionId,
      dto.activeSeconds,
      dto.finalScore,
      dto.bestCombo,
    );
  }

  @Post('activity')
  async recordActivity(
    @Body() dto: RecordBubbleSessionActivityDto,
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): Promise<BubbleSessionActivityRecordResult> {
    await this.walletBindingService.assertProfileAccess(
      dto.profileId,
      authSessionHeader,
    );

    return this.bubbleSessionService.recordActivitySignal(
      dto.profileId,
      dto.sessionId,
    );
  }
}
