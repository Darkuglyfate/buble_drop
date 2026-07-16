jest.mock('viem', () => {
  const actual = jest.requireActual('viem');
  return {
    ...actual,
    createPublicClient: jest.fn(),
    decodeEventLog: jest.fn(),
  };
});

import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { CheckInReceiptVerifier } from './check-in-receipt-verifier.service';

const mockedViem = jest.requireMock('viem');
const mockGetTransactionReceipt = jest.fn();
const mockGetBlockNumber = jest.fn();
const mockGetBlock = jest.fn();
const mockGetChainId = jest.fn();
const mockDecodeEventLog = mockedViem.decodeEventLog;

describe('CheckInReceiptVerifier', () => {
  let service: CheckInReceiptVerifier;

  beforeEach(async () => {
    mockGetTransactionReceipt.mockReset();
    mockGetBlockNumber.mockReset();
    mockGetBlock.mockReset();
    mockGetChainId.mockReset();
    mockDecodeEventLog.mockReset();
    mockGetChainId.mockResolvedValue(8453);
    mockedViem.createPublicClient.mockReturnValue({
      getTransactionReceipt: mockGetTransactionReceipt,
      getBlockNumber: mockGetBlockNumber,
      getBlock: mockGetBlock,
      getChainId: mockGetChainId,
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CheckInReceiptVerifier,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const values: Record<string, string> = {
                BASE_RPC_URL: 'https://base.example',
                ONCHAIN_STREAK_CONTRACT_ADDRESS:
                  '0x2222222222222222222222222222222222222222',
                CHECK_IN_MIN_CONFIRMATIONS: '2',
              };
              return values[key];
            }),
          },
        },
      ],
    }).compile();

    service = module.get<CheckInReceiptVerifier>(CheckInReceiptVerifier);
  });

  it('rejects a reverted receipt', async () => {
    mockGetTransactionReceipt.mockResolvedValue({
      status: 'reverted',
      blockNumber: 100n,
      logs: [],
    });

    await expect(
      service.verify({
        walletAddress: '0x1111111111111111111111111111111111111111',
        checkInDate: '2026-03-14',
        txHash:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('returns persisted identity metadata for a confirmed matching event', async () => {
    mockGetTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 100n,
      blockHash:
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      logs: [
        {
          address: '0x2222222222222222222222222222222222222222',
          data: '0x',
          topics: [],
          logIndex: 7,
        },
      ],
    });
    mockGetBlockNumber.mockResolvedValue(101n);
    mockGetBlock.mockResolvedValue({
      hash: '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    });
    mockDecodeEventLog.mockReturnValue({
      eventName: 'DailyCheckInRecorded',
      args: {
        wallet: '0x1111111111111111111111111111111111111111',
        dayKey: Math.floor(Date.parse('2026-03-14T00:00:00.000Z') / 86_400_000),
      },
    });

    await expect(
      service.verify({
        walletAddress: '0x1111111111111111111111111111111111111111',
        checkInDate: '2026-03-14',
        txHash:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    ).resolves.toEqual({
      chainId: 8453,
      txLogIndex: 7,
      blockNumber: '100',
      blockHash:
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      confirmedAt: expect.any(Date),
    });
    expect(mockGetBlock).toHaveBeenCalledWith({ blockNumber: 100n });
  });

  it('rejects a stored event whose canonical block hash changed', async () => {
    mockGetTransactionReceipt.mockResolvedValue({
      status: 'success',
      blockNumber: 100n,
      blockHash:
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      logs: [
        {
          address: '0x2222222222222222222222222222222222222222',
          data: '0x',
          topics: [],
          logIndex: 7,
        },
      ],
    });
    mockGetBlockNumber.mockResolvedValue(101n);
    mockGetBlock.mockResolvedValue({
      hash: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    });
    mockDecodeEventLog.mockReturnValue({
      eventName: 'DailyCheckInRecorded',
      args: {
        wallet: '0x1111111111111111111111111111111111111111',
        dayKey: Math.floor(Date.parse('2026-03-14T00:00:00.000Z') / 86_400_000),
      },
    });

    await expect(
      (
        service as unknown as {
          isCanonical(input: Record<string, unknown>): Promise<boolean>;
        }
      ).isCanonical({
        walletAddress: '0x1111111111111111111111111111111111111111',
        checkInDate: '2026-03-14',
        txHash:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        chainId: 8453,
        txLogIndex: 7,
        blockNumber: '100',
        blockHash:
          '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      }),
    ).resolves.toBe(false);
  });
});
