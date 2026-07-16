import { Body, Controller, Get, Headers, Post } from '@nestjs/common';
import { RequestAuthSessionNonceDto } from './dto/request-auth-session-nonce.dto';
import { VerifyAuthSessionDto } from './dto/verify-auth-session.dto';
import { AuthSessionService } from './auth-session.service';
import type {
  AuthSessionNonceResult,
  AuthSessionStatusResult,
  VerifiedAuthSessionResult,
} from './auth-session.service';
import { AUTH_SESSION_HEADER } from './auth-session.service';

@Controller('auth/session')
export class AuthSessionController {
  constructor(private readonly authSessionService: AuthSessionService) {}

  @Post('nonce')
  async createNonce(
    @Body() dto: RequestAuthSessionNonceDto,
  ): Promise<AuthSessionNonceResult> {
    const nonce = await this.authSessionService.createNonce(
      dto.walletAddress,
      dto.chainId,
    );
    return nonce;
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

  @Get('status')
  getStatus(
    @Headers(AUTH_SESSION_HEADER) authSessionHeader?: string,
  ): AuthSessionStatusResult {
    return this.authSessionService.getSessionStatus(authSessionHeader);
  }
}
