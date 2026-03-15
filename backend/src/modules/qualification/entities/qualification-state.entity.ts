import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Profile } from '../../profile/entities/profile.entity';

export enum QualificationStatus {
  LOCKED = 'locked',
  IN_PROGRESS = 'in_progress',
  QUALIFIED = 'qualified',
  PAUSED = 'paused',
  RESTORED = 'restored',
}

@Entity({ name: 'qualification_states' })
export class QualificationState {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'uuid' })
  profileId: string;

  @OneToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

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
