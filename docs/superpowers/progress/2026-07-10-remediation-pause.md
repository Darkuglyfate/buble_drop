# Bubble Drop remediation — pause point

**Status:** resumed on 2026-07-15; stage-one security/accounting verification completed locally. Do not commit, push, open a pull request, or edit the source checkout without explicit user authorization.

## Authoritative workspace

- Worktree: `C:\Users\Илья\.config\superpowers\worktrees\baseupp\codex-bubbledrop-remediation`
- Branch: `codex/bubbledrop-remediation`
- Source checkout left untouched for further work: `C:\Users\Илья\Desktop\baseupp`
- High-risk UI file intentionally not edited: `frontend/app/ui/bubbledrop-shell.tsx`

## Completed stage-one work

- Hardened SIWE nonce handling and signed-message validation.
- Added transactional, idempotent XP grants and referral rewards.
- Verified Base daily-check-in receipts and introduced finality/reorganization handling.
- Made session XP fail closed when Redis activity evidence is unavailable and removed client score/combo from trusted on-chain input.
- Added durable, idempotent rare-reward entitlements and payout `UNKNOWN` state reconciliation.
- Added database migrations `1742400000000` through `1742430000000` for the new persistence invariants.

## Last code change

The latest fix addresses a completion that itself makes the profile eligible for rare rewards:

- `BubbleSessionService.completeSession` now evaluates qualification **after** the session and XP writes, in the same TypeORM transaction.
- `QualificationService.evaluateProgress` accepts an optional `EntityManager` and uses its repositories, so its session and XP queries can observe those uncommitted writes.
- Added regression coverage in `bubble-session.service.spec.ts` and `qualification.service.spec.ts`.

## Verification status

- The new session regression passed alone before the final qualification-service test was added: `17 passed` in `bubble-session.service.spec.ts`.
- The combined targeted command below was started and then deliberately terminated by the user; it has **no result** and must be rerun.
- A full backend test run and build were started earlier, but their terminal sessions did not return a conclusive exit status. Treat stage-one verification as incomplete.
- A separate reviewer was requested, but the reviewer could not run because its usage quota was exhausted. Request fresh review after limits return.

## Resume checklist

1. Run the targeted tests:
   ```powershell
   cd C:\Users\Илья\.config\superpowers\worktrees\baseupp\codex-bubbledrop-remediation\backend
   npm test -- --runInBand src/modules/qualification/qualification.service.spec.ts src/modules/bubble-session/bubble-session.service.spec.ts src/modules/rewards/rare-reward-entitlement.service.spec.ts src/modules/rewards/rare-reward.service.spec.ts
   ```
2. Run complete backend verification: `npm test -- --runInBand` and `npm run build`.
3. Run `npm run lint -- app/hooks/shell/useWalletFlow.ts` in the `frontend` directory and record any unrelated baseline warnings/errors.
4. Request an independent review of the rare-reward entitlement and transaction-qualified completion paths.
5. Only after the verification gate passes, update the stage-one plan and begin season/cooldown work from phase two.

## Safety notes

- No commit, push, or pull request exists for this work.
- Do not reset `C:\Users\Илья\Desktop\baseupp`: it contains unrelated user files and prior accidental edits that must be reviewed separately.

## Resume result — 2026-07-15

- Added transactional qualification visibility for a session that reaches eligibility itself.
- Fixed Redis activity cleanup so failed completion attempts retain evidence for retry.
- Made score/combo optional, defaulted to zero, and bounded to PostgreSQL integer limits.
- Made an unsubmitted ownership mirror fail the entitlement attempt instead of marking it issued.
- Added a production entitlement processor that runs on bootstrap and every 60 seconds without overlapping batches.
- Final backend evidence: 18 suites and 113 tests passed; backend build exited 0.
- Task 5 specification and code-quality reviews approved.

## Stage two progress — 2026-07-15

- Task 1 completed: active seasons now require `isActive = true` and inclusive UTC start/end dates.
- `PartnerTokenService` and rare token issuance use the shared transaction-aware `SeasonService`.
- Invalid resolver dates fail with an explicit `TypeError` before serialization.
- Focused verification passed: 3 suites and 21 tests; backend build exited 0.
- Task 1 specification and code-quality reviews approved.
- Next checkpoint: Task 2, persist season identity through sessions, XP, tickets, and rare-reward entitlements.

## Stage two Task 2 result — 2026-07-15

