import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GaslessRelayModule } from '../onchain-relay/gasless-relay.module';
import { Profile } from '../profile/entities/profile.entity';
import { QualificationModule } from '../qualification/qualification.module';
import { RewardsModule } from '../rewards/rewards.module';
import { WalletBindingModule } from '../wallet-binding/wallet-binding.module';
import { BubbleSessionController } from './bubble-session.controller';
import { BubbleSession } from './entities/bubble-session.entity';
import { BubbleSessionService } from './bubble-session.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([BubbleSession, Profile]),
    GaslessRelayModule,
    QualificationModule,
    RewardsModule,
    WalletBindingModule,
  ],
  controllers: [BubbleSessionController],
  providers: [BubbleSessionService],
  exports: [BubbleSessionService],
})
export class BubbleSessionModule {}
