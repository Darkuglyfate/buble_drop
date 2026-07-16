import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createPublicClient } from 'viem';
import { RedisService } from '../redis/redis.service';
import { HealthService } from './health.service';

jest.mock('viem', () => ({
  createPublicClient: jest.fn(),
  http: jest.fn((url: string) => ({ url })),
}));

const mockCreatePublicClient = createPublicClient as jest.Mock;

describe('HealthService', () => {
  const dataSource = { query: jest.fn() };
  const redisClient = { ping: jest.fn() };
  const redisService = { getClient: () => redisClient };
  const configService = {
    get: jest.fn((key: string) =>
      key === 'BASE_RPC_URL'
        ? 'https://base.example/rpc'
        : key === 'READINESS_TIMEOUT_MS'
          ? '100'
          : undefined,
    ),
  };
  const getChainId = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    dataSource.query.mockResolvedValue([{ ok: 1 }]);
    redisClient.ping.mockResolvedValue('PONG');
    getChainId.mockResolvedValue(8453);
    mockCreatePublicClient.mockReturnValue({ getChainId });
  });

  function createService() {
    return new HealthService(
      dataSource as unknown as DataSource,
      redisService as unknown as RedisService,
      configService as unknown as ConfigService,
    );
  }

  async function expectNotReady(failedCheck: 'postgres' | 'redis' | 'base') {
    try {
      await createService().getReadiness();
      throw new Error('Expected readiness to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const exception = error as ServiceUnavailableException;
      expect(exception.getStatus()).toBe(503);
      const response = exception.getResponse() as {
        status: string;
        checks: Record<'postgres' | 'redis' | 'base', string>;
      };
      expect(response.status).toBe('not_ready');
      expect(response.checks[failedCheck]).toBe('error');
    }
  }

  it('reports liveness without checking dependencies', () => {
    expect(createService().getLiveness()).toEqual({ status: 'ok' });
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(redisClient.ping).not.toHaveBeenCalled();
  });

  it('reports ready only when PostgreSQL, Redis, and Base are healthy', async () => {
    await expect(createService().getReadiness()).resolves.toEqual({
      status: 'ready',
      checks: { postgres: 'ok', redis: 'ok', base: 'ok' },
      chainId: 8453,
    });
  });

  it('returns 503 when PostgreSQL readiness fails', async () => {
    dataSource.query.mockRejectedValue(new Error('db down'));
    await expectNotReady('postgres');
  });

  it('returns 503 when a dependency throws synchronously', async () => {
    dataSource.query.mockImplementation(() => {
      throw new Error('sync db failure');
    });
    await expectNotReady('postgres');
  });

  it('returns 503 when Redis readiness fails', async () => {
    redisClient.ping.mockRejectedValue(new Error('redis down'));
    await expectNotReady('redis');
  });

  it('returns 503 when Base readiness is not chain 8453', async () => {
    getChainId.mockResolvedValue(1);
    await expectNotReady('base');
  });

  it('bounds dependency checks with the readiness timeout', async () => {
    dataSource.query.mockReturnValue(new Promise(() => undefined));

    await expectNotReady('postgres');
  });
});
