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
import { Profile } from '../../profile/entities/profile.entity';

export enum ReferralStatus {
  PENDING = 'pending',
  SUCCESSFUL = 'successful',
}

@Entity({ name: 'referrals' })
@Index(['inviterProfileId', 'invitedWalletAddress'], { unique: true })
export class Referral {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  inviterProfileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'inviterProfileId' })
  inviterProfile: Profile;

  @Index()
  @Column({ type: 'varchar', length: 42 })
  invitedWalletAddress: string;

  @Column({ type: 'uuid', nullable: true })
  invitedProfileId: string | null;

  @ManyToOne(() => Profile, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'invitedProfileId' })
  invitedProfile: Profile | null;

  @Column({
    type: 'enum',
    enum: ReferralStatus,
    default: ReferralStatus.PENDING,
  })
  status: ReferralStatus;

  @Column({ type: 'timestamptz', nullable: true })
  successfulAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
