import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { buildPostgresConnectionOptions } from './database/postgres-options';
import { HealthModule } from './health/health.module';
import { AuthSessionModule } from './modules/auth-session/auth-session.module';
import { CheckInModule } from './modules/check-in/check-in.module';
import { BubbleSessionModule } from './modules/bubble-session/bubble-session.module';
import { ClaimModule } from './modules/claim/claim.module';
import { PartnerTokenModule } from './modules/partner-token/partner-token.module';
import { ProfileModule } from './modules/profile/profile.module';
import { QualificationModule } from './modules/qualification/qualification.module';
import { RewardsModule } from './modules/rewards/rewards.module';
import { RedisModule } from './redis/redis.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env.local', '.env'],
    }),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60000, limit: 60 }],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        ...buildPostgresConnectionOptions({
          NODE_ENV: configService.get('NODE_ENV'),
          DATABASE_URL: configService.get('DATABASE_URL'),
          DB_HOST: configService.get('DB_HOST'),
          DB_PORT: configService.get('DB_PORT'),
          DB_USER: configService.get('DB_USER'),
          DB_PASSWORD: configService.get('DB_PASSWORD'),
          DB_NAME: configService.get('DB_NAME'),
          DB_SSL: configService.get('DB_SSL'),
          DB_SSL_ALLOW_SELF_SIGNED: configService.get(
            'DB_SSL_ALLOW_SELF_SIGNED',
          ),
        }),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    AuthSessionModule,
    HealthModule,
    RedisModule,
    ProfileModule,
    CheckInModule,
    BubbleSessionModule,
    RewardsModule,
    QualificationModule,
    PartnerTokenModule,
    ClaimModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
