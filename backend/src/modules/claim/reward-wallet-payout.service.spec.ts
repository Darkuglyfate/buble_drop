import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { createPublicClient, createWalletClient, http, isAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TokenClaimStatus } from './entities/token-claim.entity';
import { RewardWalletPayoutService } from './reward-wallet-payout.service';

jest.mock('viem', () => ({
  createPublicClient: jest.fn(),
  createWalletClient: jest.fn(),
  erc20Abi: [],
  http: jest.fn(),
  isAddress: jest.fn(),
}));

jest.mock('viem/accounts', () => ({
  privateKeyToAccount: jest.fn(),
}));

describe('RewardWalletPayoutService', () => {
  let service: RewardWalletPayoutService;
  let configService: { get: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest.fn(),
    };

    (createPublicClient as jest.Mock).mockReset();
    (createWalletClient as jest.Mock).mockReset();
    (http as jest.Mock).mockReset();
    (isAddress as jest.Mock).mockReset();
    (privateKeyToAccount as jest.Mock).mockReset();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardWalletPayoutService,
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    service = module.get<RewardWalletPayoutService>(RewardWalletPayoutService);
  });

  it('returns failed when reward wallet private key is missing', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'REWARD_WALLET_PRIVATE_KEY') {
        return '';
      }
      return undefined;
    });

    const result = await service.processPendingPayout({
      claimId: 'claim-1',
      profileId: 'profile-1',
      recipientWalletAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'BUBL',
      tokenContractAddress: '0x2222222222222222222222222222222222222222',
      amount: '100',
    });

    expect(result).toEqual({
      status: TokenClaimStatus.FAILED,
      txHash: null,
    });
    expect(createPublicClient).not.toHaveBeenCalled();
    expect(createWalletClient).not.toHaveBeenCalled();
  });

  it('submits ERC20 transfer and returns confirmed tx hash', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        REWARD_WALLET_PRIVATE_KEY:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        REWARD_WALLET_ADDRESS: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
        BASE_RPC_URL: 'https://base.example/rpc',
      };
      return values[key];
    });
    (privateKeyToAccount as jest.Mock).mockReturnValue({
      address: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
    });
    (isAddress as jest.Mock).mockReturnValue(true);
    (http as jest.Mock).mockReturnValue({ type: 'http' });
    (createPublicClient as jest.Mock).mockReturnValue({
      simulateContract: jest.fn().mockResolvedValue({
        request: { to: '0x2222222222222222222222222222222222222222' },
      }),
      waitForTransactionReceipt: jest.fn().mockResolvedValue({
        status: 'success',
      }),
    });
    (createWalletClient as jest.Mock).mockReturnValue({
      writeContract: jest
        .fn()
        .mockResolvedValue(
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ),
    });

    const result = await service.processPendingPayout({
      claimId: 'claim-2',
      profileId: 'profile-1',
      recipientWalletAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'BUBL',
      tokenContractAddress: '0x2222222222222222222222222222222222222222',
      amount: '100',
    });

    expect(result).toEqual({
      status: TokenClaimStatus.CONFIRMED,
      txHash:
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    });
    expect(createPublicClient).toHaveBeenCalled();
    expect(createWalletClient).toHaveBeenCalled();
  });
});
