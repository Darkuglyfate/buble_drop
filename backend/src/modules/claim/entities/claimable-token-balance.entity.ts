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
import { Season } from '../../partner-token/entities/season.entity';

@Entity({ name: 'claimable_token_balances' })
@Index(
  'UQ_claimable_token_balances_profile_season_token',
  ['profileId', 'seasonId', 'tokenSymbol'],
  { unique: true, where: '"seasonId" IS NOT NULL' },
)
@Index(
  'UQ_claimable_token_balances_legacy_profile_token',
  ['profileId', 'tokenSymbol'],
  { unique: true, where: '"seasonId" IS NULL' },
)
export class ClaimableTokenBalance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Index()
  @Column({ type: 'uuid', nullable: true })
  seasonId: string | null;

  @ManyToOne(() => Season, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'seasonId' })
  season: Season | null;

  @Column({ type: 'varchar', length: 64 })
  tokenSymbol: string;

  @Column({ type: 'numeric', precision: 36, scale: 0, default: '0' })
  claimableAmount: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
