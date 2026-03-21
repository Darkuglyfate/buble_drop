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

@Entity({ name: 'bubble_sessions' })
@Index('IDX_bubble_sessions_one_active_per_profile', ['profileId'], {
  unique: true,
  where: '"isCompleted" = false',
})
export class BubbleSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @CreateDateColumn({ type: 'timestamptz' })
  startedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  endedAt: Date | null;

  @Column({ type: 'int', default: 0 })
  activeSeconds: number;

  @Column({ type: 'boolean', default: false })
  isCompleted: boolean;

  @Column({ type: 'int', default: 0 })
  finalScore: number;

  @Column({ type: 'int', default: 0 })
  bestCombo: number;

  @Column({ type: 'int', default: 0 })
  rewardFlags: number;

  @Column({ type: 'varchar', length: 66, nullable: true })
  integrityHash: string | null;

  @Column({ type: 'varchar', length: 66, nullable: true })
  outcomeTxHash: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  outcomeRecordedAt: Date | null;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
