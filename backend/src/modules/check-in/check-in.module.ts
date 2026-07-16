import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { SeasonModule } from '../partner-token/season.module';
import { QualificationModule } from '../qualification/qualification.module';
import { RewardsModule } from '../rewards/rewards.module';
import { WalletBindingModule } from '../wallet-binding/wallet-binding.module';
import { CheckInController } from './check-in.controller';
import { CheckInRecord } from './entities/check-in-record.entity';
import { CheckInReceiptVerifier } from './check-in-receipt-verifier.service';
import { CheckInService } from './check-in.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CheckInRecord, Profile]),
    SeasonModule,
    QualificationModule,
    RewardsModule,
    WalletBindingModule,
  ],
  controllers: [CheckInController],
  providers: [CheckInService, CheckInReceiptVerifier],
  exports: [CheckInService],
})
export class CheckInModule {}
