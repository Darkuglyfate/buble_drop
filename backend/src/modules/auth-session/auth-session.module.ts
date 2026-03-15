import { Module } from '@nestjs/common';
import { AuthSessionController } from './auth-session.controller';
import { AuthSessionService } from './auth-session.service';

@Module({
  controllers: [AuthSessionController],
  providers: [AuthSessionService],
  exports: [AuthSessionService],
})
export class AuthSessionModule {}
