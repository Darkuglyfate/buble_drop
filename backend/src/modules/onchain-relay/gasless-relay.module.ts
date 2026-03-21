import { Module } from '@nestjs/common';
import { GaslessRelayService } from './gasless-relay.service';
import { RewardLedgerOnchainService } from './reward-ledger-onchain.service';
import { SessionOutcomeOnchainService } from './session-outcome-onchain.service';

@Module({
  providers: [
    GaslessRelayService,
    RewardLedgerOnchainService,
    SessionOutcomeOnchainService,
  ],
  exports: [
    GaslessRelayService,
    RewardLedgerOnchainService,
    SessionOutcomeOnchainService,
  ],
})
export class GaslessRelayModule {}
