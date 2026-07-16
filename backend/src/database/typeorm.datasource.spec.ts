import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { globSync } from 'glob';
import { PlatformTools } from 'typeorm/platform/PlatformTools';
import dataSource from './typeorm.datasource';

describe('TypeORM datasource migration discovery', () => {
  it('includes migration TypeScript and JavaScript files but excludes specs', async () => {
    const tempDirectory = await mkdtemp(
      join(tmpdir(), 'bubbledrop-migrations-'),
    );

    try {
      const fileNames = [
        '1742000000000-RealMigration.ts',
        '1742000000001-RealMigration.js',
        '1742000000002-RealMigration.spec.ts',
        '1742000000003-RealMigration.spec.js',
      ];

      await Promise.all(
        fileNames.map((fileName) =>
          writeFile(join(tempDirectory, fileName), '', 'utf8'),
        ),
      );

      const configuredPattern = (dataSource.options.migrations as string[])[0];
      const discoveredFiles = globSync(
        PlatformTools.pathNormalize(
          join(tempDirectory, basename(configuredPattern)),
        ),
      )
        .map((filePath) => basename(filePath))
        .sort();

      expect(discoveredFiles).toEqual([
        '1742000000000-RealMigration.ts',
        '1742000000001-RealMigration.js',
      ]);
    } finally {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });
});
