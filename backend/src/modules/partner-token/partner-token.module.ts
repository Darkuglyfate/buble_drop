import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CheckInRecord } from '../check-in/entities/check-in-record.entity';
import { Profile } from '../profile/entities/profile.entity';
import { RewardsModule } from '../rewards/rewards.module';
import { WalletBindingModule } from '../wallet-binding/wallet-binding.module';
import { PartnerTokenController } from './partner-token.controller';
import { PartnerToken } from './entities/partner-token.entity';
import { PartnerTokenPin } from './entities/partner-token-pin.entity';
import { Referral } from './entities/referral.entity';
import { PartnerTokenService } from './partner-token.service';
import { SeasonModule } from './season.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PartnerToken,
      PartnerTokenPin,
      Referral,
      Profile,
      CheckInRecord,
    ]),
    SeasonModule,
    RewardsModule,
    WalletBindingModule,
  ],
  controllers: [PartnerTokenController],
  providers: [PartnerTokenService],
  exports: [PartnerTokenService],
})
export class PartnerTokenModule {}
