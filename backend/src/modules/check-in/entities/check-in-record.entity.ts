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

@Entity({ name: 'check_in_records' })
@Index(['profileId', 'checkInDate'], { unique: true })
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

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
