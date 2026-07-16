# BubbleDrop Rewards and Seasons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scope qualification and rare rewards to a real UTC-bounded season, enforce NFT reward cooldown, and prevent demo identities, fake tokens, placeholder contracts, and expired seasons from entering production.

**Architecture:** A shared `SeasonService` is the only authority for resolving an active season and requires both `isActive = true` and an inclusive UTC date range. Sessions, XP events, qualification states, and rare-reward entitlements snapshot a season ID so delayed processing cannot switch rewards to another season. NFT cooldown is derived from the most recent NFT ownership and its definition, while production and demo seeds become separate scripts guarded by environment policy.

**Tech Stack:** NestJS 11, TypeORM/PostgreSQL, Jest, class-validator, UTC date keys.

**Repository policy:** Logic-only work. Do not modify `frontend/app/ui/bubbledrop-shell.tsx`. Do not commit, push, or open a pull request without explicit user authorization; commit steps from the generic workflow are intentionally omitted.

---

## File map

- Create `backend/src/modules/partner-token/season.service.ts` and `.spec.ts` — shared inclusive UTC active-season resolution.
- Create `backend/src/modules/partner-token/season.module.ts` — exports `SeasonService` without coupling reward and qualification modules to the full partner-token feature.
- Modify `backend/src/modules/partner-token/partner-token.module.ts`, `partner-token.service.ts`, and `.spec.ts` — use the shared date-aware resolver.
- Modify `backend/src/modules/bubble-session/entities/bubble-session.entity.ts`, `bubble-session.service.ts`, and `.spec.ts` — snapshot a season at session start and preserve it at completion.
- Modify `backend/src/modules/rewards/entities/reward-event.entity.ts`, `rare-reward-entitlement.entity.ts`, `weekly-token-ticket.entity.ts`, and related services/specs — persist season identity through XP and delayed issuance.
- Modify `backend/src/modules/qualification/entities/qualification-state.entity.ts`, `qualification.service.ts`, and `.spec.ts` — one state per profile and season; sum only season XP and sessions.
- Modify XP callers in profile onboarding, check-in, session completion, and referral completion so every allocation carries a nullable season snapshot.
- Modify `backend/src/modules/profile/entities/profile-nft-ownership.entity.ts`, `rare-reward.service.ts`, and `.spec.ts` — enforce the awarded definition's cooldown before another NFT award.
- Split `backend/src/scripts/seed-reference-data.ts` and create `backend/src/scripts/seed-demo-data.ts` plus seed-policy tests.
- Create `backend/src/database/migrations/1742440000000-AddSeasonScopedRewards.ts` — season foreign keys, indexes, qualification uniqueness, and known demo-data cleanup.

### Task 1: Resolve only a date-valid active season

**Files:**
- Create: `backend/src/modules/partner-token/season.service.ts`
- Create: `backend/src/modules/partner-token/season.service.spec.ts`
- Create: `backend/src/modules/partner-token/season.module.ts`
- Modify: `backend/src/modules/partner-token/partner-token.module.ts`
- Modify: `backend/src/modules/partner-token/partner-token.service.ts`
- Modify: `backend/src/modules/partner-token/partner-token.service.spec.ts`
- Modify: `backend/src/modules/rewards/rewards.module.ts`
- Modify: `backend/src/modules/qualification/qualification.module.ts`

- [x] **Step 1: Write failing active-season boundary tests**

Cover: inactive season; future season; expired season; start date inclusive; end date inclusive; day after end excluded. Freeze time and compare `YYYY-MM-DD` UTC keys, not server-local time.

Run: `npm test -- --runInBand src/modules/partner-token/season.service.spec.ts`

Expected: FAIL because no shared date-aware resolver exists.

- [x] **Step 2: Implement `SeasonService`**

Expose `getActiveSeason(at = new Date(), entityManager?)`. Query `isActive: true`, `startDate <= utcDateKey`, and `endDate >= utcDateKey`; return `Season | null`. When an `EntityManager` is supplied, use its repository so callers can share a transaction.

