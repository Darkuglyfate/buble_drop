import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaimableTokenBalance } from '../claim/entities/claimable-token-balance.entity';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { GaslessRelayModule } from '../onchain-relay/gasless-relay.module';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { Season } from '../partner-token/entities/season.entity';
import { CosmeticDefinition } from '../profile/entities/cosmetic-definition.entity';
import { NftDefinition } from '../profile/entities/nft-definition.entity';
import { ProfileCosmeticUnlock } from '../profile/entities/profile-cosmetic-unlock.entity';
import { ProfileNftOwnership } from '../profile/entities/profile-nft-ownership.entity';
import { UserWallet } from '../profile/entities/user-wallet.entity';
import { RewardEvent } from './entities/reward-event.entity';
import { WeeklyTokenTicket } from './entities/weekly-token-ticket.entity';
import { RareRewardService } from './rare-reward.service';
import { XpService } from './xp.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      RewardEvent,
      WeeklyTokenTicket,
      Season,
      PartnerToken,
      ClaimableTokenBalance,
      NftDefinition,
      ProfileNftOwnership,
      CosmeticDefinition,
      ProfileCosmeticUnlock,
      UserWallet,
      BubbleSession,
    ]),
    GaslessRelayModule,
  ],
  providers: [XpService, RareRewardService],
  exports: [XpService, RareRewardService],
})
export class RewardsModule {}
