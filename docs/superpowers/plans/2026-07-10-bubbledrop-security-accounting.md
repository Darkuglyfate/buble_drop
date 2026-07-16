# BubbleDrop Security and Accounting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make wallet authentication, Base daily check-ins, session rewards, XP caps, and referral rewards safe against forgery, replay, Redis outages, and concurrent requests.

**Architecture:** Authentication nonces are short-lived Redis records consumed atomically and tied to the requested wallet, Base chain, SIWE statement, allowed origin, and expiry. Daily check-ins become persisted on-chain claims that are only rewarded after the required Base receipt/event confirmations and can be reconciled if a canonical receipt disappears. All XP mutations run in a database transaction locked by profile, use durable allocation idempotency keys, and update `Profile.totalXp` atomically.

**Tech Stack:** NestJS 11, TypeORM/PostgreSQL, Redis/ioredis, viem/Base, Jest, Next.js/Wagmi.

**Repository policy:** This is a `logic-only` stage. Do not modify `frontend/app/ui/bubbledrop-shell.tsx`. Do not create commits unless the user explicitly requests one.

**Required execution order:** Execute Tasks 1, 2, 4, 3, 5, 6, then 7. Task 4 provides the transactional negative-XP and idempotency primitives required by check-in reorg reconciliation in Task 3.

---

## File map

- `backend/src/modules/auth-session/auth-session.service.ts` — Redis nonce lifecycle and strict server-side SIWE validation.
- `backend/src/modules/auth-session/auth-session.controller.ts` — await asynchronous nonce creation.
- `backend/src/modules/auth-session/auth-session.module.ts` — inject `RedisModule` into auth.
- `backend/src/modules/auth-session/auth-session.service.spec.ts` — nonce, origin, URI, expiry, and replay regressions.
- `backend/src/modules/check-in/check-in-receipt-verifier.service.ts` — Base receipt/event/confirmation and canonical-chain checks.
- `backend/src/modules/check-in/check-in-receipt-verifier.service.spec.ts` — forged hash, wrong contract/wallet/day, insufficient confirmations, and reorg cases.
- `backend/src/modules/check-in/check-in.service.ts` and `.spec.ts` — persisted claim state and only-confirmed rewards.
- `backend/src/modules/check-in/check-in.module.ts` — verifier and required providers.
- `backend/src/modules/check-in/entities/check-in-record.entity.ts` — chain receipt identity, status, and reorg metadata.
- `backend/src/modules/rewards/xp.service.ts` and `.spec.ts` — transactional cap, profile lock, allocation idempotency, and atomic total-XP increment.
- `backend/src/modules/rewards/entities/reward-event.entity.ts` — idempotency key for all XP allocations.
- `backend/src/modules/rewards/entities/rare-reward-entitlement.entity.ts` and `rare-reward-entitlement.service.ts` — transactional session reward outbox plus an idempotent issuer.
- `backend/src/modules/rewards/rare-reward.service.ts` and `.spec.ts` — accept entitlement-derived idempotency keys for every durable award.
- `backend/src/modules/bubble-session/bubble-session.service.ts` and `.spec.ts` — atomic completion, server-only activity evidence, untrusted score handling.
- `backend/src/modules/partner-token/partner-token.service.ts` and `.spec.ts` — atomic referral transition plus idempotent XP allocation.
- `backend/src/modules/profile/profile.service.spec.ts` and `backend/src/modules/rewards/rare-reward.service.spec.ts` — repair their missing providers so the existing suite reaches the implementation tests.
- `backend/src/modules/claim/claim.service.ts`, `reward-wallet-payout.service.ts`, and their specs — persist broadcast transaction hashes and reconcile unknown payout outcomes.
- `backend/src/modules/claim/entities/token-claim.entity.ts` — payout-state and broadcast metadata.
- `backend/src/database/migrations/<timestamp>-HardenSecurityAndAccounting.ts` — schema/index changes for claim identity and reward idempotency.
- `backend/.env.example` — explicit SIWE allow-list, nonce TTL, and check-in confirmation configuration.
- `frontend/app/hooks/shell/useWalletFlow.ts` — include the server-issued nonce expiry in the signed SIWE message; no UI behavior change.

### Task 1: Restore the baseline unit-test harness

**Files:**
- Modify: `backend/src/modules/profile/profile.service.spec.ts`
- Modify: `backend/src/modules/rewards/rare-reward.service.spec.ts`

- [x] **Step 1: Run the currently failing focused specs**

Run: `npm test -- --runInBand src/modules/profile/profile.service.spec.ts src/modules/rewards/rare-reward.service.spec.ts`

