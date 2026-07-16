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

export enum TokenClaimStatus {
  PENDING = 'pending',
  UNKNOWN = 'unknown',
  CONFIRMED = 'confirmed',
  FAILED = 'failed',
}

@Entity({ name: 'token_claims' })
@Index(
  'IDX_token_claims_one_pending_per_profile_token',
  ['profileId', 'tokenSymbol'],
  {
    unique: true,
    where: `"status" <> 'confirmed' AND "status" <> 'failed'`,
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

  @Index()
  @Column({ type: 'uuid', nullable: true })
  seasonId: string | null;

  @ManyToOne(() => Season, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'seasonId' })
  season: Season | null;

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

  @Column({ type: 'varchar', length: 42, nullable: true })
  recipientWalletAddress: string | null;

  @Column({ type: 'varchar', length: 42, nullable: true })
  tokenContractAddress: string | null;

  @Column({ type: 'varchar', length: 42, nullable: true })
  payoutSenderAddress: string | null;

  @Column({ type: 'numeric', precision: 78, scale: 0, nullable: true })
  payoutNonce: string | null;

  @Column({ type: 'text', nullable: true })
  serializedPayoutTransaction: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  broadcastAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  reconciledAt: Date | null;

  @Column({ type: 'text', nullable: true })
  payoutError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'varchar', length: 66, nullable: true })
  settlementRecordTxHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  settlementRecordedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
