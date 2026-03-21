import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type GaslessRelayAction =
  | 'daily_check_in'
  | 'claim'
  | 'ownership'
  | 'session_outcome';

export type GaslessRelayKind = 'backend-sponsored';

export interface GaslessRelayStatus {
  action: GaslessRelayAction;
  relayKind: GaslessRelayKind;
  available: boolean;
  userPaysGas: false;
  reason: string | null;
}

@Injectable()
export class GaslessRelayService {
  constructor(private readonly configService: ConfigService) {}

  getStatus(action: GaslessRelayAction): GaslessRelayStatus {
    if (!this.isEnabled('GASLESS_RELAY_ENABLED')) {
      return this.unavailable(action, 'gasless relay disabled');
    }

    if (action === 'daily_check_in') {
      if (!this.isEnabled('GASLESS_DAILY_CHECK_IN_ENABLED')) {
        return this.unavailable(action, 'daily check-in relay disabled');
      }
      if (!this.isEnabled('ONCHAIN_STREAK_ENABLED')) {
        return this.unavailable(action, 'onchain streak write disabled');
      }
      if (!this.getTrimmed('ONCHAIN_STREAK_CONTRACT_ADDRESS')) {
        return this.unavailable(
          action,
          'missing ONCHAIN_STREAK_CONTRACT_ADDRESS',
        );
      }
      if (!this.getTrimmed('BASE_RPC_URL')) {
        return this.unavailable(action, 'missing BASE_RPC_URL');
      }
      if (
        !this.getTrimmed('ONCHAIN_STREAK_SIGNER_PRIVATE_KEY') &&
        !this.getTrimmed('ONCHAIN_STREAK_PRIVATE_KEY')
      ) {
        return this.unavailable(action, 'missing onchain streak signer key');
      }

      return this.available(action);
    }

    if (action === 'claim') {
      if (!this.isEnabled('GASLESS_CLAIM_ENABLED')) {
        return this.unavailable(action, 'claim relay disabled');
      }
      if (!this.getTrimmed('BASE_RPC_URL')) {
        return this.unavailable(action, 'missing BASE_RPC_URL');
      }
      if (!this.getTrimmed('REWARD_WALLET_PRIVATE_KEY')) {
        return this.unavailable(action, 'missing REWARD_WALLET_PRIVATE_KEY');
      }
      if (!this.getTrimmed('REWARD_WALLET_ADDRESS')) {
        return this.unavailable(action, 'missing REWARD_WALLET_ADDRESS');
      }
      if (!this.getTrimmed('REWARD_LEDGER_CONTRACT_ADDRESS')) {
        return this.unavailable(action, 'missing REWARD_LEDGER_CONTRACT_ADDRESS');
      }
      if (!this.getTrimmed('REWARD_LEDGER_WRITER_PRIVATE_KEY')) {
        return this.unavailable(action, 'missing REWARD_LEDGER_WRITER_PRIVATE_KEY');
      }

      return this.available(action);
    }

    if (action === 'ownership') {
      if (!this.isEnabled('GASLESS_OWNERSHIP_ENABLED')) {
        return this.unavailable(action, 'ownership relay disabled');
      }
      if (!this.getTrimmed('BASE_RPC_URL')) {
        return this.unavailable(action, 'missing BASE_RPC_URL');
      }
      if (!this.getTrimmed('REWARD_LEDGER_CONTRACT_ADDRESS')) {
        return this.unavailable(action, 'missing REWARD_LEDGER_CONTRACT_ADDRESS');
      }
      if (!this.getTrimmed('REWARD_LEDGER_WRITER_PRIVATE_KEY')) {
        return this.unavailable(action, 'missing REWARD_LEDGER_WRITER_PRIVATE_KEY');
      }
      return this.available(action);
    }

    if (!this.isEnabled('GASLESS_SESSION_OUTCOME_ENABLED')) {
      return this.unavailable(action, 'session outcome relay disabled');
    }
    if (!this.getTrimmed('BASE_RPC_URL')) {
      return this.unavailable(action, 'missing BASE_RPC_URL');
    }
    if (!this.getTrimmed('SESSION_OUTCOME_CONTRACT_ADDRESS')) {
      return this.unavailable(action, 'missing SESSION_OUTCOME_CONTRACT_ADDRESS');
    }
    if (!this.getTrimmed('SESSION_OUTCOME_SIGNER_PRIVATE_KEY')) {
      return this.unavailable(action, 'missing SESSION_OUTCOME_SIGNER_PRIVATE_KEY');
    }
    return this.available(action);
  }

  private available(action: GaslessRelayAction): GaslessRelayStatus {
    return {
      action,
      relayKind: 'backend-sponsored',
      available: true,
      userPaysGas: false,
      reason: null,
    };
  }

  private unavailable(
    action: GaslessRelayAction,
    reason: string,
  ): GaslessRelayStatus {
    return {
      action,
      relayKind: 'backend-sponsored',
      available: false,
      userPaysGas: false,
      reason,
    };
  }

  private isEnabled(key: string): boolean {
    return this.getTrimmed(key) === '1';
  }

  private getTrimmed(key: string): string | null {
    const value = this.configService.get<string>(key)?.trim();
    return value ? value : null;
  }
}
