import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  keccak256,
  parseAbi,
  stringToHex,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import {
  GaslessRelayService,
  GaslessRelayStatus,
} from './gasless-relay.service';

const rewardLedgerAbi = parseAbi([
  'function recordClaimSettlement(bytes32 claimIdHash, address wallet, address tokenContract, bytes32 tokenSymbolHash, uint256 amount, bytes32 payoutTxHash)',
  'function grantOwnership(address wallet, bytes32 rewardKeyHash, uint8 rewardType, bytes32 sourceIdHash)',
  'function getOwnershipStates(address wallet, bytes32[] rewardKeyHashes) view returns (bool[] ownedStates)',
]);

export type RewardOwnershipType = 'frame' | 'badge' | 'cosmetic' | 'nft';

export interface RecordClaimSettlementInput {
  claimId: string;
  walletAddress: string;
  tokenContractAddress: string;
  tokenSymbol: string;
  amount: string;
  payoutTxHash: string;
}

export interface RecordClaimSettlementResult {
  txHash: string | null;
  submitted: boolean;
  relay: GaslessRelayStatus;
  claimIdHash: string;
}

export interface GrantRewardOwnershipInput {
  walletAddress: string;
  rewardKey: string;
  rewardType: RewardOwnershipType;
  sourceId: string;
}

export interface GrantRewardOwnershipResult {
  txHash: string | null;
  submitted: boolean;
  relay: GaslessRelayStatus;
  rewardKeyHash: string;
}

@Injectable()
export class RewardLedgerOnchainService {
  private readonly logger = new Logger(RewardLedgerOnchainService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly gaslessRelayService: GaslessRelayService,
  ) {}

  getClaimRelayStatus(): GaslessRelayStatus {
    return this.gaslessRelayService.getStatus('claim');
  }

  getOwnershipRelayStatus(): GaslessRelayStatus {
    return this.gaslessRelayService.getStatus('ownership');
  }

