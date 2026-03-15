import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'rank_frame_definitions' })
export class RankFrameDefinition {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 32 })
  key: string;

  @Column({ type: 'varchar', length: 64 })
  label: string;

  @Index({ unique: true })
  @Column({ type: 'int' })
  order: number;

  @Column({ type: 'int' })
  minLifetimeXp: number;
}
