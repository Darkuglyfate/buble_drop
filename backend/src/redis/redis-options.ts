import type { ConfigService } from '@nestjs/config';
import type { RedisOptions } from 'ioredis';

export type RedisConnection = {
  url?: string;
  options: RedisOptions;
};

const sharedOptions: RedisOptions = {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
};

export function resolveRedisConnection(
  configService: ConfigService,
): RedisConnection {
  const url = configService.get<string>('REDIS_URL')?.trim();
  if (url) {
    return { url, options: { ...sharedOptions } };
  }

  const password = configService.get<string>('REDIS_PASSWORD');
  const tlsEnabled = parseBoolean(configService.get<string>('REDIS_TLS'));

  return {
    options: {
      host: configService.get<string>('REDIS_HOST', 'localhost'),
      port: parseInteger(
        configService.get<string>('REDIS_PORT'),
        6379,
        1,
        65_535,
      ),
      password: password || undefined,
      db: parseInteger(configService.get<string>('REDIS_DB'), 0, 0, 15),
      ...(tlsEnabled ? { tls: {} } : {}),
      ...sharedOptions,
    },
  };
}

function parseBoolean(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

function parseInteger(
  value: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= minimum && parsed <= maximum
    ? parsed
    : fallback;
}
