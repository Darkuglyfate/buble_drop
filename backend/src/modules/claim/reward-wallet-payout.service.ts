import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource, IsNull } from 'typeorm';
import {
  Address,
  Hex,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  erc20Abi,
  http,
  isAddress,
  keccak256,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { base } from 'viem/chains';
import {
  GaslessRelayService,
  GaslessRelayStatus,
} from '../onchain-relay/gasless-relay.service';
import { TokenClaim, TokenClaimStatus } from './entities/token-claim.entity';

export const REWARD_WALLET_BROADCAST_LOCK_ID = 174245001;

type PreparedPayoutTransaction = {
  txHash: Hex;
  serializedTransaction: Hex;
  nonce: number;
};

export interface PendingRewardWalletPayout {
  claimId: string;
  profileId: string;
  recipientWalletAddress: string;
  tokenSymbol: string;
  tokenContractAddress: string;
  amount: string;
}

export interface PendingRewardWalletPayoutResult {
  status:
    | TokenClaimStatus.CONFIRMED
    | TokenClaimStatus.FAILED
    | TokenClaimStatus.UNKNOWN;
  txHash: string | null;
  relay: GaslessRelayStatus;
}

export interface RewardWalletPayoutBroadcastResult {
  status:
    | TokenClaimStatus.PENDING
    | TokenClaimStatus.UNKNOWN
    | TokenClaimStatus.FAILED;
  txHash: string | null;
  payoutError: string | null;
  relay: GaslessRelayStatus;
}

export interface RewardWalletPayoutReceiptResult {
  status:
    | TokenClaimStatus.CONFIRMED
    | TokenClaimStatus.FAILED
    | TokenClaimStatus.UNKNOWN;
  txHash: string;
  payoutError: string | null;
  relay: GaslessRelayStatus;
}

export interface ResolveRewardWalletPayoutReceipt {
  claimId: string;
  txHash: string;
  relay?: GaslessRelayStatus;
}

@Injectable()
export class RewardWalletPayoutService {
  private readonly logger = new Logger(RewardWalletPayoutService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly gaslessRelayService: GaslessRelayService,
    private readonly dataSource: DataSource,
  ) {}

  async processPendingPayout(
    payload: PendingRewardWalletPayout,
  ): Promise<PendingRewardWalletPayoutResult> {
    const broadcastResult = await this.broadcastPayout(payload);
    if (broadcastResult.status === TokenClaimStatus.FAILED) {
      return {
        status: TokenClaimStatus.FAILED,
        txHash: null,
        relay: broadcastResult.relay,
      };
    }
    if (
      broadcastResult.status === TokenClaimStatus.UNKNOWN ||
      !broadcastResult.txHash
    ) {
      return {
        status: TokenClaimStatus.UNKNOWN,
        txHash: broadcastResult.txHash,
        relay: broadcastResult.relay,
      };
    }

    const receiptResult = await this.resolvePayoutReceipt({
      claimId: payload.claimId,
      txHash: broadcastResult.txHash,
      relay: broadcastResult.relay,
    });
    return {
      status: receiptResult.status,
      txHash: receiptResult.txHash,
      relay: receiptResult.relay,
    };
  }

  async broadcastPayout(
    payload: PendingRewardWalletPayout,
  ): Promise<RewardWalletPayoutBroadcastResult> {
    const relayStatus = this.gaslessRelayService.getStatus('claim');
    if (!relayStatus.available) {
      const payoutError = `Payout relay unavailable: ${relayStatus.reason}`;
      this.logger.error(`${payoutError} claim=${payload.claimId}`);
      return this.failedBroadcast(relayStatus, payoutError);
    }

    const account = this.getRewardWalletAccount();
    if (!account) {
      return this.failedBroadcast(
        relayStatus,
        'Reward payout wallet is unavailable',
      );
    }

    const rpcUrl = this.configService.get<string>('BASE_RPC_URL');
    if (!rpcUrl || !rpcUrl.trim()) {
      const payoutError = 'BASE_RPC_URL is not configured';
      this.logger.error(
        `Payout failed claim=${payload.claimId}: ${payoutError}`,
      );
      return this.failedBroadcast(relayStatus, payoutError);
    }

    const recipientWalletAddress = this.normalizeAddress(
      payload.recipientWalletAddress,
    );
    if (!recipientWalletAddress) {
      const payoutError = 'Recipient wallet address is invalid';
      this.logger.error(
        `Payout failed claim=${payload.claimId}: ${payoutError}`,
      );
      return this.failedBroadcast(relayStatus, payoutError);
    }

    const tokenContractAddress = this.normalizeAddress(
      payload.tokenContractAddress,
    );
    if (!tokenContractAddress) {
      const payoutError = `Token contract address is invalid for symbol=${payload.tokenSymbol}`;
      this.logger.error(
        `Payout failed claim=${payload.claimId}: ${payoutError}`,
      );
      return this.failedBroadcast(relayStatus, payoutError);
    }

    let amount: bigint;
    try {
      amount = this.parseAmount(payload.amount);
    } catch (error) {
      const payoutError = this.errorMessage(error);
      this.logger.error(
        `Payout failed claim=${payload.claimId}: ${payoutError}`,
      );
      return this.failedBroadcast(relayStatus, payoutError);
    }
    if (amount <= 0n) {
      const payoutError = 'Payout amount must be positive';
      this.logger.error(
        `Payout failed claim=${payload.claimId}: ${payoutError}`,
      );
      return this.failedBroadcast(relayStatus, payoutError);
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

    try {
      const simulation = await publicClient.simulateContract({
        account,
        address: tokenContractAddress,
        abi: erc20Abi,
        functionName: 'transfer',
        args: [recipientWalletAddress, amount],
      });
      if (simulation.result !== true) {
        throw new Error('ERC20 transfer simulation did not return true');
      }
    } catch (error) {
      const payoutError = this.errorMessage(error);
      this.logger.error(
        `Payout simulation failed claim=${payload.claimId} token=${payload.tokenSymbol} amount=${payload.amount}: ${payoutError}`,
      );
      return this.failedBroadcast(relayStatus, payoutError);
    }

    let preparedTransaction: PreparedPayoutTransaction;
    try {
      preparedTransaction = await this.dataSource.transaction(
        async (manager) => {
          await manager.query('SELECT pg_advisory_xact_lock($1)', [
            REWARD_WALLET_BROADCAST_LOCK_ID,
          ]);
          const unresolvedClaims: Array<{ id: string }> = await manager.query(
            `SELECT "id" FROM "token_claims" WHERE "payoutSenderAddress" = $1 AND "id" <> $2 AND "payoutNonce" IS NOT NULL AND "status" IN ('pending', 'unknown') ORDER BY "payoutNonce" ASC LIMIT 1 FOR UPDATE`,
            [account.address, payload.claimId],
          );
          if (unresolvedClaims.length > 0) {
            throw new Error(
              'Reward wallet has an unresolved earlier payout transaction',
            );
          }
          const networkNonce = await publicClient.getTransactionCount({
            address: account.address,
            blockTag: 'pending',
          });
          const nonceRows: Array<{ maxNonce: string | null }> =
            await manager.query(
              `SELECT MAX("payoutNonce") AS "maxNonce" FROM "token_claims" WHERE "payoutSenderAddress" = $1`,
              [account.address],
            );
          const nonce = this.getReservedPayoutNonce(
            networkNonce,
            nonceRows[0]?.maxNonce ?? null,
          );

          const preparedRequest = await walletClient.prepareTransactionRequest({
            account,
            to: tokenContractAddress,
            nonce,
            data: encodeFunctionData({
              abi: erc20Abi,
              functionName: 'transfer',
              args: [recipientWalletAddress, amount],
            }),
          });
          const serializedTransaction =
            await walletClient.signTransaction(preparedRequest);
          const txHash = keccak256(serializedTransaction);
          const updateResult = await manager.getRepository(TokenClaim).update(
            {
              id: payload.claimId,
              profileId: payload.profileId,
              status: TokenClaimStatus.PENDING,
              txHash: IsNull(),
              serializedPayoutTransaction: IsNull(),
            },
            {
              status: TokenClaimStatus.UNKNOWN,
              txHash,
              payoutSenderAddress: account.address,
              payoutNonce: nonce.toString(),
              serializedPayoutTransaction: serializedTransaction,
              broadcastAt: new Date(),
              reconciledAt: null,
              payoutError: null,
              processedAt: null,
            },
          );
          if (updateResult.affected !== 1) {
            throw new Error('Token claim disappeared before payout broadcast');
          }
          return { txHash, serializedTransaction, nonce };
        },
      );
    } catch (error) {
      try {
        const recoveredTransaction = await this.loadPreparedTransaction(
          payload.claimId,
          payload.profileId,
        );
        if (recoveredTransaction) {
          preparedTransaction = recoveredTransaction;
          this.logger.warn(
            `Recovered durably prepared payout after database uncertainty claim=${payload.claimId} txHash=${preparedTransaction.txHash}`,
          );
        } else {
          throw error;
        }
      } catch (recoveryError) {
        const payoutError = this.errorMessage(recoveryError);
        this.logger.error(
          `Payout preparation failed claim=${payload.claimId} token=${payload.tokenSymbol} amount=${payload.amount}: ${payoutError}`,
        );
        return this.failedBroadcast(relayStatus, payoutError);
      }
    }

    try {
      const submittedTxHash = await walletClient.sendRawTransaction({
        serializedTransaction: preparedTransaction.serializedTransaction,
      });
      if (
        submittedTxHash.toLowerCase() !==
        preparedTransaction.txHash.toLowerCase()
      ) {
        this.logger.warn(
          `Payout RPC returned a non-canonical hash claim=${payload.claimId} expected=${preparedTransaction.txHash} returned=${submittedTxHash}`,
        );
      }

      this.logger.log(
        `Payout broadcast claim=${payload.claimId} token=${payload.tokenSymbol} amount=${payload.amount} rewardWallet=${account.address} recipient=${recipientWalletAddress} nonce=${preparedTransaction.nonce} txHash=${preparedTransaction.txHash}`,
      );
      return {
        status: TokenClaimStatus.PENDING,
        txHash: preparedTransaction.txHash,
        payoutError: null,
        relay: relayStatus,
      };
    } catch (error) {
      const payoutError = this.errorMessage(error);
      this.logger.error(
        `Payout broadcast outcome is unknown claim=${payload.claimId} token=${payload.tokenSymbol} amount=${payload.amount}: ${payoutError}`,
      );
      return this.unknownBroadcast(
        relayStatus,
        payoutError,
        preparedTransaction.txHash,
      );
    }
  }

  async resolvePayoutReceipt(
    payload: ResolveRewardWalletPayoutReceipt,
  ): Promise<RewardWalletPayoutReceiptResult> {
    const relay = payload.relay ?? this.gaslessRelayService.getStatus('claim');
    const rpcUrl = this.configService.get<string>('BASE_RPC_URL');
    if (!rpcUrl || !rpcUrl.trim()) {
      const payoutError =
        'BASE_RPC_URL is not configured while resolving receipt';
      this.logger.error(
        `Payout receipt unresolved claim=${payload.claimId}: ${payoutError}`,
      );
      return this.unknownReceipt(payload, relay, payoutError);
    }

    try {
      const publicClient = createPublicClient({
        chain: base,
        transport: http(rpcUrl),
      });
      const preparedTransaction = await this.loadPreparedTransaction(
        payload.claimId,
      );
      if (preparedTransaction) {
        try {
          await publicClient.sendRawTransaction({
            serializedTransaction: preparedTransaction.serializedTransaction,
          });
        } catch (error) {
          this.logger.warn(
            `Payout rebroadcast was not acknowledged claim=${payload.claimId} txHash=${payload.txHash}: ${this.errorMessage(error)}`,
          );
        }
      }
      const receipt = await publicClient.waitForTransactionReceipt({
        hash: payload.txHash as Hex,
        confirmations: this.getPayoutMinConfirmations(),
      });

      if (receipt.status !== 'success') {
        const payoutError = 'Payout transaction reverted';
        this.logger.error(
          `Payout reverted claim=${payload.claimId} txHash=${payload.txHash}`,
        );
        return {
          status: TokenClaimStatus.FAILED,
          txHash: payload.txHash,
          payoutError,
          relay,
        };
      }

      this.logger.log(
        `Payout confirmed claim=${payload.claimId} txHash=${payload.txHash}`,
      );
      return {
        status: TokenClaimStatus.CONFIRMED,
        txHash: payload.txHash,
        payoutError: null,
        relay,
      };
    } catch (error) {
      const payoutError = this.errorMessage(error);
      this.logger.error(
        `Payout receipt unresolved claim=${payload.claimId} txHash=${payload.txHash}: ${payoutError}`,
      );
      return this.unknownReceipt(payload, relay, payoutError);
    }
  }

  private failedBroadcast(
    relay: GaslessRelayStatus,
    payoutError: string,
  ): RewardWalletPayoutBroadcastResult {
    return {
      status: TokenClaimStatus.FAILED,
      txHash: null,
      payoutError,
      relay,
    };
  }

  private unknownBroadcast(
    relay: GaslessRelayStatus,
    payoutError: string,
    txHash: string,
  ): RewardWalletPayoutBroadcastResult {
    return {
      status: TokenClaimStatus.UNKNOWN,
      txHash,
      payoutError,
      relay,
    };
  }

  private unknownReceipt(
    payload: ResolveRewardWalletPayoutReceipt,
    relay: GaslessRelayStatus,
    payoutError: string,
  ): RewardWalletPayoutReceiptResult {
    return {
      status: TokenClaimStatus.UNKNOWN,
      txHash: payload.txHash,
      payoutError,
      relay,
    };
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

  private async loadPreparedTransaction(
    claimId: string,
    profileId?: string,
  ): Promise<PreparedPayoutTransaction | null> {
    const claim = await this.dataSource.getRepository(TokenClaim).findOne({
      where: { id: claimId, ...(profileId ? { profileId } : {}) },
    });
    if (
      !claim?.txHash ||
      !claim.serializedPayoutTransaction ||
      !claim.payoutNonce
    ) {
      return null;
    }

    const serializedTransaction = claim.serializedPayoutTransaction as Hex;
    const computedHash = keccak256(serializedTransaction);
    if (computedHash.toLowerCase() !== claim.txHash.toLowerCase()) {
      throw new Error(
        'Stored payout transaction hash does not match its bytes',
      );
    }
    const nonce = this.parseStoredPayoutNonce(claim.payoutNonce);
    return {
      txHash: claim.txHash as Hex,
      serializedTransaction,
      nonce,
    };
  }

  private getReservedPayoutNonce(
    networkPendingNonce: number,
    maxReservedNonce: string | null,
  ): number {
    const networkNonce = BigInt(networkPendingNonce);
    const nextReservedNonce =
      maxReservedNonce === null ? 0n : BigInt(maxReservedNonce) + 1n;
    const reservedNonce =
      networkNonce > nextReservedNonce ? networkNonce : nextReservedNonce;
    if (reservedNonce > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Reward-wallet payout nonce exceeds safe integer range');
    }
    return Number(reservedNonce);
  }

  private parseStoredPayoutNonce(value: string): number {
    if (!/^\d+$/.test(value)) {
      throw new Error('Stored reward-wallet payout nonce is invalid');
    }
    const nonce = BigInt(value);
    if (nonce > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('Stored reward-wallet payout nonce exceeds safe range');
    }
    return Number(nonce);
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

  private getPayoutMinConfirmations(): number {
    const configuredValue = this.configService.get<string | number>(
      'REWARD_PAYOUT_MIN_CONFIRMATIONS',
    );
    if (
      configuredValue === undefined ||
      configuredValue === null ||
      String(configuredValue).trim() === ''
    ) {
      return 2;
    }

    const confirmations = Number(configuredValue);
    if (!Number.isSafeInteger(confirmations) || confirmations < 1) {
      throw new Error(
        'REWARD_PAYOUT_MIN_CONFIRMATIONS must be a positive integer',
      );
    }
    return confirmations;
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : 'unknown error';
  }
}
