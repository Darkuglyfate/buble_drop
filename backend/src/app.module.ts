import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from './app.controller';
import { AppService } from './app.service';
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
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'postgres',
        host: configService.get<string>('DB_HOST', 'localhost'),
        port: configService.get<number>('DB_PORT', 5432),
        username: configService.get<string>('DB_USER', 'postgres'),
        password: configService.get<string>('DB_PASSWORD', 'postgres'),
        database: configService.get<string>('DB_NAME', 'bubbledrop'),
        autoLoadEntities: true,
        synchronize: false,
        extra: {
          connectionTimeoutMillis: 5000,
          query_timeout: 5000,
          statement_timeout: 5000,
          idle_in_transaction_session_timeout: 5000,
          keepAlive: true,
        },
      }),
    }),
    AuthSessionModule,
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
  providers: [AppService],
})
export class AppModule {}
