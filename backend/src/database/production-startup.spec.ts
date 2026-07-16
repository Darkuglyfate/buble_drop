import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const requireModule = createRequire(__filename);
const { assertProductionEnvironment } = requireModule(
  '../../scripts/start-production.cjs',
) as {
  assertProductionEnvironment: () => void;
};

describe('production database startup ownership', () => {
  it('keeps the production wrapper as the only automatic migration owner', async () => {
    const backendRoot = join(__dirname, '..', '..');
    const [appModuleSource, dataSourceSource, wrapperSource] =
      await Promise.all([
        readFile(join(backendRoot, 'src', 'app.module.ts'), 'utf8'),
        readFile(
          join(backendRoot, 'src', 'database', 'typeorm.datasource.ts'),
          'utf8',
        ),
        readFile(join(backendRoot, 'scripts', 'start-production.cjs'), 'utf8'),
      ]);

    expect(appModuleSource).not.toContain('migrationsRun');
    expect(appModuleSource).not.toContain('migrations:');
    expect(appModuleSource).toContain('buildPostgresConnectionOptions');
    expect(dataSourceSource).toContain('buildPostgresConnectionOptions');
    expect(wrapperSource).toContain('migration:run');
    expect(wrapperSource).not.toContain('RUN_MIGRATIONS_ON_START');
    expect(wrapperSource).toContain('process.env.NODE_ENV');
    expect(wrapperSource).toContain("!== 'production'");
    expect(wrapperSource).toContain('pg_try_advisory_lock');
    expect(wrapperSource).toContain('pg_advisory_unlock');
    expect(wrapperSource).toContain("'dist', 'main.js'");
  });

  it('fails closed unless the production environment is explicit', () => {
    const originalNodeEnvironment = process.env.NODE_ENV;
    try {
      delete process.env.NODE_ENV;
      expect(assertProductionEnvironment).toThrow('NODE_ENV="production"');

      process.env.NODE_ENV = 'Production';
      expect(assertProductionEnvironment).toThrow('NODE_ENV="production"');

      process.env.NODE_ENV = 'production';
      expect(assertProductionEnvironment).not.toThrow();
    } finally {
      process.env.NODE_ENV = originalNodeEnvironment;
    }
  });
});
