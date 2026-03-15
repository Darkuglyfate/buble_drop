# BubbleDrop Base App Mobile Verification Pass

This file captures the strict readiness pass for testing BubbleDrop inside the Base App mobile in-app browser.

## Ready now

- Frontend runs as a standard Next.js web app with `wagmi`, `viem`, and React Query.
- Frontend metadata already includes app name, description, canonical URL support, and social metadata.
- Production frontend URL placeholder is already wired through `NEXT_PUBLIC_APP_URL`.
- BubbleDrop now has a backend-verified SIWE-style auth/session flow for protected mutations.
- Protected mutations now rely on verified auth session state instead of trusting a raw wallet header.
- Core browser smoke coverage already exists for:
  - onboarding
  - daily check-in
  - session completion
  - claim gating
  - season and partner token navigation

## Production env required before real Base App testing

- `NEXT_PUBLIC_APP_URL` must be set to the real deployed frontend URL.
- Frontend `BACKEND_URL` should be set to the real deployed backend URL.
- `NEXT_PUBLIC_BACKEND_URL` should stay aligned with the same deployed backend URL as the current compatibility fallback.
- Backend `FRONTEND_ORIGIN` must include the deployed frontend origin.
- Backend `AUTH_SESSION_SECRET` must be replaced with a strong non-default secret.
- Backend `BASE_RPC_URL` must be set to a stable Base mainnet RPC endpoint.
- PostgreSQL and Redis must be reachable by the deployed backend.

## Current repo-side gaps for Base App mobile readiness

- Wallet connector configuration now includes explicit `baseAccount(...)` support plus `coinbaseWallet(...)` fallback.
- The production frontend is reachable at `https://bubledrop.vercel.app`, but real in-app behavior still needs mobile verification with a real wallet session.
- The repo still depends on a real deployed backend for live auth, profile bootstrap, daily check-in, session completion, and claim requests.
- The Base Account connector path is now wired, but it still requires real Base App runtime verification with actual wallet prompts.

## Strict mobile verification checklist

### 1. Production URL and app open

- Open the Base.dev registered BubbleDrop URL inside Base App.
- Confirm the page loads over HTTPS with no browser warning.
- Confirm the initial screen renders without layout breakage or hydration errors.

### 2. Wallet connect

- Confirm the app opens without forcing a wallet prompt before interaction.
- Tap `Connect Base wallet`.
- Confirm the in-app wallet connection prompt appears.
- Confirm the connected address renders in the home wallet card.
- Confirm network resolves to Base mainnet.

### 3. Sign in

- Tap `Sign in with Base wallet`.
- Confirm nonce creation succeeds and signature prompt appears.
- Confirm signature approval succeeds.
- Confirm the UI shows backend session issuance success.
- Confirm protected actions are enabled only after sign-in.

### 4. Profile bootstrap

- Tap `Bootstrap / refresh profile from connected wallet`.
- Confirm profile bootstrap succeeds.
- Confirm URL gains a valid `profileId`.
- Confirm backend summary loads without auth or CORS failure.

### 5. Onboarding

- If the profile is first-entry, complete the three learning cards.
- Submit nickname and starter avatar.
- Confirm backend onboarding completion succeeds.
- Confirm XP and rare-reward-access state refresh correctly after completion.

### 6. Daily check-in

- Trigger `Daily Base check-in`.
- Confirm the request succeeds in-app.
- Confirm streak or summary values refresh.
- Confirm repeated same-day check-in fails gracefully.

### 7. Active bubble session

- Open the session screen from home.
- Start a protected session.
- Record active play.
- Complete the session.
- Confirm XP and qualification result render.
- Confirm rare reward outcome render still appears when backend returns issued rewards.

### 8. Claim flow

- Open claim flow from home.
- Confirm XP-only mode stays blocked when rare reward access is inactive.
- If a profile has active claimable balance, submit a claim request.
- Confirm protected request succeeds with verified session.
- Confirm result status and tx hash behavior match backend response.

### 9. Partner token navigation

- Open season hub.
- Open token detail.
- Open partner transparency.
- Open referral progress.
- Confirm read surfaces load inside Base App without broken routing or scroll issues.

### 10. Session continuity

- Background and foreground the app once during a signed-in session.
- Refresh or reopen the app.
- Confirm session state behavior is acceptable for MVP:
  - signed-in session persists while valid, or
  - expired session fails cleanly and can be re-signed.

## Expected pass result

- BubbleDrop loads as a standard web app inside Base App.
- Wallet connection works on Base mainnet.
- SIWE-style sign-in succeeds against the deployed backend.
- Protected mutations succeed only with verified auth session state.
- Core MVP gameplay and read surfaces remain usable in the mobile in-app browser.

## Remaining environment-specific blockers

- Real mobile verification still requires a deployed backend reachable from the production frontend.
- Real mobile verification still requires a production `FRONTEND_ORIGIN` backend CORS allowlist entry.
- Real mobile verification still requires a non-default `AUTH_SESSION_SECRET`.
- Claim payout confirmation still depends on live reward-wallet env setup.
- Full backend e2e validation remains blocked until PostgreSQL is available in the execution environment.

