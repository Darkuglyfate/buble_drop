#!/usr/bin/env node
/**
 * Production entry: serializes TypeORM migrations, then starts Nest.
 */
'use strict';

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const root = path.join(__dirname, '..');
const MIGRATION_LOCK_ID = 724915321;
const MIGRATION_LOCK_TIMEOUT_MS = 5 * 60 * 1000;
const MIGRATION_LOCK_POLL_MS = 1000;

function sleep(timeoutMs) {
  return new Promise((resolve) => setTimeout(resolve, timeoutMs));
}

function assertProductionEnvironment() {
  if (process.env.NODE_ENV !== 'production') {
    throw new Error(
      'start:prod requires NODE_ENV="production" so database security fails closed',
    );
  }
}

function resolveRuntimePaths() {
  const dataSourcePath = path.join(
    root,
    'dist',
    'database',
    'typeorm.datasource.js',
  );
  const postgresOptionsPath = path.join(
    root,
    'dist',
    'database',
    'postgres-options.js',
  );
  const cliPath = path.join(root, 'node_modules', 'typeorm', 'cli.js');

  for (const requiredPath of [dataSourcePath, postgresOptionsPath, cliPath]) {
    if (!fs.existsSync(requiredPath)) {
      throw new Error(
        `[BubbleDrop] Missing production runtime file: ${path.relative(root, requiredPath)}. Run npm run build first.`,
      );
    }
  }

  return { dataSourcePath, postgresOptionsPath, cliPath };
}

function createMigrationClient(postgresOptionsPath) {
  const { buildPostgresConnectionOptions } = require(postgresOptionsPath);
  const options = buildPostgresConnectionOptions(process.env);
  const clientConfig = options.url
    ? { connectionString: options.url }
    : {
        host: options.host,
        port: options.port,
        user: options.username,
        password: options.password,
        database: options.database,
      };

  return new Client({
    ...clientConfig,
    ssl: options.ssl,
    connectionTimeoutMillis: options.extra.connectionTimeoutMillis,
    query_timeout: options.extra.query_timeout,
    statement_timeout: options.extra.statement_timeout,
    idle_in_transaction_session_timeout:
      options.extra.idle_in_transaction_session_timeout,
    keepAlive: options.extra.keepAlive,
  });
}

async function waitForMigrationLock(
  client,
  timeoutMs = MIGRATION_LOCK_TIMEOUT_MS,
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const result = await client.query(
      'SELECT pg_try_advisory_lock($1) AS acquired',
      [MIGRATION_LOCK_ID],
    );
    if (result.rows[0]?.acquired === true) {
      return;
    }
    await sleep(MIGRATION_LOCK_POLL_MS);
  }

  throw new Error('Timed out waiting for the production migration lock');
}

async function releaseMigrationLock(client) {
  await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_ID]);
}

function runMigrations({ cliPath, dataSourcePath }) {
  console.log('[BubbleDrop] Running database migrations…');
  const result = spawnSync(
    process.execPath,
    [cliPath, 'migration:run', '-d', dataSourcePath],
    {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
    },
  );
  if (result.error) {
    throw new Error(
      `[BubbleDrop] Migration spawn error: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `[BubbleDrop] Migrations failed with exit ${result.status ?? 1}`,
    );
  }
  console.log('[BubbleDrop] Migrations OK.');
}

async function main() {
  assertProductionEnvironment();
  const runtimePaths = resolveRuntimePaths();
  const client = createMigrationClient(runtimePaths.postgresOptionsPath);
  let lockAcquired = false;

  await client.connect();
  try {
    await waitForMigrationLock(client);
    lockAcquired = true;
    runMigrations(runtimePaths);
  } finally {
    if (lockAcquired) {
      await releaseMigrationLock(client);
    }
    await client.end();
  }

  require(path.join(root, 'dist', 'main.js'));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Production startup failed',
    );
    process.exitCode = 1;
  });
}

module.exports = {
  MIGRATION_LOCK_ID,
  assertProductionEnvironment,
  releaseMigrationLock,
  waitForMigrationLock,
};
