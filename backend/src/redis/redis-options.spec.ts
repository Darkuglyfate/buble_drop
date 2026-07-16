import type { ConfigService } from '@nestjs/config';
import { resolveRedisConnection } from './redis-options';

function createConfig(values: Record<string, string>): ConfigService {
  return {
    get: <T>(key: string, defaultValue?: T): T | undefined =>
      (values[key] as T | undefined) ?? defaultValue,
  } as ConfigService;
}

describe('resolveRedisConnection', () => {
  it('prefers a Render-style REDIS_URL connection string', () => {
    expect(
      resolveRedisConnection(
        createConfig({
          REDIS_URL: 'rediss://default:secret@example.upstash.io:6379',
          REDIS_HOST: 'localhost',
        }),
      ),
    ).toEqual({
      url: 'rediss://default:secret@example.upstash.io:6379',
      options: {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      },
    });
  });

  it('supports explicit host settings with opt-in TLS', () => {
    expect(
      resolveRedisConnection(
        createConfig({
          REDIS_HOST: 'cache.internal',
          REDIS_PORT: '6380',
          REDIS_PASSWORD: 'secret',
          REDIS_DB: '2',
          REDIS_TLS: 'true',
        }),
      ),
    ).toEqual({
      options: {
        host: 'cache.internal',
        port: 6380,
        password: 'secret',
        db: 2,
        tls: {},
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      },
    });
  });
});
