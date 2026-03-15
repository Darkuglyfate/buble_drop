import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Profile } from '../profile/entities/profile.entity';
import { QualificationModule } from '../qualification/qualification.module';
import { RewardsModule } from '../rewards/rewards.module';
import { WalletBindingModule } from '../wallet-binding/wallet-binding.module';
import { CheckInController } from './check-in.controller';
import { CheckInOnchainService } from './check-in-onchain.service';
import { CheckInRecord } from './entities/check-in-record.entity';
import { CheckInService } from './check-in.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([CheckInRecord, Profile]),
    QualificationModule,
    RewardsModule,
    WalletBindingModule,
  ],
  controllers: [CheckInController],
  providers: [CheckInService, CheckInOnchainService],
  exports: [CheckInService],
})
export class CheckInModule {}
