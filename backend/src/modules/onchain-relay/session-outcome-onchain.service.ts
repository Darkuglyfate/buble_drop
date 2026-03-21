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

const sessionOutcomeRegistryAbi = parseAbi([
  'function recordOutcome(bytes32 sessionIdHash, address wallet, uint32 xpGained, uint32 finalScore, uint16 bestCombo, uint16 activeSeconds, uint16 durationSeconds, uint32 rewardFlags, bytes32 integrityHash)',
  'function getLatestOutcome(address wallet) view returns (bool exists, bytes32 sessionIdHash, uint32 xpGained, uint32 finalScore, uint16 bestCombo, uint16 activeSeconds, uint16 durationSeconds, uint32 rewardFlags, bytes32 integrityHash, uint64 recordedAt)',
]);

export interface RecordSessionOutcomeInput {
  sessionId: string;
  walletAddress: string;
  xpGained: number;
  finalScore: number;
  bestCombo: number;
  activeSeconds: number;
  sessionDurationSeconds: number;
  rewardFlags: number;
  integrityHash: string;
}

export interface RecordSessionOutcomeResult {
  txHash: string | null;
  submitted: boolean;
  relay: GaslessRelayStatus;
  sessionIdHash: string;
  committedAt: string | null;
}

export interface LatestSessionOutcomeView {
  sessionIdHash: string;
  xpGained: number;
  finalScore: number;
  bestCombo: number;
  activeSeconds: number;
  sessionDurationSeconds: number;
  rewardFlags: number;
  integrityHash: string;
  recordedAt: string;
}

@Injectable()
export class SessionOutcomeOnchainService {
  private readonly logger = new Logger(SessionOutcomeOnchainService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly gaslessRelayService: GaslessRelayService,
  ) {}

  getRelayStatus(): GaslessRelayStatus {
    return this.gaslessRelayService.getStatus('session_outcome');
  }

  getSessionIdHash(sessionId: string): string {
    return this.hashText(sessionId);
  }

  async recordOutcome(
    input: RecordSessionOutcomeInput,
  ): Promise<RecordSessionOutcomeResult> {
    const relay = this.getRelayStatus();
    const sessionIdHash = this.getSessionIdHash(input.sessionId);
    if (!relay.available) {
      return {
        txHash: null,
        submitted: false,
        relay,
        sessionIdHash,
        committedAt: null,
      };
    }

    const contractAddress = this.getContractAddress();
    const signer = this.getWriterAccount();
    const rpcUrl = this.getRequiredEnv('BASE_RPC_URL');
    const walletAddress = this.normalizeAddress(input.walletAddress, 'wallet');
    const integrityHash = this.normalizeBytes32(input.integrityHash, 'integrityHash');

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
        abi: sessionOutcomeRegistryAbi,
        functionName: 'recordOutcome',
        args: [
          sessionIdHash as Hex,
          walletAddress,
          input.xpGained,
          input.finalScore,
          input.bestCombo,
          input.activeSeconds,
          input.sessionDurationSeconds,
          input.rewardFlags,
          integrityHash,
        ],
      });
      const txHash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });
      if (receipt.status !== 'success') {
        throw new Error(`session outcome write failed: ${txHash}`);
      }

      return {
        txHash,
        submitted: true,
        relay,
        sessionIdHash,
        committedAt: new Date().toISOString(),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Session outcome onchain commit failed for session=${input.sessionId}. ${detail}`,
      );
      return {
        txHash: null,
        submitted: false,
        relay: {
          ...relay,
          available: false,
          reason: 'session outcome onchain commit failed',
        },
        sessionIdHash,
        committedAt: null,
      };
    }
  }

  async getLatestOutcome(walletAddress: string): Promise<LatestSessionOutcomeView | null> {
    const normalizedWallet = this.normalizeOptionalAddress(walletAddress);
    const contractAddress = this.getReadableContractAddress();
    const rpcUrl = this.configService.get<string>('BASE_RPC_URL')?.trim();
    if (!normalizedWallet || !contractAddress || !rpcUrl) {
      return null;
    }

    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });
      const result = (await publicClient.readContract({
        address: contractAddress,
        abi: sessionOutcomeRegistryAbi,
        functionName: 'getLatestOutcome',
        args: [normalizedWallet],
      })) as [
        boolean,
        Hex,
        number,
        number,
        number,
        number,
        number,
        number,
        Hex,
        bigint,
      ];

      if (!result[0]) {
        return null;
      }

      return {
        sessionIdHash: result[1],
        xpGained: Number(result[2]),
        finalScore: Number(result[3]),
        bestCombo: Number(result[4]),
        activeSeconds: Number(result[5]),
        sessionDurationSeconds: Number(result[6]),
        rewardFlags: Number(result[7]),
        integrityHash: result[8],
        recordedAt: new Date(Number(result[9]) * 1000).toISOString(),
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      this.logger.warn(`Session outcome read failed. ${detail}`);
      return null;
    }
  }

  private getReadableContractAddress(): Address | null {
    const raw = this.configService
      .get<string>('SESSION_OUTCOME_CONTRACT_ADDRESS')
      ?.trim();
    return raw && isAddress(raw) ? raw : null;
  }

  private getContractAddress(): Address {
    const raw = this.getRequiredEnv('SESSION_OUTCOME_CONTRACT_ADDRESS');
    return this.normalizeAddress(raw, 'SESSION_OUTCOME_CONTRACT_ADDRESS');
  }

  private getWriterAccount() {
    const rawPrivateKey = this.getRequiredEnv('SESSION_OUTCOME_SIGNER_PRIVATE_KEY');
    const privateKey = rawPrivateKey.startsWith('0x')
      ? rawPrivateKey
      : `0x${rawPrivateKey}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new Error('SESSION_OUTCOME_SIGNER_PRIVATE_KEY must be a 32-byte hex value');
    }
    const account = privateKeyToAccount(privateKey as Hex);
    const configuredWriterAddress = this.configService
      .get<string>('SESSION_OUTCOME_SIGNER_ADDRESS')
      ?.trim();
    if (configuredWriterAddress) {
      const normalizedWriter = this.normalizeAddress(
        configuredWriterAddress,
        'SESSION_OUTCOME_SIGNER_ADDRESS',
      );
      if (normalizedWriter.toLowerCase() !== account.address.toLowerCase()) {
        throw new Error(
          `SESSION_OUTCOME_SIGNER_ADDRESS ${normalizedWriter} does not match signer ${account.address}`,
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

  private normalizeBytes32(value: string, label: string): Hex {
    const normalized = value.trim().toLowerCase();
    if (!/^0x[a-f0-9]{64}$/.test(normalized)) {
      throw new Error(`${label} must be a 32-byte hex value`);
    }
    return normalized as Hex;
  }

  private hashText(value: string): string {
    return keccak256(stringToHex(value.trim()));
  }
}
