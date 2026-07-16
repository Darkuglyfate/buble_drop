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

@Entity({ name: 'weekly_token_tickets' })
@Index(['profileId', 'weekStartDate', 'tokenSymbol'])
export class WeeklyTokenTicket {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Index('IDX_weekly_token_tickets_season_id')
  @Column({ type: 'uuid', nullable: true })
  seasonId: string | null;

  @ManyToOne(() => Season, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'seasonId' })
  season: Season | null;

  @Column({ type: 'date' })
  weekStartDate: string;

  @Column({ type: 'varchar', length: 64 })
  tokenSymbol: string;

  @Column({ type: 'int', default: 1 })
  weight: number;

  @Index('IDX_weekly_token_tickets_idempotency_key_unique', {
    unique: true,
    where: '"idempotencyKey" IS NOT NULL',
  })
  @Column({ type: 'varchar', length: 160, nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
