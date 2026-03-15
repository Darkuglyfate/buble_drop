import 'reflect-metadata';
import { existsSync } from 'fs';
import { config as loadEnv } from 'dotenv';
import { DataSource } from 'typeorm';
import { join } from 'path';

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
  type: 'postgres',
  host: process.env.DB_HOST ?? 'localhost',
  port: Number(process.env.DB_PORT ?? 5432),
  username: process.env.DB_USER ?? 'postgres',
  password: process.env.DB_PASSWORD ?? 'postgres',
  database: process.env.DB_NAME ?? 'bubbledrop',
  entities: [
    join(__dirname, '..', 'modules', '**', 'entities', '*.entity{.ts,.js}'),
  ],
  migrations: [join(__dirname, 'migrations', '*{.ts,.js}')],
  synchronize: false,
});
