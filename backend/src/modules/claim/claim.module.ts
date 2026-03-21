import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GaslessRelayModule } from '../onchain-relay/gasless-relay.module';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { Profile } from '../profile/entities/profile.entity';
import { UserWallet } from '../profile/entities/user-wallet.entity';
import { QualificationModule } from '../qualification/qualification.module';
import { WalletBindingModule } from '../wallet-binding/wallet-binding.module';
import { ClaimController } from './claim.controller';
import { ClaimableTokenBalance } from './entities/claimable-token-balance.entity';
import { TokenClaim } from './entities/token-claim.entity';
import { ClaimService } from './claim.service';
import { RewardWalletPayoutService } from './reward-wallet-payout.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      ClaimableTokenBalance,
      TokenClaim,
      Profile,
      UserWallet,
      PartnerToken,
    ]),
    GaslessRelayModule,
    QualificationModule,
    WalletBindingModule,
  ],
  controllers: [ClaimController],
  providers: [ClaimService, RewardWalletPayoutService],
  exports: [ClaimService],
})
export class ClaimModule {}
