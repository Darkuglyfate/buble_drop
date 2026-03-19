import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProfileAvatarUnlock } from './profile-avatar-unlock.entity';
import { Profile } from './profile.entity';

@Entity({ name: 'avatars' })
export class Avatar {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 64 })
  label: string;

  @Column({ type: 'varchar', length: 32, default: 'blue' })
  paletteKey: string;

  @Column({ type: 'boolean', default: false })
  isStarter: boolean;

  @OneToMany(() => Profile, (profile) => profile.currentAvatar)
  selectedByProfiles: Profile[];

  @OneToMany(() => ProfileAvatarUnlock, (unlock) => unlock.avatar)
  unlockedByProfiles: ProfileAvatarUnlock[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