- Sessions, XP events, weekly tickets, and rare-reward entitlements now store nullable season snapshots.
- Onboarding, check-in, referral, and session XP allocations propagate the transaction-aware active season.
- Check-in reorganization reversals inherit the original XP event's season instead of the current season.
- Entitlements require the session season to be valid at completion and delayed issuance uses that exact season.
- Added migration `1742440000000-AddSeasonScopedRewards.ts`; legacy rows remain `NULL`.
- Fresh verification passed: 7 focused suites and 68 tests; full backend 19 suites and 129 tests; backend build and `git diff --check` exited 0.
- Disposable PostgreSQL was not configured, so migration `up/down/up` remains unverified against a live database.
- Task 2 specification and code-quality reviews approved.
- Next checkpoint: Task 3, scope qualification state and progress to one season.

## Stage two Task 3 result — 2026-07-15

- Qualification states now use nullable season identity with partial uniqueness on `(profileId, seasonId)`.
- XP and completed-session thresholds query only the explicit season; legacy `NULL` states are not reused.
- Profile and check-in views use the date-valid active season; session completion evaluates its snapshotted season in the same transaction.
- Concurrent state creation uses atomic insert-or-ignore followed by a read, preserving existing status and timestamps.
- Migration rollback deterministically keeps the latest state per profile before restoring legacy profile uniqueness.
- Fresh post-review verification passed: 5 suites and 52 tests; backend build and `git diff --check` exited 0.
- Agent full-suite evidence: 20 suites and 134 tests passed.
- Live PostgreSQL migration `up/down/up` remains unverified because no disposable database is configured.
- Task 3 specification and code-quality reviews approved.
- Next checkpoint: Task 4, enforce global NFT award cooldown.

## Stage two Task 4 result — 2026-07-15

- NFT issuance now checks the latest ownership definition's `cooldownDays` before drop-chance evaluation.
- Exact expiry is allowed, zero-day cooldown remains immediate, and permanent ownership still blocks duplicate definitions.
- A positive cooldown on a newly awarded NFT stops later NFT awards in the same issuance call.
- Ownership rows tied at the latest `acquiredAt` use the maximum cooldown expiry, preventing nondeterministic ordering bypasses.
- Fresh post-review verification passed: rare-reward and entitlement suites, 18 tests; backend build and `git diff --check` exited 0.
- Agent full-suite evidence: 138 backend tests passed.
- Task 4 specification and code-quality reviews approved.
- Next checkpoint: Task 5, split production reference seeds from guarded demo data and add cleanup migration logic.

## Stage two Task 5 result — 2026-07-15

- Production reference seeding now creates only neutral rank frames and starter avatars.
- Demo identities, seasons, placeholder tokens, gameplay history, rewards, and inventories moved to a separate production-guarded seed.
- Demo seasons are generated around the current UTC date and every season-scoped fixture stores the persisted active season ID.
- Migration cleanup targets only fixed demo UUIDs and known demo keys in foreign-key-safe order; cleanup is intentionally irreversible on rollback.
- Fresh post-review verification passed: seed-policy and migration suites, 9 tests; backend build and `git diff --check` exited 0.
- Agent full-suite evidence: 21 suites and 148 backend tests passed.
- Live PostgreSQL migration `up/down/up` remains unverified because no disposable database is configured.
- Task 5 specification and code-quality reviews approved.
- Next checkpoint: Task 6, run the complete stage-two verification and final two-stage review.

## Stage two verification gate — 2026-07-15

- Focused season/reward gate passed: 6 suites and 63 tests.
- Full backend passed locally: 21 suites and 148 tests.
- Backend build and `git diff --check` exited 0; only existing LF/CRLF conversion warnings were printed.
- TypeORM migration discovery was fixed to exclude `.spec.ts`/`.spec.js`; focused datasource test passed.
- All 12 migrations passed `up/down/up` on a disposable PostgreSQL 16 container with no volume; the container was removed afterward.
- No GitHub commit, push, or pull request was created.
- Next checkpoint: final stage-two specification and code-quality approvals.

## Stage two complete — 2026-07-15

- Final stage-two specification review approved.
- Final stage-two code-quality review approved.
- All six tasks in `2026-07-15-bubbledrop-rewards-seasons.md` are complete.
- Authoritative local evidence: focused 63 tests, full backend 148 tests, build, diff-check, and disposable PostgreSQL migration `up/down/up` all passed.
- Stage two remains local on `codex/bubbledrop-remediation`; no commit, push, or pull request exists.
- Next stage: privacy and operational hardening from the approved remediation design.
