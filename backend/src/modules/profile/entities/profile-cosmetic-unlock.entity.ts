import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { CosmeticDefinition } from './cosmetic-definition.entity';
import { Profile } from './profile.entity';

@Entity({ name: 'profile_cosmetic_unlocks' })
@Index(['profileId', 'cosmeticDefinitionId'], { unique: true })
export class ProfileCosmeticUnlock {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, (profile) => profile.cosmeticUnlocks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Index()
  @Column({ type: 'uuid' })
  cosmeticDefinitionId: string;

  @ManyToOne(
    () => CosmeticDefinition,
    (cosmeticDefinition) => cosmeticDefinition.unlocks,
    {
      onDelete: 'CASCADE',
    },
  )
  @JoinColumn({ name: 'cosmeticDefinitionId' })
  cosmeticDefinition: CosmeticDefinition;

  @Index('IDX_profile_cosmetic_unlocks_idempotency_key_unique', {
    unique: true,
    where: '"idempotencyKey" IS NOT NULL',
  })
  @Column({ type: 'varchar', length: 160, nullable: true })
  idempotencyKey: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  unlockedAt: Date;
}
