import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { GaslessRelayService } from '../onchain-relay/gasless-relay.service';
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  isAddress,
  keccak256,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { TokenClaimStatus } from './entities/token-claim.entity';
import { RewardWalletPayoutService } from './reward-wallet-payout.service';

jest.mock('viem', () => ({
  createPublicClient: jest.fn(),
  createWalletClient: jest.fn(),
  encodeFunctionData: jest.fn(),
  erc20Abi: [],
  http: jest.fn(),
  isAddress: jest.fn(),
  keccak256: jest.fn(),
}));

jest.mock('viem/accounts', () => ({
  privateKeyToAccount: jest.fn(),
}));

const mockCreatePublicClient = createPublicClient as jest.Mock;
const mockCreateWalletClient = createWalletClient as jest.Mock;
const mockEncodeFunctionData = encodeFunctionData as jest.Mock;
const mockHttp = http as jest.Mock;
const mockIsAddress = isAddress as unknown as jest.Mock;
const mockKeccak256 = keccak256 as jest.Mock;
const mockPrivateKeyToAccount = privateKeyToAccount as jest.Mock;

describe('RewardWalletPayoutService', () => {
  let service: RewardWalletPayoutService;
  let configService: { get: jest.Mock };
  let gaslessRelayService: { getStatus: jest.Mock };
  let payoutManagerQuery: jest.Mock;
  let claimUpdate: jest.Mock;
  let claimFindOne: jest.Mock;
  let dataSource: { transaction: jest.Mock; getRepository: jest.Mock };

  beforeEach(async () => {
    configService = {
      get: jest.fn(),
    };
    gaslessRelayService = {
      getStatus: jest.fn(),
    };
    payoutManagerQuery = jest
      .fn()
      .mockImplementation((query: string) =>
        Promise.resolve(
          query.includes('MAX("payoutNonce")') ? [{ maxNonce: null }] : [],
        ),
      );
    claimUpdate = jest.fn().mockResolvedValue({ affected: 1 });
    claimFindOne = jest.fn().mockResolvedValue(null);
    const claimRepository = { update: claimUpdate, findOne: claimFindOne };
    dataSource = {
      transaction: jest
        .fn()
        .mockImplementation((runner: (manager: unknown) => unknown) =>
          runner({
            query: payoutManagerQuery,
            getRepository: () => claimRepository,
          }),
        ),
      getRepository: jest.fn().mockReturnValue(claimRepository),
    };

    mockCreatePublicClient.mockReset();
    mockCreateWalletClient.mockReset();
    mockEncodeFunctionData.mockReset();
    mockHttp.mockReset();
    mockIsAddress.mockReset();
    mockKeccak256.mockReset();
    mockPrivateKeyToAccount.mockReset();
    mockEncodeFunctionData.mockReturnValue('0xdeadbeef');

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardWalletPayoutService,
        { provide: ConfigService, useValue: configService },
        { provide: GaslessRelayService, useValue: gaslessRelayService },
        { provide: DataSource, useValue: dataSource },
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
    gaslessRelayService.getStatus.mockReturnValue({
      action: 'claim',
      relayKind: 'backend-sponsored',
      available: false,
      userPaysGas: false,
      reason: 'missing REWARD_WALLET_PRIVATE_KEY',
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
      relay: {
        action: 'claim',
        relayKind: 'backend-sponsored',
        available: false,
        userPaysGas: false,
        reason: 'missing REWARD_WALLET_PRIVATE_KEY',
      },
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
        REWARD_PAYOUT_MIN_CONFIRMATIONS: '3',
      };
      return values[key];
    });
    gaslessRelayService.getStatus.mockReturnValue({
      action: 'claim',
      relayKind: 'backend-sponsored',
      available: true,
      userPaysGas: false,
      reason: null,
    });
    mockPrivateKeyToAccount.mockReturnValue({
      address: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
    });
    mockIsAddress.mockReturnValue(true);
    mockHttp.mockReturnValue({ type: 'http' });
    const waitForTransactionReceipt = jest.fn().mockResolvedValue({
      status: 'success',
    });
    mockCreatePublicClient.mockReturnValue({
      getTransactionCount: jest.fn().mockResolvedValue(7),
      simulateContract: jest.fn().mockResolvedValue({
        result: true,
        request: { to: '0x2222222222222222222222222222222222222222' },
      }),
      waitForTransactionReceipt,
    });
    const prepareTransactionRequest = jest.fn().mockResolvedValue({
      to: '0x2222222222222222222222222222222222222222',
      nonce: 7,
    });
    mockCreateWalletClient.mockReturnValue({
      prepareTransactionRequest,
      signTransaction: jest.fn().mockResolvedValue('0xsigned'),
      sendRawTransaction: jest
        .fn()
        .mockResolvedValue(
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ),
    });
    mockKeccak256.mockReturnValue(
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );

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
      relay: {
        action: 'claim',
        relayKind: 'backend-sponsored',
        available: true,
        userPaysGas: false,
        reason: null,
      },
    });
    expect(createPublicClient).toHaveBeenCalled();
    expect(createWalletClient).toHaveBeenCalled();
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({
      hash: '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      confirmations: 3,
    });
    expect(payoutManagerQuery).toHaveBeenCalledWith(
      'SELECT pg_advisory_xact_lock($1)',
      [174245001],
    );
    expect(prepareTransactionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 7 }),
    );
    expect(claimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'claim-2',
        profileId: 'profile-1',
        status: TokenClaimStatus.PENDING,
      }),
      expect.objectContaining({
        status: TokenClaimStatus.UNKNOWN,
        payoutNonce: '7',
        serializedPayoutTransaction: '0xsigned',
        txHash:
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      }),
    );
  });

  it('returns unknown with the broadcast hash when receipt polling times out', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        REWARD_WALLET_PRIVATE_KEY:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        REWARD_WALLET_ADDRESS: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
        BASE_RPC_URL: 'https://base.example/rpc',
      };
      return values[key];
    });
    gaslessRelayService.getStatus.mockReturnValue({
      action: 'claim',
      relayKind: 'backend-sponsored',
      available: true,
      userPaysGas: false,
      reason: null,
    });
    mockPrivateKeyToAccount.mockReturnValue({
      address: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
    });
    mockIsAddress.mockReturnValue(true);
    mockHttp.mockReturnValue({ type: 'http' });
    mockCreatePublicClient.mockReturnValue({
      getTransactionCount: jest.fn().mockResolvedValue(8),
      simulateContract: jest.fn().mockResolvedValue({
        result: true,
        request: { to: '0x2222222222222222222222222222222222222222' },
      }),
      waitForTransactionReceipt: jest
        .fn()
        .mockRejectedValue(new Error('receipt polling timed out')),
    });
    mockCreateWalletClient.mockReturnValue({
      prepareTransactionRequest: jest.fn().mockResolvedValue({
        to: '0x2222222222222222222222222222222222222222',
        nonce: 8,
      }),
      signTransaction: jest.fn().mockResolvedValue('0xsigned'),
      sendRawTransaction: jest
        .fn()
        .mockResolvedValue(
          '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        ),
    });
    mockKeccak256.mockReturnValue(
      '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    );

    const result = await service.processPendingPayout({
      claimId: 'claim-3',
      profileId: 'profile-1',
      recipientWalletAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'BUBL',
      tokenContractAddress: '0x2222222222222222222222222222222222222222',
      amount: '100',
    });

    expect(result).toEqual({
      status: TokenClaimStatus.UNKNOWN,
      txHash:
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      relay: {
        action: 'claim',
        relayKind: 'backend-sponsored',
        available: true,
        userPaysGas: false,
        reason: null,
      },
    });
  });

  it('returns unknown with a deterministic hash when raw broadcast is ambiguous', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        REWARD_WALLET_PRIVATE_KEY:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        REWARD_WALLET_ADDRESS: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
        BASE_RPC_URL: 'https://base.example/rpc',
      };
      return values[key];
    });
    gaslessRelayService.getStatus.mockReturnValue({
      action: 'claim',
      relayKind: 'backend-sponsored',
      available: true,
      userPaysGas: false,
      reason: null,
    });
    mockPrivateKeyToAccount.mockReturnValue({
      address: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
    });
    mockIsAddress.mockReturnValue(true);
    mockHttp.mockReturnValue({ type: 'http' });
    mockCreatePublicClient.mockReturnValue({
      getTransactionCount: jest.fn().mockResolvedValue(7),
      simulateContract: jest.fn().mockResolvedValue({
        result: true,
        request: { to: '0x2222222222222222222222222222222222222222' },
      }),
    });
    payoutManagerQuery.mockImplementation((query: string) =>
      Promise.resolve(
        query.includes('MAX("payoutNonce")') ? [{ maxNonce: '8' }] : [],
      ),
    );
    const prepareTransactionRequest = jest.fn().mockResolvedValue({
      to: '0x2222222222222222222222222222222222222222',
      nonce: 9,
    });
    const sendRawTransaction = jest.fn().mockImplementation(() => {
      expect(claimUpdate).toHaveBeenCalled();
      return Promise.reject(new Error('request transport timed out'));
    });
    mockCreateWalletClient.mockReturnValue({
      prepareTransactionRequest,
      signTransaction: jest.fn().mockResolvedValue('0xsigned'),
      sendRawTransaction,
    });
    mockKeccak256.mockReturnValue(
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    );

    const result = await service.processPendingPayout({
      claimId: 'claim-4',
      profileId: 'profile-1',
      recipientWalletAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'BUBL',
      tokenContractAddress: '0x2222222222222222222222222222222222222222',
      amount: '100',
    });

    expect(result).toMatchObject({
      status: TokenClaimStatus.UNKNOWN,
      txHash:
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    });
    expect(prepareTransactionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ nonce: 9 }),
    );
    expect(claimUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'claim-4',
        profileId: 'profile-1',
        status: TokenClaimStatus.PENDING,
      }),
      expect.objectContaining({
        payoutNonce: '9',
        serializedPayoutTransaction: '0xsigned',
      }),
    );
  });

  it('recovers a durably prepared payout after an uncertain database commit', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        REWARD_WALLET_PRIVATE_KEY:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        REWARD_WALLET_ADDRESS: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
        BASE_RPC_URL: 'https://base.example/rpc',
      };
      return values[key];
    });
    gaslessRelayService.getStatus.mockReturnValue({
      action: 'claim',
      relayKind: 'backend-sponsored',
      available: true,
      userPaysGas: false,
      reason: null,
    });
    mockPrivateKeyToAccount.mockReturnValue({
      address: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
    });
    mockIsAddress.mockReturnValue(true);
    mockHttp.mockReturnValue({ type: 'http' });
    mockCreatePublicClient.mockReturnValue({
      simulateContract: jest.fn().mockResolvedValue({ result: true }),
    });
    mockCreateWalletClient.mockReturnValue({
      sendRawTransaction: jest
        .fn()
        .mockResolvedValue(
          '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        ),
    });
    dataSource.transaction.mockRejectedValue(
      new Error('connection lost during commit acknowledgement'),
    );
    claimFindOne.mockResolvedValue({
      id: 'claim-5',
      profileId: 'profile-1',
      txHash:
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
      payoutNonce: '12',
      serializedPayoutTransaction: '0xprepared',
    });
    mockKeccak256.mockReturnValue(
      '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    );

    const result = await service.broadcastPayout({
      claimId: 'claim-5',
      profileId: 'profile-1',
      recipientWalletAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'BUBL',
      tokenContractAddress: '0x2222222222222222222222222222222222222222',
      amount: '100',
    });

    expect(result).toMatchObject({
      status: TokenClaimStatus.PENDING,
      txHash:
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    });
  });

  it('keeps a rejected raw transaction recoverable until receipt status is known', async () => {
    configService.get.mockImplementation((key: string) => {
      const values: Record<string, string> = {
        REWARD_WALLET_PRIVATE_KEY:
          '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        REWARD_WALLET_ADDRESS: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
        BASE_RPC_URL: 'https://base.example/rpc',
      };
      return values[key];
    });
    gaslessRelayService.getStatus.mockReturnValue({
      action: 'claim',
      relayKind: 'backend-sponsored',
      available: true,
      userPaysGas: false,
      reason: null,
    });
    mockPrivateKeyToAccount.mockReturnValue({
      address: '0xaAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa',
    });
    mockIsAddress.mockReturnValue(true);
    mockHttp.mockReturnValue({ type: 'http' });
    mockCreatePublicClient.mockReturnValue({
      getTransactionCount: jest.fn().mockResolvedValue(14),
      simulateContract: jest.fn().mockResolvedValue({ result: true }),
    });
    mockCreateWalletClient.mockReturnValue({
      prepareTransactionRequest: jest.fn().mockResolvedValue({ nonce: 14 }),
      signTransaction: jest.fn().mockResolvedValue('0xrejected'),
      sendRawTransaction: jest
        .fn()
        .mockRejectedValue(new Error('invalid sender')),
    });
    mockKeccak256.mockReturnValue(
      '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
    );

    const result = await service.broadcastPayout({
      claimId: 'claim-7',
      profileId: 'profile-1',
      recipientWalletAddress: '0x1111111111111111111111111111111111111111',
      tokenSymbol: 'BUBL',
      tokenContractAddress: '0x2222222222222222222222222222222222222222',
      amount: '100',
    });

    expect(result).toMatchObject({
      status: TokenClaimStatus.UNKNOWN,
      txHash:
        '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
      payoutError: 'invalid sender',
    });
    expect(claimUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        id: 'claim-7',
        profileId: 'profile-1',
        status: TokenClaimStatus.PENDING,
      }),
      expect.objectContaining({
        status: TokenClaimStatus.UNKNOWN,
        txHash:
          '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff',
        payoutNonce: '14',
        serializedPayoutTransaction: '0xrejected',
      }),
    );
  });

  it('rebroadcasts the persisted raw transaction before resolving its receipt', async () => {
    configService.get.mockImplementation((key: string) =>
      key === 'BASE_RPC_URL' ? 'https://base.example/rpc' : undefined,
    );
    gaslessRelayService.getStatus.mockReturnValue({
      action: 'claim',
      relayKind: 'backend-sponsored',
      available: true,
      userPaysGas: false,
      reason: null,
    });
    claimFindOne.mockResolvedValue({
      id: 'claim-6',
      profileId: 'profile-1',
      txHash:
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      payoutNonce: '13',
      serializedPayoutTransaction: '0xprepared',
    });
    mockKeccak256.mockReturnValue(
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    );
    const sendRawTransaction = jest
      .fn()
      .mockResolvedValue(
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      );
    const waitForTransactionReceipt = jest.fn().mockResolvedValue({
      status: 'success',
    });
    mockCreatePublicClient.mockReturnValue({
      sendRawTransaction,
      waitForTransactionReceipt,
    });

    const result = await service.resolvePayoutReceipt({
      claimId: 'claim-6',
      txHash:
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    });

    expect(result.status).toBe(TokenClaimStatus.CONFIRMED);
    expect(sendRawTransaction).toHaveBeenCalledWith({
      serializedTransaction: '0xprepared',
    });
    expect(sendRawTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      waitForTransactionReceipt.mock.invocationCallOrder[0],
    );
  });
});
