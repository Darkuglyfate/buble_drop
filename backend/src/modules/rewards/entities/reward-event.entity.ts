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

export enum RewardEventType {
  XP = 'xp',
  TOKEN_TICKET = 'token_ticket',
  NFT = 'nft',
  COSMETIC = 'cosmetic',
}

@Entity({ name: 'reward_events' })
export class RewardEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Column({ type: 'enum', enum: RewardEventType })
  eventType: RewardEventType;

  @Column({ type: 'int', nullable: true })
  xpAmount: number | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  tokenSymbol: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