Expected: FAIL during Nest test-module creation because `RewardLedgerOnchainService` and `UserWalletRepository` are not provided.

- [x] **Step 2: Add the missing test doubles only**

Add inert `useValue` providers matching the constructor dependencies reported by Nest. Do not alter service production code or mock behaviour unrelated to test creation.

- [x] **Step 3: Verify the repaired harness**

Run: `npm test -- --runInBand src/modules/profile/profile.service.spec.ts src/modules/rewards/rare-reward.service.spec.ts`

Expected: PASS; any remaining failure must be an asserted service behaviour, not missing DI.

### Task 2: Bind SIWE authentication to Redis nonces and approved origins

**Files:**
- Modify: `backend/src/modules/auth-session/auth-session.service.spec.ts`
- Modify: `backend/src/modules/auth-session/auth-session.service.ts`
- Modify: `backend/src/modules/auth-session/auth-session.controller.ts`
- Modify: `backend/src/modules/auth-session/auth-session.module.ts`
- Modify: `backend/.env.example`
- Modify: `frontend/app/hooks/shell/useWalletFlow.ts`

- [x] **Step 1: Write focused failing SIWE tests**

Add cases that request a nonce then assert verification rejects: a different SIWE domain, a different URI, a different statement, an expired `expirationTime`, and a reused nonce. Add a passing case asserting `expirationTime` is accepted when it equals the nonce response expiry. Assert the nonce response statement is the single canonical server statement and that its exact value is persisted with the nonce. Mock the Redis client explicitly, including `set` with `NX/PX` and `getdel`.

Run: `npm test -- --runInBand src/modules/auth-session/auth-session.service.spec.ts`

Expected: FAIL because nonce storage is process-local and domain/URI/statement/expiration are not validated.

- [x] **Step 2: Implement the minimal Redis-backed nonce protocol**

Make `createNonce` asynchronous. Define and export one server-owned `AUTH_SESSION_STATEMENT` constant; the nonce request never accepts a caller-supplied statement and its response returns this exact constant. Store `{ walletAddress, chainId, statement: AUTH_SESSION_STATEMENT, expiresAtMs }` at `bubbledrop:auth-nonce:<nonce>` using `SET key value NX PX <configured ttl>`. Consume with Redis `GETDEL`; missing, malformed, expired, or mismatched stored data must throw `UnauthorizedException`. Import `RedisModule` into `AuthSessionModule`.

Derive defaults for `SIWE_ALLOWED_DOMAINS` and `SIWE_ALLOWED_URIS` from `FRONTEND_ORIGIN` only for local development; production must require explicit non-empty allow-lists. Parse every configured URI using `URL`, reject non-HTTP(S) values, compare SIWE `domain`, `uri`, `chainId`, `address`, `statement`, `issuedAt`, and `expirationTime` after parsing. Require Base (`8453`) and reject messages outside the configured max clock-skew/nonce TTL window.

Add documented environment variables: `SIWE_ALLOWED_DOMAINS`, `SIWE_ALLOWED_URIS`, `AUTH_NONCE_TTL_SECONDS`, and `SIWE_MAX_CLOCK_SKEW_SECONDS`.

- [x] **Step 3: Bind the browser message to server expiry**

Pass `expirationTime: new Date(noncePayload.expiresAt)` into `createSiweMessage`. Preserve existing wallet and sign-in UI states; do not store any additional secret in browser storage.

- [x] **Step 4: Verify red-to-green authentication coverage**

Run: `npm test -- --runInBand src/modules/auth-session/auth-session.service.spec.ts`

Expected: PASS, including wrong-origin, expiry, and replay tests.

### Task 3: Verify Base check-in receipts before issuing XP

**Files:**
- Create: `backend/src/modules/check-in/check-in-receipt-verifier.service.ts`
- Create: `backend/src/modules/check-in/check-in-receipt-verifier.service.spec.ts`
- Modify: `backend/src/modules/check-in/check-in.service.spec.ts`
- Modify: `backend/src/modules/check-in/check-in.service.ts`
- Modify: `backend/src/modules/check-in/check-in.module.ts`
- Modify: `backend/src/modules/check-in/entities/check-in-record.entity.ts`
- Modify: `backend/src/database/migrations/<timestamp>-HardenSecurityAndAccounting.ts`
- Modify: `backend/.env.example`

- [x] **Step 1: Add failing receipt-verifier tests**

