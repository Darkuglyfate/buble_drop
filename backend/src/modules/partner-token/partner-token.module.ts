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
import { Season } from './entities/season.entity';
import { PartnerTokenService } from './partner-token.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Season,
      PartnerToken,
      PartnerTokenPin,
      Referral,
      Profile,
      CheckInRecord,
    ]),
    RewardsModule,
    WalletBindingModule,
  ],
  controllers: [PartnerTokenController],
  providers: [PartnerTokenService],
  exports: [PartnerTokenService],
})
export class PartnerTokenModule {}
