import { Logger } from '@nestjs/common';
import { RareRewardEntitlementService } from './rare-reward-entitlement.service';
import {
  RARE_REWARD_ENTITLEMENT_PROCESS_INTERVAL_MS,
  RareRewardEntitlementProcessor,
} from './rare-reward-entitlement.processor';

describe('RareRewardEntitlementProcessor', () => {
  let entitlementService: { processPendingEntitlements: jest.Mock };
  let processor: RareRewardEntitlementProcessor;

  beforeEach(() => {
    jest.useFakeTimers();
    entitlementService = {
      processPendingEntitlements: jest.fn().mockResolvedValue([]),
    };
    processor = new RareRewardEntitlementProcessor(
      entitlementService as unknown as RareRewardEntitlementService,
    );
  });

  afterEach(() => {
    processor.onModuleDestroy();
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('processes entitlements on bootstrap and periodically afterwards', async () => {
    processor.onApplicationBootstrap();

    expect(entitlementService.processPendingEntitlements).toHaveBeenCalledTimes(
      1,
    );

    await jest.advanceTimersByTimeAsync(
      RARE_REWARD_ENTITLEMENT_PROCESS_INTERVAL_MS,
    );

    expect(entitlementService.processPendingEntitlements).toHaveBeenCalledTimes(
      2,
    );
  });

  it('does not overlap entitlement batches', async () => {
    let resolveBatch: (() => void) | undefined;
    entitlementService.processPendingEntitlements.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          resolveBatch = resolve;
        }),
    );

    processor.onApplicationBootstrap();
    await jest.advanceTimersByTimeAsync(
      RARE_REWARD_ENTITLEMENT_PROCESS_INTERVAL_MS,
    );

    expect(entitlementService.processPendingEntitlements).toHaveBeenCalledTimes(
      1,
    );

    resolveBatch?.();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(
      RARE_REWARD_ENTITLEMENT_PROCESS_INTERVAL_MS,
    );

    expect(entitlementService.processPendingEntitlements).toHaveBeenCalledTimes(
      2,
    );
  });

  it('logs batch errors and continues processing later intervals', async () => {
    const error = new Error('database unavailable');
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    entitlementService.processPendingEntitlements
      .mockRejectedValueOnce(error)
      .mockResolvedValueOnce([]);

    processor.onApplicationBootstrap();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(
      RARE_REWARD_ENTITLEMENT_PROCESS_INTERVAL_MS,
    );

    expect(loggerError).toHaveBeenCalledWith(
      'Rare reward entitlement batch failed',
      error.stack,
    );
    expect(entitlementService.processPendingEntitlements).toHaveBeenCalledTimes(
      2,
    );
  });

  it('unrefs its interval and clears it on module destroy', () => {
    const unref = jest.fn();
    const interval = { unref } as unknown as NodeJS.Timeout;
    const setIntervalSpy = jest
      .spyOn(global, 'setInterval')
      .mockReturnValue(interval);
    const clearIntervalSpy = jest
      .spyOn(global, 'clearInterval')
      .mockImplementation(() => undefined);

    processor.onApplicationBootstrap();
    processor.onModuleDestroy();

    expect(setIntervalSpy).toHaveBeenCalledWith(
      expect.any(Function),
      RARE_REWARD_ENTITLEMENT_PROCESS_INTERVAL_MS,
    );
    expect(unref).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledWith(interval);
  });
});