Use a mocked viem public client. Cover successful `DailyCheckInRecorded(wallet, dayKey, streak)` from the configured streak-contract address; reject a reverted receipt, another contract, a log for another wallet/day, a receipt below `CHECK_IN_MIN_CONFIRMATIONS`, and a reused `chainId + txHash + logIndex`. Add a canonical-chain test where a stored `blockHash` no longer matches the receipt and the claim becomes orphaned.

Run: `npm test -- --runInBand src/modules/check-in/check-in-receipt-verifier.service.spec.ts src/modules/check-in/check-in.service.spec.ts`

Expected: FAIL because `txHash` is only syntax-checked today.

- [x] **Step 2: Add durable claim fields and migration**

Add `CheckInStatus` values `PENDING`, `CONFIRMED`, and `ORPHANED`; add nullable `chainId`, `txLogIndex`, `blockNumber`, `blockHash`, and `confirmedAt` to `CheckInRecord`. Add a partial unique PostgreSQL index for non-null `(chainId, txHash, txLogIndex)`. Backfill existing records as confirmed only when they have no chain transaction; leave legacy chain hashes pending for manual reconciliation rather than trusting them.

- [x] **Step 3: Implement receipt and reorg verification**

Use a Base viem public client and the exact `DailyCheckInRecorded(address,uint32,uint32)` ABI. Require `receipt.status === 'success'`, the configured `ONCHAIN_STREAK_CONTRACT_ADDRESS`, the authenticated profile wallet, the current UTC day key, and the configured confirmation depth. Return a `pending` result without XP until confirmations are sufficient. Persist the event log index and block hash.

Before treating a same-day confirmed record as final, re-fetch its receipt and compare canonical block hash. If it disappeared or changed, mark it `ORPHANED`, append one deterministic negative XP reversal allocation, atomically decrement profile total XP, re-evaluate qualification, and permit exactly one replacement valid claim for that date. Reconciliation must never silently turn an orphaned record back to confirmed.

- [x] **Step 4: Gate `CheckInService` rewards on the confirmed claim**

Replace raw `txHash` acceptance with verifier output. A wallet-backed check-in with insufficient confirmations returns an explicit pending response and no streak, XP, or qualification mutation. A confirmed claim is persisted and then uses deterministic XP key `check-in:<profileId>:<utc-date>:<claim-id>`. Keep walletless local-development records explicitly off-chain and never let them impersonate an on-chain confirmation.

- [x] **Step 5: Verify receipt and service tests**

Run: `npm test -- --runInBand src/modules/check-in/check-in-receipt-verifier.service.spec.ts src/modules/check-in/check-in.service.spec.ts`

Expected: PASS; forged hashes and non-final receipts do not call `grantXp`.

### Task 4: Serialize XP accounting and referral rewards

**Files:**
- Modify: `backend/src/modules/rewards/xp.service.spec.ts`
- Modify: `backend/src/modules/rewards/xp.service.ts`
- Modify: `backend/src/modules/rewards/entities/reward-event.entity.ts`
- Modify: `backend/src/modules/partner-token/partner-token.service.spec.ts`
- Modify: `backend/src/modules/partner-token/partner-token.service.ts`
- Modify: `backend/src/database/migrations/<timestamp>-HardenSecurityAndAccounting.ts`

- [x] **Step 1: Add failing XP and referral race tests**

Add an XP test that calls two grants for the same profile/day through a shared locked transaction and asserts total XP cannot exceed `DAILY_XP_CAP`. Add duplicate allocation-key coverage proving retries return the original accounting result without creating a second event. Add a referral race test where only the successful pending-to-successful state transition can invoke the referral XP allocation.

Run: `npm test -- --runInBand src/modules/rewards/xp.service.spec.ts src/modules/partner-token/partner-token.service.spec.ts`

Expected: FAIL because the cap is read before insert and referral status/save is non-atomic.

- [x] **Step 2: Add idempotent reward-event persistence**

Add nullable `idempotencyKey` to `RewardEvent` and a unique partial index for non-null keys. Extend `XpAllocation` with required deterministic `idempotencyKey` for positive and reversal allocations. Reject duplicate keys that have incompatible profile, source, or amount rather than reusing another allocation.

- [x] **Step 3: Implement transactional XP grants**

Inject `DataSource` and `Profile` access into `XpService`. In one transaction, lock the profile row (`pessimistic_write`), load existing allocation keys, calculate the UTC daily cap from positive XP events, insert only new events, and increment/decrement `Profile.totalXp` exactly by the newly persisted net amount. Return the existing granted amounts for fully duplicate retries. Accept an optional `EntityManager` so check-in, session, and referral state transitions can share their transaction.

