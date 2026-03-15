import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { NftDefinition } from './nft-definition.entity';
import { Profile } from './profile.entity';

@Entity({ name: 'profile_nft_ownerships' })
@Index(['profileId', 'nftDefinitionId'], { unique: true })
export class ProfileNftOwnership {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, (profile) => profile.nftOwnerships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Index()
  @Column({ type: 'uuid' })
  nftDefinitionId: string;

  @ManyToOne(() => NftDefinition, (nftDefinition) => nftDefinition.ownerships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'nftDefinitionId' })
  nftDefinition: NftDefinition;

  @CreateDateColumn({ type: 'timestamptz' })
  acquiredAt: Date;
}
