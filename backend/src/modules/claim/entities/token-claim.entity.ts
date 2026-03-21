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

export enum TokenClaimStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

@Entity({ name: 'token_claims' })
@Index(
  'IDX_token_claims_one_pending_per_profile_token',
  ['profileId', 'tokenSymbol'],
  {
    unique: true,
    where: `"status" = 'pending'`,
  },
)
export class TokenClaim {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Column({ type: 'varchar', length: 64 })
  tokenSymbol: string;

  @Column({ type: 'numeric', precision: 36, scale: 0 })
  amount: string;

  @Column({
    type: 'enum',
    enum: TokenClaimStatus,
    default: TokenClaimStatus.PENDING,
  })
  status: TokenClaimStatus;

  @Column({ type: 'varchar', length: 66, nullable: true })
  txHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'varchar', length: 66, nullable: true })
  settlementRecordTxHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  settlementRecordedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
