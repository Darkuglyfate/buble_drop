import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Avatar } from './avatar.entity';
import { Profile } from './profile.entity';

@Entity({ name: 'profile_avatar_unlocks' })
@Index(['profileId', 'avatarId'], { unique: true })
export class ProfileAvatarUnlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @Index()
  profileId: string;

  @ManyToOne(() => Profile, (profile) => profile.avatarUnlocks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Column({ type: 'uuid' })
  @Index()
  avatarId: string;

  @ManyToOne(() => Avatar, (avatar) => avatar.unlockedByProfiles, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'avatarId' })
  avatar: Avatar;

  @CreateDateColumn({ type: 'timestamptz' })
  unlockedAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
