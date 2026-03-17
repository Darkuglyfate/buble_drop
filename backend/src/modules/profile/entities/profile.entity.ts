import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Avatar } from './avatar.entity';
import { ProfileCosmeticUnlock } from './profile-cosmetic-unlock.entity';
import { ProfileAvatarUnlock } from './profile-avatar-unlock.entity';
import { ProfileNftOwnership } from './profile-nft-ownership.entity';
import { UserWallet } from './user-wallet.entity';

@Entity({ name: 'profiles' })
export class Profile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  walletId: string;

  @OneToOne(() => UserWallet, (wallet) => wallet.profile, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'walletId' })
  wallet: UserWallet;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32, nullable: true })
  nickname: string | null;

  @Column({ type: 'uuid', nullable: true })
  currentAvatarId: string | null;

  @ManyToOne(() => Avatar, (avatar) => avatar.selectedByProfiles, {
    nullable: true,
    onDelete: 'SET NULL',
  })
  @JoinColumn({ name: 'currentAvatarId' })
  currentAvatar: Avatar | null;

  @Column({ type: 'int', default: 0 })
  totalXp: number;

  @Column({ type: 'int', default: 0 })
  currentStreak: number;

  @Column({ type: 'timestamptz', nullable: true })
  onboardingCompletedAt: Date | null;

  @Column({ type: 'jsonb', nullable: true, select: false })
  equippedStyleSnapshot:
    | {
        rewardId: string;
        rewardKey: string;
        rarity: 'common' | 'rare' | 'epic' | 'legendary';
        source: 'nft' | 'cosmetic';
        variant: string;
        appliedAt: string;
      }
    | null;

  @OneToMany(() => ProfileAvatarUnlock, (unlock) => unlock.profile)
  avatarUnlocks: ProfileAvatarUnlock[];

  @OneToMany(() => ProfileNftOwnership, (ownership) => ownership.profile)
  nftOwnerships: ProfileNftOwnership[];

  @OneToMany(() => ProfileCosmeticUnlock, (unlock) => unlock.profile)
  cosmeticUnlocks: ProfileCosmeticUnlock[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
