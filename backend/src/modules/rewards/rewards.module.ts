import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaimableTokenBalance } from '../claim/entities/claimable-token-balance.entity';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { GaslessRelayModule } from '../onchain-relay/gasless-relay.module';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { SeasonModule } from '../partner-token/season.module';
import { CosmeticDefinition } from '../profile/entities/cosmetic-definition.entity';
import { NftDefinition } from '../profile/entities/nft-definition.entity';
import { Profile } from '../profile/entities/profile.entity';
import { ProfileCosmeticUnlock } from '../profile/entities/profile-cosmetic-unlock.entity';
import { ProfileNftOwnership } from '../profile/entities/profile-nft-ownership.entity';
import { UserWallet } from '../profile/entities/user-wallet.entity';
import { RewardEvent } from './entities/reward-event.entity';
import { RareRewardEntitlement } from './entities/rare-reward-entitlement.entity';
import { WeeklyTokenTicket } from './entities/weekly-token-ticket.entity';
import { RareRewardEntitlementProcessor } from './rare-reward-entitlement.processor';
import { RareRewardEntitlementService } from './rare-reward-entitlement.service';
import { RareRewardService } from './rare-reward.service';
import { XpService } from './xp.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RewardEvent,
      RareRewardEntitlement,
      Profile,
      WeeklyTokenTicket,
      PartnerToken,
      ClaimableTokenBalance,
      NftDefinition,
      ProfileNftOwnership,
      CosmeticDefinition,
      ProfileCosmeticUnlock,
      UserWallet,
      BubbleSession,
    ]),
    SeasonModule,
    GaslessRelayModule,
  ],
  providers: [
    XpService,
    RareRewardService,
    RareRewardEntitlementService,
    RareRewardEntitlementProcessor,
  ],
  exports: [XpService, RareRewardService, RareRewardEntitlementService],
})
export class RewardsModule {}
