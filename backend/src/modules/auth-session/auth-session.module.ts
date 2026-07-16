import { Module } from '@nestjs/common';
import { RedisModule } from '../../redis/redis.module';
import { AuthSessionController } from './auth-session.controller';
import { AuthSessionService } from './auth-session.service';

@Module({
  imports: [RedisModule],
  controllers: [AuthSessionController],
  providers: [AuthSessionService],
  exports: [AuthSessionService],
})
export class AuthSessionModule {}
