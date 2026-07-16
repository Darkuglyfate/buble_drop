import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  Hex,
  createPublicClient,
  decodeEventLog,
  http,
  isAddress,
  parseAbi,
} from 'viem';
import { base } from 'viem/chains';

const DAY_IN_SECONDS = 24 * 60 * 60;
const dailyCheckInEventAbi = parseAbi([
  'event DailyCheckInRecorded(address indexed wallet, uint32 indexed dayKey, uint32 newStreak)',
]);

export interface CheckInReceiptVerificationInput {
  walletAddress: string;
  checkInDate: string;
  txHash: string;
}

export interface CheckInReceiptVerification {
  chainId: number;
  txLogIndex: number;
  blockNumber: string;
  blockHash: string;
  confirmedAt: Date;
}

export interface CanonicalCheckInReceiptInput extends CheckInReceiptVerificationInput {
  chainId: number;
  txLogIndex: number;
  blockNumber: string;
  blockHash: string;
}

@Injectable()
export class CheckInReceiptVerifier {
  constructor(private readonly configService: ConfigService) {}

  async verify(
    input: CheckInReceiptVerificationInput,
  ): Promise<CheckInReceiptVerification> {
    const walletAddress = this.normalizeAddress(input.walletAddress, 'wallet');
    const contractAddress = this.normalizeAddress(
      this.getRequiredConfig('ONCHAIN_STREAK_CONTRACT_ADDRESS'),
      'ONCHAIN_STREAK_CONTRACT_ADDRESS',
    );
    const txHash = this.normalizeTxHash(input.txHash);
    const dayKey = this.toUtcDayKey(input.checkInDate);
    const publicClient = createPublicClient({
      chain: base,
      transport: http(this.getRequiredConfig('BASE_RPC_URL')),
    });

    let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>>;
    try {
      const chainId = await publicClient.getChainId();
      if (chainId !== base.id) {
        throw new Error('Configured RPC is not Base');
      }
      receipt = await publicClient.getTransactionReceipt({ hash: txHash });
    } catch {
      throw new BadRequestException(
        'Daily check-in transaction is not verified',
      );
    }

    if (receipt.status !== 'success') {
      throw new BadRequestException(
        'Daily check-in transaction is not verified',
      );
    }

    const latestBlockNumber = await publicClient.getBlockNumber();
    const confirmations = latestBlockNumber - receipt.blockNumber + 1n;
    if (confirmations < BigInt(this.getMinConfirmations())) {
      throw new BadRequestException(
        'Daily check-in transaction is awaiting Base confirmations',
      );
    }

    let canonicalBlockHash: string;
    try {
      const block = await publicClient.getBlock({
        blockNumber: receipt.blockNumber,
      });
      canonicalBlockHash = block.hash;
    } catch {
      throw new BadRequestException(
        'Daily check-in transaction is not verified',
      );
    }
    if (canonicalBlockHash.toLowerCase() !== receipt.blockHash.toLowerCase()) {
      throw new BadRequestException(
        'Daily check-in transaction is not verified',
      );
    }

    const matchingEvent = receipt.logs.find((log) => {
      if (log.address.toLowerCase() !== contractAddress.toLowerCase()) {
        return false;
      }

      try {
        const decoded = decodeEventLog({
          abi: dailyCheckInEventAbi,
          data: log.data,
          topics: log.topics,
        });
        const eventWallet = decoded.args.wallet;
        const eventDayKey = decoded.args.dayKey;
        return (
          decoded.eventName === 'DailyCheckInRecorded' &&
          typeof eventWallet === 'string' &&
          eventWallet.toLowerCase() === walletAddress.toLowerCase() &&
          eventDayKey === Number(dayKey)
        );
      } catch {
        return false;
      }
    });

    if (!matchingEvent || typeof matchingEvent.logIndex !== 'number') {
      throw new BadRequestException(
        'Daily check-in transaction is not verified',
      );
    }

    return {
      chainId: base.id,
      txLogIndex: matchingEvent.logIndex,
      blockNumber: receipt.blockNumber.toString(),
      blockHash: receipt.blockHash,
      confirmedAt: new Date(),
    };
  }

  async isCanonical(input: CanonicalCheckInReceiptInput): Promise<boolean> {
    if (input.chainId !== base.id) {
      return false;
    }

    try {
      const currentReceipt = await this.verify(input);
      return (
        currentReceipt.txLogIndex === input.txLogIndex &&
        currentReceipt.blockNumber === input.blockNumber &&
        currentReceipt.blockHash.toLowerCase() === input.blockHash.toLowerCase()
      );
    } catch {
      return false;
    }
  }

  private getRequiredConfig(key: string): string {
    const value = this.configService.get<string>(key)?.trim();
    if (!value) {
      throw new BadRequestException(`${key} is not configured`);
    }
    return value;
  }

  private getMinConfirmations(): number {
    const value = this.configService
      .get<string>('CHECK_IN_MIN_CONFIRMATIONS')
      ?.trim();
    if (!value) {
      return 2;
    }
    if (!/^\d+$/.test(value) || Number(value) < 1) {
      throw new BadRequestException(
        'CHECK_IN_MIN_CONFIRMATIONS must be a positive integer',
      );
    }
    return Number(value);
  }

  private normalizeAddress(value: string, label: string): Address {
    if (!isAddress(value)) {
      throw new BadRequestException(`${label} is not a valid address`);
    }
    return value;
  }

  private normalizeTxHash(value: string): Hex {
    const normalized = value.trim();
    if (!/^0x[a-fA-F0-9]{64}$/.test(normalized)) {
      throw new BadRequestException(
        'Daily check-in transaction is not verified',
      );
    }
    return normalized as Hex;
  }

  private toUtcDayKey(checkInDate: string): bigint {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(checkInDate)) {
      throw new BadRequestException('Invalid check-in date format');
    }
    const timestamp = Date.parse(`${checkInDate}T00:00:00.000Z`);
    if (!Number.isFinite(timestamp)) {
      throw new BadRequestException('Invalid check-in date format');
    }
    return BigInt(Math.floor(timestamp / 1_000 / DAY_IN_SECONDS));
  }
}