- [x] **Step 4: Make referral success a conditional transactional transition**

In a `DataSource.transaction`, lock the referral, re-check its prerequisites, change only `PENDING` to `SUCCESSFUL`, and call `XpService.grantXp` using `referral:<referralId>:success`. A request that finds an already-successful referral returns its persisted state and never increments XP a second time.

- [x] **Step 5: Verify accounting tests**

Run: `npm test -- --runInBand src/modules/rewards/xp.service.spec.ts src/modules/partner-token/partner-token.service.spec.ts`

Expected: PASS; retries are idempotent and concurrent paths cannot exceed 100 daily XP.

### Task 5: Make session completion reward-safe and server-evidenced

**Files:**
- Modify: `backend/src/modules/bubble-session/bubble-session.service.spec.ts`
- Modify: `backend/src/modules/bubble-session/bubble-session.service.ts`
- Modify: `backend/src/modules/bubble-session/entities/bubble-session.entity.ts`
- Modify: `backend/src/modules/bubble-session/dto/complete-bubble-session.dto.ts`
- Create: `backend/src/modules/rewards/entities/rare-reward-entitlement.entity.ts`
- Create: `backend/src/modules/rewards/rare-reward-entitlement.service.ts`
- Create: `backend/src/modules/rewards/rare-reward-entitlement.service.spec.ts`
- Modify: `backend/src/modules/rewards/rare-reward.service.ts`
- Modify: `backend/src/modules/rewards/rare-reward.service.spec.ts`
- Modify: `backend/src/modules/rewards/rewards.module.ts`
- Modify: `backend/src/database/migrations/<timestamp>-HardenSecurityAndAccounting.ts`

- [x] **Step 1: Write failing session regressions**

Add tests for: Redis read failure grants zero active/completion XP; two completion attempts race and only one reaches `XpService`; a client-supplied score/combo does not alter the on-chain input or integrity hash; a retry after atomic completion returns the persisted completion result or a conflict without another allocation; and an eligible completion creates one durable rare-reward entitlement even if the issuer has not run yet.

Run: `npm test -- --runInBand src/modules/bubble-session/bubble-session.service.spec.ts`

Expected: FAIL because Redis failure falls back to client seconds, score enters durable on-chain data, and completion uses check-then-save.

- [x] **Step 2: Remove client authority from rewards and on-chain outcome**

Treat `finalScore` and `bestCombo` as optional display telemetry only. Exclude both values from reward flags, XP calculation, integrity hash, and `SessionOutcomeOnchainService.recordOutcome`; pass only server-derived zero/absent telemetry until server-authoritative gameplay exists. Keep API response compatibility only if it can be labelled/persisted as untrusted telemetry.

- [x] **Step 3: Fail closed for missing Redis activity**

Keep activity signal writes best-effort for gameplay continuity, but make `getRecordedActiveSeconds` return `0` on Redis reads/errors and record the evidence-unavailable condition. Never substitute `activeSecondsInput` for reward purposes.

- [x] **Step 4: Claim completion atomically with XP**

Within one database transaction, lock the session/profile, perform a conditional transition from open to completed, calculate rewards from Redis evidence, call `XpService.grantXp` with deterministic keys `session:<id>:<source>`, and insert an eligible unique `RareRewardEntitlement` outbox row for that session. Persist all completion response fields needed for safe idempotent replay. If another request already claimed the session, return its persisted result or a conflict before any reward/on-chain side effect.

- [x] **Step 5: Implement the idempotent rare-reward issuer**

Define durable entitlement states `PENDING`, `PROCESSING`, `ISSUED`, and `FAILED`, with a unique session ID and durable attempt/error metadata. The issuer must lock one pending entitlement, use its ID as the idempotency prefix for token, ticket, collectible, ownership-mirror, and reward-event writes, then mark it `ISSUED` only after every durable award succeeds. A process crash leaves a recoverable pending/processing row; retrying must produce the same result rather than duplicate balances, tickets, ownerships, or on-chain mirrors. Invoke one issuance attempt after session-transaction commit and provide a recoverable `processPendingEntitlements` path for startup/worker execution.

- [x] **Step 6: Verify session and entitlement tests**

Run: `npm test -- --runInBand src/modules/bubble-session/bubble-session.service.spec.ts src/modules/rewards/rare-reward-entitlement.service.spec.ts src/modules/rewards/rare-reward.service.spec.ts`

Expected: PASS; a Redis outage and a forged score cannot create a reward advantage.

### Task 6: Preserve broadcast payout state and reconcile unknown outcomes

