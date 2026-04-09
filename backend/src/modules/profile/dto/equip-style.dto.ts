import { IsString, IsIn, IsUUID } from 'class-validator';

export class EquipStyleDto {
  @IsUUID()
  profileId: string;

  @IsString()
  rewardId: string;

  @IsString()
  rewardKey: string;

  @IsIn(['common', 'rare', 'epic', 'legendary'])
  rarity: 'common' | 'rare' | 'epic' | 'legendary';

  @IsIn(['nft', 'cosmetic'])
  source: 'nft' | 'cosmetic';

  @IsString()
  variant: string;
}
