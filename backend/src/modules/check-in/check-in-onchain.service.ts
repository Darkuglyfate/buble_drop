import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  http,
  isAddress,
  parseAbi,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import {
  GaslessRelayService,
  GaslessRelayStatus,
} from '../onchain-relay/gasless-relay.service';

const DAY_IN_SECONDS = 24 * 60 * 60;

const dailyCheckInStreakAbi = parseAbi([
  'function checkIn(address wallet, uint32 dayKey) returns (uint32)',
]);

export interface RecordOnchainCheckInInput {
  walletAddress: string;
  checkInDate: string;
}

export interface RecordOnchainCheckInResult {
  txHash: string | null;
  submitted: boolean;
  relay: GaslessRelayStatus;
}

@Injectable()
export class CheckInOnchainService {
  private readonly logger = new Logger(CheckInOnchainService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly gaslessRelayService: GaslessRelayService,
  ) {}

  getRelayStatus(): GaslessRelayStatus {
    return this.gaslessRelayService.getStatus('daily_check_in');
  }

  async recordDailyCheckIn(
    input: RecordOnchainCheckInInput,
  ): Promise<RecordOnchainCheckInResult> {
    const relayStatus = this.getRelayStatus();
    if (!relayStatus.available) {
      return {
        txHash: null,
        submitted: false,
        relay: relayStatus,
      };
    }

    const walletAddress = this.normalizeAddress(input.walletAddress, 'wallet');
    const contractAddress = this.normalizeAddress(
      this.getRequiredEnv('ONCHAIN_STREAK_CONTRACT_ADDRESS'),
      'ONCHAIN_STREAK_CONTRACT_ADDRESS',
    );
    const rpcUrl = this.getRequiredEnv('BASE_RPC_URL');
    const signer = this.getSignerAccount();
    this.assertConfiguredSignerAddressMatches(signer.address);
    const dayKey = this.toUtcDayKey(input.checkInDate);

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
        abi: dailyCheckInStreakAbi,
        functionName: 'checkIn',
        args: [walletAddress, dayKey],
      });
      const txHash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status !== 'success') {
        throw new Error(`streak check-in transaction failed: ${txHash}`);
      }

      return {
        txHash,
        submitted: true,
        relay: relayStatus,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Onchain daily check-in failed for wallet=${walletAddress} day=${dayKey}. ${detail}`,
      );
      throw new ServiceUnavailableException(
        'Daily check-in onchain recording failed',
      );
    }
  }

  private getRequiredEnv(key: string): string {
    const value = this.configService.get<string>(key)?.trim();
    if (!value) {
      throw new ServiceUnavailableException(`${key} is not configured`);
    }
    return value;
  }

  private getSignerAccount() {
    const rawPrivateKey =
      this.configService.get<string>('ONCHAIN_STREAK_SIGNER_PRIVATE_KEY')?.trim() ||
      this.configService.get<string>('ONCHAIN_STREAK_PRIVATE_KEY')?.trim();
    if (!rawPrivateKey) {
      throw new ServiceUnavailableException(
        'ONCHAIN_STREAK_SIGNER_PRIVATE_KEY or ONCHAIN_STREAK_PRIVATE_KEY is not configured',
      );
    }
    const privateKey = rawPrivateKey.startsWith('0x')
      ? rawPrivateKey
      : `0x${rawPrivateKey}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      throw new ServiceUnavailableException(
        'ONCHAIN_STREAK_SIGNER_PRIVATE_KEY must be a 32-byte hex value',
      );
    }
    return privateKeyToAccount(privateKey as Hex);
  }

  private assertConfiguredSignerAddressMatches(derivedAddress: Address): void {
    const configuredAddress = this.configService
      .get<string>('ONCHAIN_STREAK_SIGNER_ADDRESS')
      ?.trim();
    if (!configuredAddress) {
      return;
    }

    const normalizedConfiguredAddress = this.normalizeAddress(
      configuredAddress,
      'ONCHAIN_STREAK_SIGNER_ADDRESS',
    );
    if (normalizedConfiguredAddress.toLowerCase() !== derivedAddress.toLowerCase()) {
      throw new ServiceUnavailableException(
        `ONCHAIN_STREAK_SIGNER_ADDRESS ${normalizedConfiguredAddress} does not match signer ${derivedAddress}`,
      );
    }
  }

  private normalizeAddress(value: string, label: string): Address {
    if (!isAddress(value)) {
      throw new ServiceUnavailableException(`${label} is not a valid address`);
    }
    return value;
  }

  private toUtcDayKey(checkInDate: string): number {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkInDate)) {
      throw new ServiceUnavailableException('Invalid check-in date format');
    }
    const utcMidnightMs = Date.parse(`${checkInDate}T00:00:00.000Z`);
    if (!Number.isFinite(utcMidnightMs)) {
      throw new ServiceUnavailableException('Invalid check-in date');
    }
    return Math.floor(utcMidnightMs / 1000 / DAY_IN_SECONDS);
  }
}
