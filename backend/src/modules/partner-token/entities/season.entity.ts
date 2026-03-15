import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PartnerToken } from './partner-token.entity';

@Index('IDX_seasons_one_active_season', ['isActive'], {
  unique: true,
  where: '"isActive" = true',
})
@Entity({ name: 'seasons' })
export class Season {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 128 })
  title: string;

  @Column({ type: 'date' })
  startDate: string;

  @Column({ type: 'date' })
  endDate: string;

  @Column({ type: 'boolean', default: false })
  isActive: boolean;

  @OneToMany(() => PartnerToken, (partnerToken) => partnerToken.season)
  partnerTokens: PartnerToken[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
