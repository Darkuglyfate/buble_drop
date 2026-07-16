import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Profile } from '../../profile/entities/profile.entity';
import { Season } from '../../partner-token/entities/season.entity';

export enum RewardEventType {
  XP = 'xp',
  TOKEN_TICKET = 'token_ticket',
  NFT = 'nft',
  COSMETIC = 'cosmetic',
}

@Index('IDX_reward_events_idempotency_key_unique', ['idempotencyKey'], {
  unique: true,
  where: '"idempotencyKey" IS NOT NULL',
})
@Entity({ name: 'reward_events' })
@Index('IDX_reward_events_profile_season', ['profileId', 'seasonId'])
export class RewardEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
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

  @Column({ type: 'enum', enum: RewardEventType })
  eventType: RewardEventType;

  @Column({ type: 'int', nullable: true })
  xpAmount: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  tokenSymbol: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  idempotencyKey: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
