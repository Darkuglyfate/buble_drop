import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfileNftOwnership } from './profile-nft-ownership.entity';

export enum NftTier {
  SIMPLE = 'simple',
  RARE = 'rare',
}

@Entity({ name: 'nft_definitions' })
export class NftDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 64 })
  label: string;

  @Column({ type: 'enum', enum: NftTier })
  tier: NftTier;

  @Column({ type: 'int' })
  minStreak: number;

  @Column({ type: 'int' })
  minXp: number;

  @Column({ type: 'int' })
  minSessions: number;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  dropChancePercent: string;

  @Column({ type: 'int' })
  cooldownDays: number;

  @OneToMany(() => ProfileNftOwnership, (ownership) => ownership.nftDefinition)
  ownerships: ProfileNftOwnership[];
}
