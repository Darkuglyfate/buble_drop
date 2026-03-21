import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  isAddress,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import {
  GaslessRelayService,
  GaslessRelayStatus,
} from '../onchain-relay/gasless-relay.service';
import { TokenClaimStatus } from './entities/token-claim.entity';

export interface PendingRewardWalletPayout {
  claimId: string;
  profileId: string;
  recipientWalletAddress: string;
  tokenSymbol: string;
  tokenContractAddress: string;
  amount: string;
}

export interface PendingRewardWalletPayoutResult {
  status: TokenClaimStatus.CONFIRMED | TokenClaimStatus.FAILED;
  txHash: string | null;
  relay: GaslessRelayStatus;
}

@Injectable()
export class RewardWalletPayoutService {
  private readonly logger = new Logger(RewardWalletPayoutService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly gaslessRelayService: GaslessRelayService,
  ) {}

  async processPendingPayout(
    payload: PendingRewardWalletPayout,
  ): Promise<PendingRewardWalletPayoutResult> {
    const relayStatus = this.gaslessRelayService.getStatus('claim');
    if (!relayStatus.available) {
      this.logger.error(
        `Payout relay unavailable claim=${payload.claimId}: ${relayStatus.reason}`,
      );
      return {
        status: TokenClaimStatus.FAILED,
        txHash: null,
        relay: relayStatus,
      };
    }

    try {
      const account = this.getRewardWalletAccount();
      if (!account) {
        return {
          status: TokenClaimStatus.FAILED,
          txHash: null,
          relay: relayStatus,
        };
      }

      const rpcUrl = this.configService.get<string>('BASE_RPC_URL');
      if (!rpcUrl || !rpcUrl.trim()) {
        this.logger.error(
          `Payout failed claim=${payload.claimId}: BASE_RPC_URL is not configured`,
        );
        return {
          status: TokenClaimStatus.FAILED,
          txHash: null,
          relay: relayStatus,
        };
      }

      const recipientWalletAddress = this.normalizeAddress(
        payload.recipientWalletAddress,
      );
      if (!recipientWalletAddress) {
        this.logger.error(
          `Payout failed claim=${payload.claimId}: recipient wallet address is invalid`,
        );
        return {
          status: TokenClaimStatus.FAILED,
          txHash: null,
          relay: relayStatus,
        };
      }

      const tokenContractAddress = this.normalizeAddress(
        payload.tokenContractAddress,
      );
      if (!tokenContractAddress) {
        this.logger.error(
          `Payout failed claim=${payload.claimId}: token contract address is invalid for symbol=${payload.tokenSymbol}`,
        );
        return {
          status: TokenClaimStatus.FAILED,
          txHash: null,
          relay: relayStatus,
        };
      }

      const amount = this.parseAmount(payload.amount);
      if (amount <= 0n) {
        this.logger.error(
          `Payout failed claim=${payload.claimId}: payout amount must be positive`,
        );
        return {
          status: TokenClaimStatus.FAILED,
          txHash: null,
          relay: relayStatus,
        };
      }

      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });
      const walletClient = createWalletClient({
        account,
        chain: base,
        transport: http(rpcUrl),
      });

      const { request } = await publicClient.simulateContract({
        account,
        address: tokenContractAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientWalletAddress, amount],
      });
      const txHash = await walletClient.writeContract(request);
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: txHash,
      });

      if (receipt.status !== 'success') {
        this.logger.error(
          `Payout failed claim=${payload.claimId} token=${payload.tokenSymbol} amount=${payload.amount} rewardWallet=${account.address} recipient=${recipientWalletAddress} txHash=${txHash}`,
        );
        return {
          status: TokenClaimStatus.FAILED,
          txHash: null,
          relay: relayStatus,
        };
      }

      this.logger.log(
        `Payout confirmed claim=${payload.claimId} token=${payload.tokenSymbol} amount=${payload.amount} rewardWallet=${account.address} recipient=${recipientWalletAddress} txHash=${txHash}`,
      );

      return {
        status: TokenClaimStatus.CONFIRMED,
        txHash,
        relay: relayStatus,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error';
      this.logger.error(
        `Payout failed claim=${payload.claimId} token=${payload.tokenSymbol} amount=${payload.amount}: ${message}`,
      );
      return {
        status: TokenClaimStatus.FAILED,
        txHash: null,
        relay: relayStatus,
      };
    }
  }

  private getRewardWalletAccount() {
    const rewardWalletPrivateKey = this.configService.get<string>(
      'REWARD_WALLET_PRIVATE_KEY',
    );
    if (!rewardWalletPrivateKey || !rewardWalletPrivateKey.trim()) {
      this.logger.error(
        'Payout failed: REWARD_WALLET_PRIVATE_KEY is not configured',
      );
      return null;
    }

    const normalizedPrivateKey = rewardWalletPrivateKey.trim();
    const privateKey = normalizedPrivateKey.startsWith('0x')
      ? normalizedPrivateKey
      : `0x${normalizedPrivateKey}`;
    if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
      this.logger.error(
        'Payout failed: REWARD_WALLET_PRIVATE_KEY must be a 32-byte hex value',
      );
      return null;
    }

    const account = privateKeyToAccount(privateKey as Hex);
    const configuredRewardWalletAddress = this.configService.get<string>(
      'REWARD_WALLET_ADDRESS',
    );
    if (configuredRewardWalletAddress?.trim()) {
      const normalizedConfiguredRewardWalletAddress = this.normalizeAddress(
        configuredRewardWalletAddress,
      );
      if (!normalizedConfiguredRewardWalletAddress) {
        this.logger.error('Payout failed: REWARD_WALLET_ADDRESS is invalid');
        return null;
      }
      if (
        normalizedConfiguredRewardWalletAddress.toLowerCase() !==
        account.address.toLowerCase()
      ) {
        this.logger.error(
          `Payout failed: configured reward wallet address ${normalizedConfiguredRewardWalletAddress} does not match derived signer ${account.address}`,
        );
        return null;
      }
    }

    return account;
  }

  private normalizeAddress(value: string): Address | null {
    const normalizedValue = value.trim();
    if (!isAddress(normalizedValue)) {
      return null;
    }
    return normalizedValue;
  }

  private parseAmount(value: string): bigint {
    const normalized = value.trim();
    if (!/^\d+$/.test(normalized)) {
      throw new Error('Payout amount must be an integer string');
    }
    return BigInt(normalized);
  }
}