- [x] **Step 3: Replace direct `isActive` lookups**

Inject `SeasonService` into `PartnerTokenService` and `RareRewardService`. `getSeasonHub()` and token issuance return no active season/reward outside the configured inclusive range. Keep token-detail history readable even when its season is no longer active.

- [x] **Step 4: Verify resolver integration**

Run: `npm test -- --runInBand src/modules/partner-token/season.service.spec.ts src/modules/partner-token/partner-token.service.spec.ts src/modules/rewards/rare-reward.service.spec.ts`

Expected: PASS with explicit future/expired-season denial.

### Task 2: Persist season identity through sessions, XP, and entitlements

**Files:**
- Modify: `backend/src/modules/bubble-session/entities/bubble-session.entity.ts`
- Modify: `backend/src/modules/bubble-session/bubble-session.service.ts`
- Modify: `backend/src/modules/bubble-session/bubble-session.service.spec.ts`
- Modify: `backend/src/modules/rewards/entities/reward-event.entity.ts`
- Modify: `backend/src/modules/rewards/entities/rare-reward-entitlement.entity.ts`
- Modify: `backend/src/modules/rewards/entities/weekly-token-ticket.entity.ts`
- Modify: `backend/src/modules/rewards/xp.service.ts`
- Modify: `backend/src/modules/rewards/xp.service.spec.ts`
- Modify: `backend/src/modules/rewards/rare-reward-entitlement.service.ts`
- Modify: `backend/src/modules/rewards/rare-reward-entitlement.service.spec.ts`
- Modify: `backend/src/modules/rewards/rare-reward.service.ts`
- Modify: `backend/src/modules/rewards/rare-reward.service.spec.ts`
- Create: `backend/src/database/migrations/1742440000000-AddSeasonScopedRewards.ts`

- [x] **Step 1: Write failing season-snapshot tests**

Assert a started session stores the resolver's season ID; a no-season session stores `null`; XP events store the supplied season ID; an entitlement copies the completed session's season ID; delayed issuance uses the entitlement season even after another season becomes active.

Run: `npm test -- --runInBand src/modules/bubble-session/bubble-session.service.spec.ts src/modules/rewards/xp.service.spec.ts src/modules/rewards/rare-reward-entitlement.service.spec.ts src/modules/rewards/rare-reward.service.spec.ts`

Expected: FAIL because season identity currently exists only in token reward metadata.

- [x] **Step 2: Add nullable season foreign keys and indexes**

Add nullable `seasonId` relations to `BubbleSession`, `RewardEvent`, `RareRewardEntitlement`, and `WeeklyTokenTicket`. Add indexes for `(profileId, seasonId)` on sessions/events and `(seasonId, status)` on entitlements. Preserve legacy rows as `NULL`; never guess a season from `isActive` during migration.

- [x] **Step 3: Carry season IDs through writes**

`startSession` snapshots the active season. `XpAllocation` accepts `seasonId: string | null`, persists it, and checks it when reusing an idempotency key. Session allocations use `session.seasonId`. Check-in, onboarding, and referral callers resolve the current date-valid season and pass its ID or `null`.

- [x] **Step 4: Bind entitlements to their session season**

Create an entitlement only when the completion is eligible and the session has a season that remains active at `endedAt`. Persist `seasonId`. `RareRewardService` receives the entitlement's season ID and loads that exact season/token instead of resolving whatever season is active when the worker retries.

- [x] **Step 5: Verify migration and snapshot behavior**

Run: `npm test -- --runInBand src/modules/bubble-session/bubble-session.service.spec.ts src/modules/rewards/xp.service.spec.ts src/modules/rewards/rare-reward-entitlement.service.spec.ts src/modules/rewards/rare-reward.service.spec.ts`

Expected: PASS; a delayed entitlement cannot issue a token from a later season.

### Task 3: Scope qualification to one season

