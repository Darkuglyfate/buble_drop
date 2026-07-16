import { createRequire } from 'node:module';
import { join } from 'node:path';
import { DataSource } from 'typeorm';
import { buildPostgresConnectionOptions } from './postgres-options';

const requireModule = createRequire(__filename);
const { MIGRATION_LOCK_ID } = requireModule(
  '../../scripts/start-production.cjs',
) as {
  MIGRATION_LOCK_ID: number;
};

const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim();
const describeWithDatabase = testDatabaseUrl ? describe : describe.skip;

describeWithDatabase('PostgreSQL migration idempotency', () => {
  jest.setTimeout(120_000);

  it('runs up twice, down once, and up again in a disposable database', async () => {
    const sourceUrl = new URL(testDatabaseUrl as string);
    const databaseName = `bubbledrop_migration_${Date.now()}_${Math.random()
      .toString(16)
      .slice(2)}`;
    const adminUrl = new URL(sourceUrl);
    adminUrl.pathname = '/postgres';
    const databaseUrl = new URL(sourceUrl);
    databaseUrl.pathname = `/${databaseName}`;

    const adminDataSource = new DataSource({
      type: 'postgres',
      url: adminUrl.toString(),
      ssl: false,
    });
    let migrationDataSource: DataSource | null = null;

    await adminDataSource.initialize();
    try {
      await adminDataSource.query(`CREATE DATABASE "${databaseName}"`);
      migrationDataSource = new DataSource({
        ...buildPostgresConnectionOptions({
          NODE_ENV: 'test',
          DATABASE_URL: databaseUrl.toString(),
          DB_SSL: 'false',
        }),
        migrations: [join(__dirname, 'migrations', '!(*.spec){.ts,.js}')],
        synchronize: false,
      });
      await migrationDataSource.initialize();

      const firstUp = await migrationDataSource.runMigrations();
      const secondUp = await migrationDataSource.runMigrations();
      await migrationDataSource.undoLastMigration();
      const upAfterDown = await migrationDataSource.runMigrations();

      expect(firstUp.length).toBeGreaterThan(0);
      expect(secondUp).toEqual([]);
      expect(upAfterDown).toHaveLength(1);
    } finally {
      if (migrationDataSource?.isInitialized) {
        await migrationDataSource.destroy();
      }
      await adminDataSource.query(
        'SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1',
        [databaseName],
      );
      await adminDataSource.query(`DROP DATABASE IF EXISTS "${databaseName}"`);
      await adminDataSource.destroy();
    }
  });

  it('serializes concurrent migration owners with the production advisory lock', async () => {
    const dataSource = new DataSource({
      ...buildPostgresConnectionOptions({
        NODE_ENV: 'test',
        DATABASE_URL: testDatabaseUrl,
        DB_SSL: 'false',
      }),
    });
    await dataSource.initialize();
    const firstRunner = dataSource.createQueryRunner();
    const secondRunner = dataSource.createQueryRunner();
    await firstRunner.connect();
    await secondRunner.connect();

    try {
      await firstRunner.query('SELECT pg_advisory_lock($1)', [
        MIGRATION_LOCK_ID,
      ]);
      const blockedAttempt = (await secondRunner.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [MIGRATION_LOCK_ID],
      )) as Array<{ acquired: boolean }>;
      expect(blockedAttempt[0]?.acquired).toBe(false);

      await firstRunner.query('SELECT pg_advisory_unlock($1)', [
        MIGRATION_LOCK_ID,
      ]);
      const acquiredAttempt = (await secondRunner.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [MIGRATION_LOCK_ID],
      )) as Array<{ acquired: boolean }>;
      expect(acquiredAttempt[0]?.acquired).toBe(true);
    } finally {
      await Promise.all([
        firstRunner.query('SELECT pg_advisory_unlock_all()'),
        secondRunner.query('SELECT pg_advisory_unlock_all()'),
      ]);
      await firstRunner.release();
      await secondRunner.release();
      await dataSource.destroy();
    }
  });
});
