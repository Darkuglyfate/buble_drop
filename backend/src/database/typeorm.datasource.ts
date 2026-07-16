import 'reflect-metadata';
import { existsSync } from 'fs';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { join } from 'path';
import { buildPostgresConnectionOptions } from './postgres-options';

const workspaceRoot = process.cwd();
const envLocalPath = join(workspaceRoot, '.env.local');
const envPath = join(workspaceRoot, '.env');

if (existsSync(envLocalPath)) {
  loadEnv({ path: envLocalPath });
}

if (existsSync(envPath)) {
  loadEnv({ path: envPath, override: false });
}

export default new DataSource({
  ...buildPostgresConnectionOptions(process.env),
  entities: [
    join(__dirname, '..', 'modules', '**', 'entities', '*.entity{.ts,.js}'),
  ],
  migrations: [join(__dirname, 'migrations', '!(*.spec){.ts,.js}')],
  synchronize: false,
});