**Files:**
- Modify: `backend/src/modules/qualification/entities/qualification-state.entity.ts`
- Modify: `backend/src/modules/qualification/qualification.service.ts`
- Modify: `backend/src/modules/qualification/qualification.service.spec.ts`
- Modify: `backend/src/modules/profile/profile.service.ts`
- Modify: `backend/src/modules/profile/profile.service.spec.ts`
- Modify: `backend/src/modules/check-in/check-in.service.ts`
- Modify: `backend/src/modules/check-in/check-in.service.spec.ts`
- Modify: `backend/src/modules/bubble-session/bubble-session.service.ts`
- Modify: `backend/src/modules/bubble-session/bubble-session.service.spec.ts`
- Modify: `backend/src/database/migrations/1742440000000-AddSeasonScopedRewards.ts`

- [x] **Step 1: Write failing cross-season isolation tests**

Cover: previous-season XP does not count; previous-season sessions do not count; a new season creates a fresh `LOCKED/IN_PROGRESS` state; a completed session that reaches thresholds qualifies only its own season; no active season returns locked progress and no rare access.

Run: `npm test -- --runInBand src/modules/qualification/qualification.service.spec.ts src/modules/bubble-session/bubble-session.service.spec.ts src/modules/check-in/check-in.service.spec.ts src/modules/profile/profile.service.spec.ts`

Expected: FAIL because qualification currently aggregates lifetime XP and all completed sessions.

- [x] **Step 2: Change qualification uniqueness**

Add nullable `seasonId` to `QualificationState`, replace unique `profileId` with unique `(profileId, seasonId)` for non-null season IDs, and preserve legacy null-season rows as historical data that is never used for new qualification.

- [x] **Step 3: Require explicit season context**

Refactor qualification evaluation to accept a `seasonId` or resolve a date-valid active season at the public boundary. Query only `RewardEvent.eventType = XP AND seasonId = ?` and completed `BubbleSession.seasonId = ?`. Use the same optional `EntityManager` for state, XP, session, and check-in queries.

- [x] **Step 4: Update profile/check-in/session views**

Profile season progress and check-in qualification use the current date-valid season. Session completion evaluates its snapshotted season inside the completion transaction. Responses may add nullable `seasonId`/season key but must preserve existing fields.

- [x] **Step 5: Verify season qualification**

Run: `npm test -- --runInBand src/modules/qualification/qualification.service.spec.ts src/modules/bubble-session/bubble-session.service.spec.ts src/modules/check-in/check-in.service.spec.ts src/modules/profile/profile.service.spec.ts`

Expected: PASS; no progress leaks between seasons.

### Task 4: Enforce NFT cooldown before another NFT award

**Files:**
- Modify: `backend/src/modules/rewards/rare-reward.service.ts`
- Modify: `backend/src/modules/rewards/rare-reward.service.spec.ts`
- Modify: `backend/src/modules/profile/entities/profile-nft-ownership.entity.ts` only if a relation query requires metadata already present in the schema.

- [x] **Step 1: Write failing cooldown tests**

Freeze time and cover: latest ownership with `cooldownDays = 7` blocks every new NFT before seven full UTC days; exactly at expiry is allowed; `cooldownDays = 0` is immediate; a permanently owned definition remains skipped independently of cooldown.

Run: `npm test -- --runInBand src/modules/rewards/rare-reward.service.spec.ts`

Expected: FAIL because `cooldownDays` is never read.

- [x] **Step 2: Implement global NFT award cooldown**

Load the profile's most recent NFT ownership with its `NftDefinition`. Compare `acquiredAt + cooldownDays` with `session.endedAt ?? new Date()`. If still cooling down, return no NFT before drop-chance evaluation. This treats the awarded definition's cooldown as the waiting period before any later NFT award while permanent ownership still prevents duplicate ownership.

- [x] **Step 3: Verify cooldown and idempotent retry together**

Run: `npm test -- --runInBand src/modules/rewards/rare-reward.service.spec.ts src/modules/rewards/rare-reward-entitlement.service.spec.ts`

