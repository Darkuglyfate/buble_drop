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

@Entity({ name: 'claimable_token_balances' })
@Index(['profileId', 'tokenSymbol'], { unique: true })
export class ClaimableTokenBalance {
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

  @Column({ type: 'numeric', precision: 36, scale: 0, default: '0' })
  claimableAmount: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
