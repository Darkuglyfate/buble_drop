import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { RareRewardEntitlementService } from './rare-reward-entitlement.service';

export const RARE_REWARD_ENTITLEMENT_PROCESS_INTERVAL_MS = 60 * 1000;

@Injectable()
export class RareRewardEntitlementProcessor
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(RareRewardEntitlementProcessor.name);
  private interval: NodeJS.Timeout | undefined;
  private isProcessing = false;

  constructor(
    private readonly entitlementService: RareRewardEntitlementService,
  ) {}

  onApplicationBootstrap(): void {
    void this.processBatch();
    this.interval = setInterval(() => {
      void this.processBatch();
    }, RARE_REWARD_ENTITLEMENT_PROCESS_INTERVAL_MS);
    this.interval.unref();
  }

  onModuleDestroy(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = undefined;
    }
  }

  private async processBatch(): Promise<void> {
    if (this.isProcessing) {
      return;
    }

    this.isProcessing = true;
    try {
      await this.entitlementService.processPendingEntitlements();
    } catch (error) {
      this.logger.error(
        'Rare reward entitlement batch failed',
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.isProcessing = false;
    }
  }
}