  async recordClaimSettlement(
    input: RecordClaimSettlementInput,
  ): Promise<RecordClaimSettlementResult> {
    const relay = this.getClaimRelayStatus();
    const claimIdHash = this.hashText(input.claimId);
    if (!relay.available) {
      return {
        txHash: null,
        submitted: false,
        relay,
        claimIdHash,
      };
    }

    const walletAddress = this.normalizeAddress(input.walletAddress, 'wallet');
    const tokenContractAddress = this.normalizeAddress(
      input.tokenContractAddress,
      'tokenContract',
    );
    const contractAddress = this.getContractAddress();
    const signer = this.getWriterAccount();
    const rpcUrl = this.getRequiredEnv('BASE_RPC_URL');
    const tokenSymbolHash = this.hashText(input.tokenSymbol);
    const payoutTxHash = this.normalizeBytes32TxHash(input.payoutTxHash);
    const amount = this.parseAmount(input.amount);

    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });
      const walletClient = createWalletClient({
        account: signer,
        chain: base,
        transport: http(rpcUrl),
      });

      const { request } = await publicClient.simulateContract({
        account: signer,
        address: contractAddress,
        abi: rewardLedgerAbi,
        functionName: 'recordClaimSettlement',
        args: [
          claimIdHash as Hex,
          walletAddress,
          tokenContractAddress,
          tokenSymbolHash as Hex,
          amount,
          payoutTxHash,
        ],
      });
      const txHash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      if (receipt.status !== 'success') {
        throw new Error(`claim settlement record failed: ${txHash}`);
      }

      return {
        txHash,
        submitted: true,
        relay,
        claimIdHash,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Reward ledger claim settlement failed for claim=${input.claimId}. ${detail}`,
      );
      return {
        txHash: null,
        submitted: false,
        relay: {
          ...relay,
          available: false,
          reason: 'reward ledger claim settlement failed',
        },
        claimIdHash,
      };
    }
  }

  async grantOwnership(
    input: GrantRewardOwnershipInput,
  ): Promise<GrantRewardOwnershipResult> {
    const relay = this.getOwnershipRelayStatus();
    const rewardKeyHash = this.hashText(input.rewardKey);
    if (!relay.available) {
      return {
        txHash: null,
        submitted: false,
        relay,
        rewardKeyHash,
      };
    }

    const contractAddress = this.getContractAddress();
    const signer = this.getWriterAccount();
    const rpcUrl = this.getRequiredEnv('BASE_RPC_URL');
    const walletAddress = this.normalizeAddress(input.walletAddress, 'wallet');
    const sourceIdHash = this.hashText(input.sourceId);
    const rewardType = this.mapRewardType(input.rewardType);

    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });
      const walletClient = createWalletClient({
        account: signer,
        chain: base,
        transport: http(rpcUrl),
      });
      const { request } = await publicClient.simulateContract({
        account: signer,
        address: contractAddress,
        abi: rewardLedgerAbi,
        functionName: 'grantOwnership',
        args: [
          walletAddress,
          rewardKeyHash as Hex,
          rewardType,
          sourceIdHash as Hex,
        ],
      });
      const txHash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      if (receipt.status !== 'success') {
        throw new Error(`ownership grant failed: ${txHash}`);
      }

      return {
        txHash,
        submitted: true,
        relay,
        rewardKeyHash,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Reward ownership grant failed for rewardKey=${input.rewardKey}. ${detail}`,
      );
      return {
        txHash: null,
        submitted: false,
        relay: {
          ...relay,
          available: false,
          reason: 'reward ledger ownership grant failed',
        },
        rewardKeyHash,
      };
    }
  }

  async getOwnershipStates(
    walletAddress: string,
    rewardKeys: string[],
  ): Promise<Record<string, boolean>> {
    const normalizedWallet = this.normalizeOptionalAddress(walletAddress);
    const contractAddress = this.getReadableContractAddress();
    const rpcUrl = this.configService.get<string>('BASE_RPC_URL')?.trim();
    if (!normalizedWallet || !contractAddress || !rpcUrl || rewardKeys.length === 0) {
      return Object.fromEntries(rewardKeys.map((rewardKey) => [rewardKey, false]));
    }

    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });
      const rewardKeyHashes = rewardKeys.map((rewardKey) =>
        this.hashText(rewardKey),
      );
      const ownedStates = (await publicClient.readContract({
        address: contractAddress,
        abi: rewardLedgerAbi,
        functionName: 'getOwnershipStates',
        args: [normalizedWallet, rewardKeyHashes as Hex[]],
      })) as boolean[];

      return Object.fromEntries(
        rewardKeys.map((rewardKey, index) => [rewardKey, Boolean(ownedStates[index])]),
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Reward ownership read failed. ${detail}`);
      return Object.fromEntries(rewardKeys.map((rewardKey) => [rewardKey, false]));
    }
  }

  private getReadableContractAddress(): Address | null {
    const raw = this.configService.get<string>('REWARD_LEDGER_CONTRACT_ADDRESS')?.trim();
    return raw && isAddress(raw) ? raw : null;
  }

  private getContractAddress(): Address {
    const raw = this.getRequiredEnv('REWARD_LEDGER_CONTRACT_ADDRESS');
    return this.normalizeAddress(raw, 'REWARD_LEDGER_CONTRACT_ADDRESS');
  }

  private getWriterAccount() {
    const rawPrivateKey = this.getRequiredEnv('REWARD_LEDGER_WRITER_PRIVATE_KEY');
    const privateKey = rawPrivateKey.startsWith('0x')
      ? rawPrivateKey
      : `0x${rawPrivateKey}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error('REWARD_LEDGER_WRITER_PRIVATE_KEY must be a 32-byte hex value');
    }
    const account = privateKeyToAccount(privateKey as Hex);
    const configuredWriterAddress = this.configService
      .get<string>('REWARD_LEDGER_WRITER_ADDRESS')
      ?.trim();
    if (configuredWriterAddress) {
      const normalizedWriter = this.normalizeAddress(
        configuredWriterAddress,
        'REWARD_LEDGER_WRITER_ADDRESS',
      );
      if (normalizedWriter.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error(
          `REWARD_LEDGER_WRITER_ADDRESS ${normalizedWriter} does not match signer ${account.address}`,
        );
      }
    }
    return account;
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key)?.trim();
    if (!value) {
      throw new Error(`${key} is not configured`);
    }
    return value;
  }

  private normalizeAddress(value: string, label: string): Address {
    if (!isAddress(value)) {
      throw new Error(`${label} is not a valid address`);
    }
    return value;
  }

  private normalizeOptionalAddress(value: string): Address | null {
    const trimmed = value.trim();
    return isAddress(trimmed) ? trimmed : null;
  }

  private normalizeBytes32TxHash(value: string): Hex {
    const normalized = value.trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(normalized)) {
      throw new Error('payout tx hash must be a 32-byte hex value');
    }
    return normalized as Hex;
  }

  private parseAmount(value: string): bigint {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
      throw new Error('amount must be a non-negative integer string');
    }
    return BigInt(normalized);
  }

  private hashText(value: string): string {
    return keccak256(stringToHex(value.trim()));
  }

  private mapRewardType(rewardType: RewardOwnershipType): number {
    if (rewardType === 'frame') {
      return 0;
    }
    if (rewardType === 'badge') {
      return 1;
    }
    if (rewardType === 'cosmetic') {
      return 2;
    }
    return 3;
  }
}
