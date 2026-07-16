# BubbleDrop Privacy and Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` task-by-task, with specification review before code-quality review.

**Goal:** Keep owner data and backend credentials out of public/browser-controlled surfaces, remove identity from ordinary URLs, and make production startup, TLS, readiness, and release verification deterministic.

**Architecture:** Backend owner routes derive the profile from the authenticated wallet rather than query parameters. The Next.js BFF owns the backend token in a host-only HttpOnly cookie, validates same-origin writes, and applies double-submit CSRF. Production startup has one migration owner, shared fail-closed PostgreSQL TLS options, dependency readiness, and documented environment bundles.

**Repository policy:** Logic-only. Do not commit, push, or open a pull request without explicit user authorization. Do not edit `frontend/app/ui/bubbledrop-shell.tsx`; neutralize identity propagation at routing/API boundaries and record any behavior that cannot be closed without a separately approved high-risk UI change.

---

## Task 1: Derive owner profile from backend session

**Files:** `backend/src/modules/wallet-binding/*`, profile/claim/partner-token controllers and specs.

- [x] Write failing controller/service tests proving unauthenticated owner reads fail and no owner GET accepts `profileId`.
- [x] Add a wallet-binding method that resolves authenticated session wallet to its profile or fails closed.
- [x] Change owner routes to `GET /profile/summary`, `/profile/rewards-inventory`, `/claim/balances`, and `/partner-token/referral/progress` without identity query parameters.
- [x] Run focused wallet-binding/profile/claim/partner-token controller tests.

## Task 2: Minimize public leaderboard data

**Files:** `backend/src/modules/profile/profile.service.ts`, controller/service specs, matching frontend leaderboard models.

- [x] Write a failing test that public rows contain only `rank`, `nickname`, and `totalXp`.
- [x] Remove internal profile UUID, wallet data, streak, qualification, and balances from the public response.
- [x] Update frontend types/rendering without exposing hidden identity fields.
- [x] Run focused backend tests and frontend type/lint checks.

## Task 3: Secure BFF authentication and mutations atomically

**Files:** backend authenticated status route/spec; `frontend/app/api/bubbledrop/[...path]/route.ts`; new server-only session/proxy/origin/CSRF helpers and auth status/logout/CSRF routes; `frontend/app/base-sign-in.ts`; `frontend/app/hooks/shell/useWalletFlow.ts`; related tests.

- [x] Start a real mock-backend process from Playwright so tests observe BFF-forwarded headers, cookies, and filtered responses.
- [x] Write failing tests for token leakage/storage, forged auth headers/cookies, absent or wrong Origin, absent or mismatched CSRF, expiry, refresh/status validation, and logout.
- [x] Add an authenticated backend session-status endpoint; BFF status must validate the cookie token against it, never trust cookie presence.
- [x] Store the backend token in a host-only `HttpOnly`, `Secure` in production, `SameSite=Strict`, path-scoped cookie.
- [x] Strip `authSessionToken` from verify JSON; ignore browser-supplied backend auth headers and inject only the cookie token.
- [x] Add tokenless authenticated-state handling in `useWalletFlow`, status refresh/expiry/logout behavior, and remove token/message/signature persistence from browser storage.
- [x] Require server-only `BACKEND_URL`; remove the `NEXT_PUBLIC_BACKEND_URL` proxy fallback.
- [x] Add a CSRF bootstrap route with a readable host-only cookie and require matching `x-bubbledrop-csrf` on POST/PUT/PATCH/DELETE.
- [x] Compare `Origin` exactly with server-only `FRONTEND_ORIGIN` before nonce, verify, logout, and every proxied state change.
- [x] Use auth cookie `Path=/api/bubbledrop`, CSRF cookie `Path=/`, and identical attributes when deleting either cookie.
- [x] Route mutation callers through one helper that supplies CSRF and never handles the backend token.
- [x] Run BFF security smoke tests.

## Task 4: Remove identity from navigation and owner API URLs

