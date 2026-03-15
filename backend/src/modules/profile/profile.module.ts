import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthSessionModule } from '../auth-session/auth-session.module';
import { ClaimableTokenBalance } from '../claim/entities/claimable-token-balance.entity';
import { QualificationModule } from '../qualification/qualification.module';
import { RewardsModule } from '../rewards/rewards.module';
import { WalletBindingModule } from '../wallet-binding/wallet-binding.module';
import { Avatar } from './entities/avatar.entity';
import { CosmeticDefinition } from './entities/cosmetic-definition.entity';
import { NftDefinition } from './entities/nft-definition.entity';
import { ProfileAvatarUnlock } from './entities/profile-avatar-unlock.entity';
import { ProfileCosmeticUnlock } from './entities/profile-cosmetic-unlock.entity';
import { ProfileNftOwnership } from './entities/profile-nft-ownership.entity';
import { Profile } from './entities/profile.entity';
import { RankFrameDefinition } from './entities/rank-frame-definition.entity';
import { UserWallet } from './entities/user-wallet.entity';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      UserWallet,
      Profile,
      Avatar,
      ProfileAvatarUnlock,
      ClaimableTokenBalance,
      RankFrameDefinition,
      NftDefinition,
      ProfileNftOwnership,
      CosmeticDefinition,
      ProfileCosmeticUnlock,
    ]),
    AuthSessionModule,
    QualificationModule,
    RewardsModule,
    WalletBindingModule,
  ],
  controllers: [ProfileController],
  providers: [ProfileService],
  exports: [ProfileService],
})
export class ProfileModule {}
