import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { ClaimService } from './claim.service';
import { TokenClaimPayoutProcessor } from './token-claim-payout.processor';

describe('TokenClaimPayoutProcessor', () => {
  it('dispatches durable payout rows immediately and on the configured interval', async () => {
    jest.useFakeTimers();
    const claimService = {
      processPreparedPayouts: jest.fn().mockResolvedValue(0),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'NODE_ENV') return 'production';
        if (key === 'PAYOUT_RECONCILIATION_INTERVAL_MS') return '1000';
        return undefined;
      }),
    };
    const module = await Test.createTestingModule({
      providers: [
        TokenClaimPayoutProcessor,
        { provide: ClaimService, useValue: claimService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();
    const processor = module.get(TokenClaimPayoutProcessor);

    processor.onModuleInit();
    await Promise.resolve();
    expect(claimService.processPreparedPayouts).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(1000);
    expect(claimService.processPreparedPayouts).toHaveBeenCalledTimes(2);

    processor.onModuleDestroy();
    jest.useRealTimers();
  });

  it('does not start the dispatcher in tests', async () => {
    const claimService = {
      processPreparedPayouts: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        TokenClaimPayoutProcessor,
        { provide: ClaimService, useValue: claimService },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('test') },
        },
      ],
    }).compile();
    const processor = module.get(TokenClaimPayoutProcessor);

    processor.onModuleInit();

    expect(claimService.processPreparedPayouts).not.toHaveBeenCalled();
  });
});
