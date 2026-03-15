import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { PartnerTokenPin } from './partner-token-pin.entity';
import { Season } from './season.entity';

@Entity({ name: 'partner_tokens' })
@Index(['seasonId', 'symbol'], { unique: true })
export class PartnerToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  seasonId: string;

  @ManyToOne(() => Season, (season) => season.partnerTokens, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'seasonId' })
  season: Season;

  @Column({ type: 'varchar', length: 64 })
  symbol: string;

  @Column({ type: 'varchar', length: 128 })
  name: string;

  @Column({ type: 'varchar', length: 42 })
  contractAddress: string;

  @Column({ type: 'varchar', length: 255 })
  twitterUrl: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  chartUrl: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  dexscreenerUrl: string | null;

  @OneToMany(() => PartnerTokenPin, (pin) => pin.partnerToken)
  pins: PartnerTokenPin[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
