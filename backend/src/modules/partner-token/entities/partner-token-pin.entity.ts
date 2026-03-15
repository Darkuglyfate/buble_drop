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
import { PartnerToken } from './partner-token.entity';

@Entity({ name: 'partner_token_pins' })
@Index(['profileId', 'partnerTokenId'], { unique: true })
export class PartnerTokenPin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  profileId: string;

  @ManyToOne(() => Profile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'profileId' })
  profile: Profile;

  @Index()
  @Column({ type: 'uuid' })
  partnerTokenId: string;

  @ManyToOne(() => PartnerToken, (partnerToken) => partnerToken.pins, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'partnerTokenId' })
  partnerToken: PartnerToken;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
