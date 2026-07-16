# BubbleDrop Remediation Design

## Goal

Make BubbleDrop safe to operate with real wallets and rewards by closing the audited trust-boundary, accounting, reward, privacy, and deployment defects in controlled stages.

## Scope and delivery order

The work is deliberately split into three independently testable stages. Each stage must be green before the next begins.

1. **Security and accounting** — validate wallet authentication and Base check-ins, remove client authority over rewards, and make reward mutations idempotent.
2. **Rewards and seasons** — make valid session rewards reachable, scope qualification to a real season, and prevent demo data entering production.
3. **Privacy and operations** — minimize unauthenticated data, harden browser/server boundaries, and make production startup observable and deterministic.

## Design decisions

### Trust boundaries

- SIWE verification will compare message domain and URI against server-side allow-lists, require Base chain ID, bind the nonce to the signature-derived wallet and statement, and enforce issued-at and expiration policy. Nonces move from process memory to Redis with a short configurable TTL; atomic consume deletes a matching unexpired nonce, and expired or mismatched nonce attempts are rejected.
- The backend will verify a daily check-in transaction receipt against Base, the configured streak contract, the authenticated wallet, and the current UTC day before granting XP. The expected `DailyCheckInRecorded` event is decoded, and its chain ID, transaction hash, and log index are recorded uniquely. A claim moves through `pending`, `confirmed`, and `orphaned` states: XP is granted only after the configured confirmation depth; a canonical-block recheck marks a later-disappearing receipt orphaned and blocks any reward until a replacement valid claim is confirmed.
- Client score and combo remain display telemetry only. They will not affect XP, qualification, reward flags, or on-chain durable outcomes until server-side gameplay validation exists.
- Missing Redis activity data is a fail-closed condition for rewards. A session can finish without awarding active-play or completion XP.

### Accounting and idempotency

- Session completion, referral completion, check-in XP, and rare reward entitlement creation will use database transactions and deterministic idempotency keys.
- A session is claimed for completion using an atomic state transition. Subsequent requests receive the already-completed result or a conflict without issuing another reward.
- XP grants will use a per-profile/day lock and a persisted idempotency key so the 100-XP cap cannot be exceeded by concurrent requests.
- Payout submission will persist the broadcast transaction hash before receipt polling. Unknown transaction state is reconciled instead of treated as a failed payout that can be retried immediately.
- Rare rewards are represented by a transactional entitlement/outbox record created with session completion. An idempotent issuer processes that record, so a crash cannot silently lose a reward or issue it twice.

### Rewards and seasons

- `BubbleSessionService` will create a rare-reward entitlement after the session is atomically completed and qualification is evaluated. The idempotent issuer calls `RareRewardService` from that durable entitlement.
- A season is active only when `isActive` is true and the current UTC date is inside its configured range. Qualification state, XP accounting, and active sessions are associated with that season.
- Production reference data contains only neutral starter assets. Demo users, fake partner tokens, placeholder contracts, and expired seasons remain in a separate development-only seed. A production cleanup migration removes existing demo records before the safe seed is permitted.
- NFT cooldown semantics are either enforced from `cooldownDays` or removed; this remediation enforces cooldown before another award is considered.

### Privacy and browser state

- Owner-only profile summary, rewards inventory, and claimable balances require an authenticated session. Public leaderboard data stays intentionally minimal.
- Internal navigation no longer carries profile ID or wallet address as URL query parameters.
- The Next.js BFF consumes the verified backend token and stores it in a Secure, HttpOnly, SameSite cookie scoped to the frontend origin. The browser never receives the backend token; the BFF adds it only to internal proxy requests. State-changing BFF routes require same-origin validation and CSRF protection.

### Operations

- Database migrations run in exactly one production startup path, not both the bootstrap script and Nest configuration.
- PostgreSQL TLS verifies certificates by default; an explicit development override is required for self-signed local infrastructure.
- A readiness endpoint checks application dependencies, and deployment documentation lists the mandatory security and relay environment variables.

## Validation strategy

Every defect receives a regression test before implementation. Tests cover forged and replayed check-ins, wrong SIWE origin, Redis outage, duplicate completion, referral races, season boundaries, rare reward wiring, public-profile denial, and payout reconciliation.

The final validation suite runs backend unit/e2e tests, frontend lint/build/smoke tests, and contract tests. Existing baseline failures are repaired as part of the relevant stage before new behavior is accepted.

## Non-goals

- Rewriting the client bubble simulation as a fully server-authoritative realtime game.
- Creating a real production partner token or deploying contracts with private keys.
- Modifying visual onboarding or welcome-screen behavior.
