import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Referral } from '../partner-token/entities/referral.entity';
import { Profile } from '../profile/entities/profile.entity';
import { WalletBindingService } from './wallet-binding.service';

@Module({
  imports: [TypeOrmModule.forFeature([Profile, Referral])],
  providers: [WalletBindingService],
  exports: [WalletBindingService],
})
export class WalletBindingModule {}