Expected: PASS; retries remain idempotent and cooldown cannot be bypassed by another session.

### Task 5: Separate safe production reference data from demo data

**Files:**
- Modify: `backend/src/scripts/seed-reference-data.ts`
- Create: `backend/src/scripts/seed-demo-data.ts`
- Create: `backend/src/scripts/seed-policy.spec.ts`
- Modify: `backend/package.json`
- Modify: `backend/.env.example`
- Modify: `backend/src/database/migrations/1742440000000-AddSeasonScopedRewards.ts`

- [x] **Step 1: Write failing seed-policy tests**

Assert the production reference seed contains only rank frames and starter avatars; contains no wallet/profile/referral/session/check-in/claimable balance; contains no placeholder token contract; and the demo seed refuses `NODE_ENV=production` unless an explicitly test-only override is supplied.

Run: `npm test -- --runInBand src/scripts/seed-policy.spec.ts`

Expected: FAIL because one script currently seeds production reference data and demo identities together.

- [x] **Step 2: Keep the production seed neutral**

Reduce `seed-reference-data.ts` to idempotent neutral rank-frame and starter-avatar upserts. It must not create seasons, partner tokens, NFT/cosmetic drops, wallets, profiles, rewards, or gameplay history.

- [x] **Step 3: Move fixtures to a guarded demo seed**

Move existing demo seasons, fake partner tokens, definitions, wallets, profiles, sessions, referrals, rewards, and qualification fixtures to `seed-demo-data.ts`. Exit before opening the application context when `NODE_ENV=production`. Add `seed:demo`; keep the safe script as the only production seed command.

- [x] **Step 4: Remove known demo records during migration**

Delete the fixed demo UUIDs and known seed keys in foreign-key-safe order, including `genesis-bloom`, `testnet-waves`, `BUBL`, `POP`, `genesis-spark`, and `glossy-aura`. Never delete arbitrary user-created rows with different IDs/keys. Document that this cleanup is intentionally irreversible in migration rollback.

- [x] **Step 5: Verify seed policy**

Run: `npm test -- --runInBand src/scripts/seed-policy.spec.ts`

Expected: PASS; production seeding cannot create demo identities or placeholder contracts.

### Task 6: Run the stage-two verification gate

**Files:**
- Modify only if validation exposes a stage-two defect.

- [x] **Step 1: Run focused season/reward tests**

Run: `npm test -- --runInBand src/modules/partner-token/season.service.spec.ts src/modules/qualification/qualification.service.spec.ts src/modules/rewards/rare-reward.service.spec.ts src/modules/rewards/rare-reward-entitlement.service.spec.ts src/modules/bubble-session/bubble-session.service.spec.ts src/scripts/seed-policy.spec.ts`

Expected: PASS with zero failures.

- [x] **Step 2: Run all backend tests**

Run: `npm test -- --runInBand`

Expected: PASS with zero failed suites.

- [x] **Step 3: Compile the backend**

Run: `npm run build`

Expected: PASS.

- [x] **Step 4: Inspect schema and final diff**

Run: `git diff --check` and inspect `git status --short`. If a disposable PostgreSQL instance is configured, run migrations up/down/up before accepting the migration; otherwise record database integration as unverified rather than claiming it passed.

- [x] **Step 5: Request two-stage review**

Require specification approval first, then code-quality approval. Resolve every Critical/Important finding before stage three.

## Completion criteria

- `isActive` alone cannot activate a future or expired season.
- XP, sessions, qualification state, tickets, and entitlements have an explicit season snapshot.
- A delayed entitlement cannot issue a later season's partner token.
- Previous-season progress cannot qualify the current season.
- `cooldownDays` blocks subsequent NFT awards until the UTC expiry instant.
- Production seed paths cannot create demo users, fake tokens, placeholder contracts, or expired seasons.
- Backend focused tests, full tests, build, migration evidence, and two-stage review are recorded before privacy/operations work starts.
