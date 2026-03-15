import { Body, Controller, Post } from '@nestjs/common';
import { RequestAuthSessionNonceDto } from './dto/request-auth-session-nonce.dto';
import { VerifyAuthSessionDto } from './dto/verify-auth-session.dto';
import { AuthSessionService } from './auth-session.service';
import type {
  AuthSessionNonceResult,
  VerifiedAuthSessionResult,
} from './auth-session.service';

@Controller('auth/session')
export class AuthSessionController {
  constructor(private readonly authSessionService: AuthSessionService) {}

  @Post('nonce')
  createNonce(@Body() dto: RequestAuthSessionNonceDto): AuthSessionNonceResult {
    return this.authSessionService.createNonce(dto.walletAddress, dto.chainId);
  }

  @Post('verify')
  verifySiweMessage(
    @Body() dto: VerifyAuthSessionDto,
  ): Promise<VerifiedAuthSessionResult> {
    return this.authSessionService.verifySiweMessageAndCreateSession(
      dto.message,
      dto.signature,
    );
  }
}
