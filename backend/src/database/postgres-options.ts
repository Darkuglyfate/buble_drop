export type PostgresEnvironment = Record<string, unknown>;

export type SharedPostgresConnectionOptions = {
  type: 'postgres';
  url?: string;
  host?: string;
  port?: number;
  username?: string;
  password?: string;
  database?: string;
  ssl?: { rejectUnauthorized: boolean };
  extra: {
    connectionTimeoutMillis: number;
    query_timeout: number;
    statement_timeout: number;
    idle_in_transaction_session_timeout: number;
    keepAlive: boolean;
  };
};

const connectionStringTlsKeys = new Set([
  'ssl',
  'sslmode',
  'sslcert',
  'sslkey',
  'sslrootcert',
  'uselibpqcompat',
]);

function readString(
  environment: PostgresEnvironment,
  key: string,
): string | undefined {
  const value = environment[key];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (
    typeof value !== 'string' &&
    typeof value !== 'number' &&
    typeof value !== 'boolean'
  ) {
    throw new Error(`${key} must be a string, number, or boolean`);
  }

  const normalized = String(value).trim();
  return normalized || undefined;
}

function readBoolean(
  environment: PostgresEnvironment,
  key: string,
  fallback: boolean,
): boolean {
  const value = readString(environment, key)?.toLowerCase();
  if (value === undefined) {
    return fallback;
  }
  if (value === '1' || value === 'true') {
    return true;
  }
  if (value === '0' || value === 'false') {
    return false;
  }

  throw new Error(`${key} must be true, false, 1, or 0`);
}

function readPort(environment: PostgresEnvironment): number {
  const value = Number(readString(environment, 'DB_PORT') ?? '5432');
  if (!Number.isInteger(value) || value < 1 || value > 65535) {
    throw new Error('DB_PORT must be a valid TCP port');
  }
  return value;
}

function sanitizeDatabaseUrl(value: string): string {
  let databaseUrl: URL;
  try {
    databaseUrl = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL URL');
  }

  for (const key of [...databaseUrl.searchParams.keys()]) {
    if (connectionStringTlsKeys.has(key.toLowerCase())) {
      databaseUrl.searchParams.delete(key);
    }
  }

  return databaseUrl.toString();
}

export function buildPostgresConnectionOptions(
  environment: PostgresEnvironment,
): SharedPostgresConnectionOptions {
  const nodeEnvironment = readString(environment, 'NODE_ENV') ?? 'development';
  const rawDatabaseUrl = readString(environment, 'DATABASE_URL');
  const databaseUrl = rawDatabaseUrl
    ? sanitizeDatabaseUrl(rawDatabaseUrl)
    : undefined;
  const sslEnabled = readBoolean(
    environment,
    'DB_SSL',
    Boolean(databaseUrl) || nodeEnvironment === 'production',
  );
  const allowSelfSigned = readBoolean(
    environment,
    'DB_SSL_ALLOW_SELF_SIGNED',
    false,
  );

  if (nodeEnvironment === 'production' && !sslEnabled) {
    throw new Error('DB_SSL cannot be disabled in production');
  }
  if (allowSelfSigned && nodeEnvironment === 'production') {
    throw new Error('DB_SSL_ALLOW_SELF_SIGNED cannot be enabled in production');
  }

  return {
    type: 'postgres',
    ...(databaseUrl
      ? { url: databaseUrl }
      : {
          host: readString(environment, 'DB_HOST') ?? 'localhost',
          port: readPort(environment),
          username: readString(environment, 'DB_USER') ?? 'postgres',
          password: readString(environment, 'DB_PASSWORD') ?? 'postgres',
          database: readString(environment, 'DB_NAME') ?? 'bubbledrop',
        }),
    extra: {
      connectionTimeoutMillis: 5000,
      query_timeout: 5000,
      statement_timeout: 5000,
      idle_in_transaction_session_timeout: 5000,
      keepAlive: true,
    },
    ssl: sslEnabled ? { rejectUnauthorized: !allowSelfSigned } : undefined,
  };
}
