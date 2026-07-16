import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { AppModule } from '../app.module';
import { Avatar } from '../modules/profile/entities/avatar.entity';
import { RankFrameDefinition } from '../modules/profile/entities/rank-frame-definition.entity';

const logger = new Logger('ReferenceDataSeed');

const RANK_FRAMES: Array<
  Pick<RankFrameDefinition, 'key' | 'label' | 'order' | 'minLifetimeXp'>
> = [
  { key: 'bronze', label: 'Bronze', order: 1, minLifetimeXp: 0 },
  { key: 'silver', label: 'Silver', order: 2, minLifetimeXp: 250 },
  { key: 'gold', label: 'Gold', order: 3, minLifetimeXp: 700 },
  { key: 'platinum', label: 'Platinum', order: 4, minLifetimeXp: 1500 },
  { key: 'diamond', label: 'Diamond', order: 5, minLifetimeXp: 2800 },
  { key: 'master', label: 'Master', order: 6, minLifetimeXp: 4500 },
  { key: 'legend', label: 'Legend', order: 7, minLifetimeXp: 7000 },
];

const STARTER_AVATARS: Array<
  Pick<Avatar, 'key' | 'label' | 'paletteKey' | 'isStarter'>
> = [
  {
    key: 'starter-bubble-blue',
    label: 'Starter Bubble Blue',
    paletteKey: 'blue',
    isStarter: true,
  },
  {
    key: 'starter-bubble-lilac',
    label: 'Starter Bubble Lilac',
    paletteKey: 'lilac',
    isStarter: true,
  },
  {
    key: 'starter-bubble-rose',
    label: 'Starter Bubble Rose',
    paletteKey: 'rose',
    isStarter: true,
  },
  {
    key: 'starter-bubble-mint',
    label: 'Starter Bubble Mint',
    paletteKey: 'mint',
    isStarter: true,
  },
  {
    key: 'starter-bubble-peach',
    label: 'Starter Bubble Peach',
    paletteKey: 'peach',
    isStarter: true,
  },
  {
    key: 'starter-bubble-amber',
    label: 'Starter Bubble Amber',
    paletteKey: 'amber',
    isStarter: true,
  },
  {
    key: 'starter-bubble-sky',
    label: 'Starter Bubble Sky',
    paletteKey: 'sky',
    isStarter: true,
  },
  {
    key: 'starter-bubble-violet',
    label: 'Starter Bubble Violet',
    paletteKey: 'violet',
    isStarter: true,
  },
];

export async function seedReferenceData(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const dataSource = app.get(DataSource);
    await dataSource
      .getRepository(RankFrameDefinition)
      .upsert(RANK_FRAMES, ['key']);
    await dataSource.getRepository(Avatar).upsert(STARTER_AVATARS, ['key']);

    logger.log(`Seeded rank frames: ${RANK_FRAMES.length}`);
    logger.log(`Seeded starter avatars: ${STARTER_AVATARS.length}`);
    logger.log('Reference data seeding completed successfully.');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void seedReferenceData().catch((error) => {
    logger.error(
      'Reference data seeding failed.',
      error instanceof Error ? error.stack : String(error),
    );
    process.exitCode = 1;
  });
}
