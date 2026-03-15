import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaimableTokenBalance } from '../claim/entities/claimable-token-balance.entity';
import { BubbleSession } from '../bubble-session/entities/bubble-session.entity';
import { PartnerToken } from '../partner-token/entities/partner-token.entity';
import { Season } from '../partner-token/entities/season.entity';
import { CosmeticDefinition } from '../profile/entities/cosmetic-definition.entity';
import { NftDefinition } from '../profile/entities/nft-definition.entity';
import { ProfileCosmeticUnlock } from '../profile/entities/profile-cosmetic-unlock.entity';
import { ProfileNftOwnership } from '../profile/entities/profile-nft-ownership.entity';
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
      BubbleSession,
    ]),
  ],
  providers: [XpService, RareRewardService],
  exports: [XpService, RareRewardService],
})
export class RewardsModule {}
