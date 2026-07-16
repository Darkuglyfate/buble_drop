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

export enum CheckInStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  ORPHANED = 'orphaned',
}

@Entity({ name: 'check_in_records' })
@Index(
  'IDX_check_in_records_active_profile_date',
  ['profileId', 'checkInDate'],
  {
    unique: true,
    where: `"status" <> 'orphaned'`,
  },
)
@Index(
  'IDX_check_in_records_chain_tx_log_index_unique',
  ['chainId', 'txHash', 'txLogIndex'],
  {
    unique: true,
    where:
      '"chainId" IS NOT NULL AND "txHash" IS NOT NULL AND "txLogIndex" IS NOT NULL',
  },
)
export class CheckInRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Column({ type: 'date' })
  checkInDate: string;

  @Column({ type: 'varchar', length: 66, nullable: true })
  txHash: string | null;

  @Column({ type: 'enum', enum: CheckInStatus, default: CheckInStatus.PENDING })
  status: CheckInStatus;

  @Column({ type: 'int', nullable: true })
  chainId: number | null;

  @Column({ type: 'int', nullable: true })
  txLogIndex: number | null;

  @Column({ type: 'bigint', nullable: true })
  blockNumber: string | null;

  @Column({ type: 'varchar', length: 66, nullable: true })
  blockHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
