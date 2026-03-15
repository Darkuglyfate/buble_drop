import {
  Column,
  Entity,
  Index,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ProfileCosmeticUnlock } from './profile-cosmetic-unlock.entity';

@Entity({ name: 'cosmetic_definitions' })
export class CosmeticDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  key: string;

  @Column({ type: 'varchar', length: 64 })
  label: string;

  @Column({ type: 'int' })
  minStreak: number;

  @Column({ type: 'int' })
  minXp: number;

  @OneToMany(() => ProfileCosmeticUnlock, (unlock) => unlock.cosmeticDefinition)
  unlocks: ProfileCosmeticUnlock[];
}
