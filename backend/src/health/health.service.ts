import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { RedisService } from '../redis/redis.service';

type DependencyName = 'postgres' | 'redis' | 'base';
type DependencyStatus = 'ok' | 'error';

const BASE_MAINNET_CHAIN_ID = 8453;
const DEFAULT_READINESS_TIMEOUT_MS = 3000;

@Injectable()
export class HealthService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {}

  getLiveness(): { status: 'ok' } {
    return { status: 'ok' };
  }

  async getReadiness(): Promise<{
    status: 'ready';
    checks: Record<DependencyName, DependencyStatus>;
    chainId: number;
  }> {
    const timeoutMs = this.getTimeoutMs();
    const results = await Promise.allSettled([
      this.withTimeout(
        Promise.resolve().then(() => this.dataSource.query('SELECT 1')),
        timeoutMs,
      ),
      this.withTimeout(
        Promise.resolve().then(() => this.redisService.getClient().ping()),
        timeoutMs,
      ),
      this.withTimeout(
        Promise.resolve().then(() => this.getBaseChainId()),
        timeoutMs,
      ),
    ]);
    const checks: Record<DependencyName, DependencyStatus> = {
      postgres: results[0].status === 'fulfilled' ? 'ok' : 'error',
      redis:
        results[1].status === 'fulfilled' && results[1].value === 'PONG'
          ? 'ok'
          : 'error',
      base:
        results[2].status === 'fulfilled' &&
        results[2].value === BASE_MAINNET_CHAIN_ID
          ? 'ok'
          : 'error',
    };

    if (Object.values(checks).includes('error')) {
      throw new ServiceUnavailableException({ status: 'not_ready', checks });
    }

    return {
      status: 'ready',
      checks,
      chainId: BASE_MAINNET_CHAIN_ID,
    };
  }

  private async getBaseChainId(): Promise<number> {
    const rpcUrl = this.configService.get<string>('BASE_RPC_URL')?.trim();
    if (!rpcUrl) {
      throw new Error('BASE_RPC_URL is required for readiness');
    }

    return createPublicClient({
      chain: base,
      transport: http(rpcUrl),
    }).getChainId();
  }

  private getTimeoutMs(): number {
    const configured = Number(
      this.configService.get<string>('READINESS_TIMEOUT_MS') ??
        DEFAULT_READINESS_TIMEOUT_MS,
    );
    return Number.isInteger(configured) &&
      configured >= 100 &&
      configured <= 10_000
      ? configured
      : DEFAULT_READINESS_TIMEOUT_MS;
  }

  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
  ): Promise<T> {
    let timeoutId: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<never>((_, reject) => {
          timeoutId = setTimeout(
            () => reject(new Error('Readiness dependency timed out')),
            timeoutMs,
          );
        }),
      ]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
