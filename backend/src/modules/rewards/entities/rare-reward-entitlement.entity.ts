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
import { BubbleSession } from '../../bubble-session/entities/bubble-session.entity';
import { Profile } from '../../profile/entities/profile.entity';
import { Season } from '../../partner-token/entities/season.entity';
import type { RareRewardIssueResult } from '../rare-reward.service';

export enum RareRewardEntitlementStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  ISSUED = 'issued',
  FAILED = 'failed',
}

@Entity({ name: 'rare_reward_entitlements' })
@Index('IDX_rare_reward_entitlements_session_id', ['sessionId'], {
  unique: true,
})
@Index('IDX_rare_reward_entitlements_idempotency_key', ['idempotencyKey'], {
  unique: true,
})
@Index('IDX_rare_reward_entitlements_status_processing', [
  'status',
  'processingStartedAt',
])
@Index('IDX_rare_reward_entitlements_season_status', ['seasonId', 'status'])
export class RareRewardEntitlement {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  sessionId: string;

  @ManyToOne(() => BubbleSession, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sessionId' })
  session: BubbleSession;

  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Column({ type: 'uuid', nullable: true })
  seasonId: string | null;

  @ManyToOne(() => Season, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'seasonId' })
  season: Season | null;

  @Column({ type: 'varchar', length: 160 })
  idempotencyKey: string;

  @Column({
    type: 'enum',
    enum: RareRewardEntitlementStatus,
    default: RareRewardEntitlementStatus.PENDING,
  })
  status: RareRewardEntitlementStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  processingStartedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  issuedAt: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError: string | null;

  @Column({ type: 'jsonb', nullable: true })
  outcome: RareRewardIssueResult | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