**Files:** `frontend/app/bubbledrop-runtime.tsx`, navigation/back-button helpers, screen API callers, `frontend/app/base-sign-in.ts`, smoke tests. Keep the high-risk shell file untouched.

- [x] Write failing smoke assertions that ordinary URLs and owner GET requests contain no `profileId` or wallet address.
- [x] Stop reading ordinary identity query parameters and stop appending identity to internal links.
- [x] Convert owner requests to cookie-authenticated routes without identity query parameters; retain only explicitly isolated smoke-test identity injection.
- [x] Run frontend lint/build and privacy smoke tests; record the protected shell direct-write as unresolved until Task 8 approval.

Task 4 residual: `frontend/app/ui/bubbledrop-shell.tsx` still writes identity through `history.replaceState`; removal remains isolated to Task 8 and requires its separate minimal logic-only approval.

## Task 5: Make production startup and PostgreSQL TLS deterministic

**Files:** `backend/scripts/start-production.cjs`, `backend/src/app.module.ts`, `backend/src/database/typeorm.datasource.ts`, new shared postgres-options helper/spec, package/README/rollout docs.

- [x] Write failing tests proving migrations can run twice and certificate verification cannot be disabled in production.
- [x] Keep the production wrapper as the only migration owner; remove Nest `migrationsRun` startup behavior and contradictory manual instructions.
- [x] Share PostgreSQL connection/TLS options between Nest and TypeORM CLI.
- [x] Verify certificates by default for URL and host configuration; allow self-signed TLS only through an explicit non-production override.
- [x] Run startup/TLS tests and disposable PostgreSQL migration `up/down/up`.

## Task 6: Add readiness and production environment contract

**Files:** new backend health module/controller/service/specs/e2e, `render.yaml`, env examples and production checklists.

- [x] Write failing readiness tests for PostgreSQL, Redis, and Base chain ID `8453` failures.
- [x] Add `/health/live` and `/health/ready`; readiness uses bounded dependency checks and returns 503 on any required failure.
- [x] Configure Render health checks and document mandatory auth, SIWE, DB, Redis, Base, confirmation, and relay bundles.
- [x] Default all gasless relay flags off until their full key/address bundle is configured.
- [x] Run health unit/e2e tests.

## Task 7: Build non-mutating release tooling

- [x] Add backend `lint:check` without `--fix` and keep formatting changes out of validation.
- [x] Add offline compilation plus an ephemeral local-EVM behavioral harness for all three contracts, without deploy keys.
- [x] Add Playwright production-server configuration and a real mock backend for BFF/security smoke tests.
- [x] Add aggregate release-check commands and document them in the rollout checklist.

## Task 8: Resolve protected shell URL write

- [x] Stop before editing `frontend/app/ui/bubbledrop-shell.tsx` and request explicit user approval for a minimal logic-only removal of its identity `history.replaceState` write.
- [x] If approved, add a failing URL regression test, remove only that write, and run focused frontend smoke/build checks.
- [x] If not approved, mark identity-free URL completion blocked rather than claiming privacy completion.

## Task 9: Run final release gate

- [x] Backend non-mutating lint, unit/e2e tests, build, and disposable migration `up/down/up`.
- [x] Frontend lint, production build, and Playwright smoke against the production server.
- [x] Run the already-created offline Solidity behavioral suite.
- [x] Run final specification review, then code-quality review; resolve every Critical/Important finding.
- [x] Produce the final changed-file, fixed-bug, verification, residual-risk, and GitHub-status report.

## Completion criteria

- Owner data cannot be fetched without an authenticated backend session and owner URLs contain no profile identity.
- Public leaderboard rows contain no internal UUID, wallet, streak, qualification, balance, or inventory data.
- Browser JavaScript never receives or stores the backend token and cannot choose the forwarded auth header.
- Every state-changing BFF request is exact-origin and CSRF validated.
- Production runs migrations once, verifies PostgreSQL certificates by default, and exposes dependency readiness.
- Backend, frontend, contracts, migrations, and two-stage review are green before final reporting.
