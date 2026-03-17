export class EquipStyleDto {
  profileId: string;
  rewardId: string;
  rewardKey: string;
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  source: 'nft' | 'cosmetic';
  variant: string;
}
