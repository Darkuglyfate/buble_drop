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

export enum QualificationStatus {
  LOCKED = 'locked',
  IN_PROGRESS = 'in_progress',
  QUALIFIED = 'qualified',
  PAUSED = 'paused',
  RESTORED = 'restored',
}

@Entity({ name: 'qualification_states' })
@Index('UQ_qualification_states_profile_season', ['profileId', 'seasonId'], {
  unique: true,
  where: '"seasonId" IS NOT NULL',
})
export class QualificationState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_qualification_states_profile_id')
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

  @Column({
    type: 'enum',
    enum: QualificationStatus,
    default: QualificationStatus.LOCKED,
  })
  status: QualificationStatus;

  @Column({ type: 'timestamptz', nullable: true })
  qualifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  pausedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  restoredAt: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
