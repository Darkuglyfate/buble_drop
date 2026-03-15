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

  @Column({ type: 'date' })
  weekStartDate: string;

  @Column({ type: 'varchar', length: 64 })
  tokenSymbol: string;

  @Column({ type: 'int', default: 1 })
  weight: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