**Files:**
- Modify: `backend/src/modules/claim/claim.service.spec.ts`
- Modify: `backend/src/modules/claim/claim.service.ts`
- Modify: `backend/src/modules/claim/reward-wallet-payout.service.spec.ts`
- Modify: `backend/src/modules/claim/reward-wallet-payout.service.ts`
- Modify: `backend/src/modules/claim/entities/token-claim.entity.ts`
- Modify: `backend/src/modules/claim/claim.module.ts`
- Modify: `backend/src/database/migrations/<timestamp>-HardenSecurityAndAccounting.ts`

- [x] **Step 1: Write failing payout uncertainty regressions**

Add a test where `writeContract` returns a transaction hash but receipt polling times out or throws: the claim must retain that hash and become `UNKNOWN`, while the balance remains reserved. Add a reconciliation test where a later successful receipt confirms exactly once and decrements the balance; add a failed/reverted receipt test that marks the same claim `FAILED` and releases it for a controlled retry without broadcasting a duplicate transfer.

Run: `npm test -- --runInBand src/modules/claim/claim.service.spec.ts src/modules/claim/reward-wallet-payout.service.spec.ts`

Expected: FAIL because the existing catch path erases the broadcast hash and marks the claim failed.

- [x] **Step 2: Add explicit broadcast and unknown-claim state**

Add `UNKNOWN` to `TokenClaimStatus`, retain `txHash` after broadcast, and add `broadcastAt`, `reconciledAt`, and nullable `payoutError` fields. Keep a unique active-claim index covering `PENDING` and `UNKNOWN` so the same balance cannot start a second transfer before reconciliation.

- [x] **Step 3: Split payout broadcast from receipt resolution**

Make `RewardWalletPayoutService` return a distinct broadcast result immediately after `writeContract` and a distinct confirmed/failed/unknown receipt-resolution result. Do not convert a post-broadcast exception to a failed transfer and do not lose its transaction hash. Log only non-sensitive identifiers and no private-key material.

- [x] **Step 4: Reconcile before retrying any payout**

`ClaimService` persists the broadcast hash in its own transaction before waiting for a receipt. On every claim request and on an explicit recoverable reconciliation path, query the Base receipt for `UNKNOWN` claims. Confirmed receipts decrement balance exactly once; reverted receipts transition to `FAILED`; still-unavailable receipts remain `UNKNOWN` and block new broadcasts. Record a reward-ledger settlement only after confirmation.

- [x] **Step 5: Verify payout safety tests**

Run: `npm test -- --runInBand src/modules/claim/claim.service.spec.ts src/modules/claim/reward-wallet-payout.service.spec.ts`

Expected: PASS; no receipt-polling failure can authorize a duplicate payout.

### Task 7: Run the stage-one verification gate

**Files:**
- Modify only if validation exposes a defect in Tasks 1–6.

- [x] **Step 1: Run all backend unit tests**

Run: `npm test -- --runInBand`

Expected: PASS with zero failed suites. Repair only failures caused by this stage or the baseline harness defects recorded in Task 1.

- [x] **Step 2: Compile the backend**

Run: `npm run build`

Expected: PASS.

- [x] **Step 3: Run targeted frontend static validation**

Run: `npm run lint -- app/hooks/shell/useWalletFlow.ts`

Expected: no errors in the changed sign-in flow. Record existing unrelated lint errors separately if they remain.

- [x] **Step 4: Inspect the final change set**

Run: `git diff --check && git status --short`

Expected: no whitespace errors; only intended stage-one code, migration, test, environment-example, and documentation changes.

## Completion criteria

- A nonce cannot be replayed, moved to another wallet, origin, URI, statement, or Base chain, and expires in Redis.
- Daily XP is impossible to earn from a syntactically valid but unrelated transaction hash.
- XP, referral, session, rare-reward, and payout retries/concurrency cannot issue duplicate rewards or exceed the cap.
- Redis failure and client score/combo no longer increase rewards or trusted on-chain data.
- Unit tests/build evidence is recorded before stage two starts.

## Verification record — 2026-07-15

- Backend focused rare-reward/session gate: 4 suites, 31 tests passed.
- Backend complete gate: 18 suites, 113 tests passed.
- Backend build: `npm run build` exited with code 0.
- Frontend targeted lint: 0 errors and one pre-existing unused `Address` warning.
- `git diff --check`: no whitespace errors; Windows line-ending conversion warnings only.
- Task 5 specification review: approved.
- Task 5 final code-quality review after production retry processor: approved.
