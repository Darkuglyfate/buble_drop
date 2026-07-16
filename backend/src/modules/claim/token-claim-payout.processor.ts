import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClaimService } from './claim.service';

@Injectable()
export class TokenClaimPayoutProcessor
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(TokenClaimPayoutProcessor.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly claimService: ClaimService,
  ) {}

  onModuleInit(): void {
    if (this.configService.get<string>('NODE_ENV') === 'test') {
      return;
    }
    const intervalMs = this.readIntervalMs();
    void this.runOnce();
    this.timer = setInterval(() => void this.runOnce(), intervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async runOnce(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.claimService.processPreparedPayouts();
    } catch (error) {
      this.logger.error(
        `Prepared payout dispatcher failed: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    } finally {
      this.running = false;
    }
  }

  private readIntervalMs(): number {
    const configuredValue = this.configService.get<string | number>(
      'PAYOUT_RECONCILIATION_INTERVAL_MS',
    );
    if (
      configuredValue === undefined ||
      configuredValue === null ||
      String(configuredValue).trim() === ''
    ) {
      return 15_000;
    }
    const intervalMs = Number(configuredValue);
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 1_000) {
      throw new Error(
        'PAYOUT_RECONCILIATION_INTERVAL_MS must be an integer of at least 1000',
      );
    }
    return intervalMs;
  }
}
