# BubbleDrop Production Env Checklist

This file captures the current production environment contract for BubbleDrop as a Base-ready standard web app.

## Frontend deploy

Set these on the deployed Next.js app:

```bash
BACKEND_URL=https://your-backend.example.com
NEXT_PUBLIC_BACKEND_URL=https://your-backend.example.com
NEXT_PUBLIC_APP_URL=https://bubledrop.vercel.app
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

### What each value does

- `BACKEND_URL`
  - recommended production source for the frontend server-side proxy route at `/api/bubbledrop/...`
  - should point at the deployed NestJS backend origin
  - avoids relying on a browser-exposed env for server-side API proxying

- `NEXT_PUBLIC_BACKEND_URL`
  - compatibility fallback for the same proxy route
  - keep it aligned with `BACKEND_URL`
  - still safe to set in the current app, but `BACKEND_URL` is the preferred production source

- `NEXT_PUBLIC_APP_URL`
  - canonical public frontend URL
  - used by metadata and Base.dev registration-related app identity

## Backend deploy

Set these on the deployed NestJS app:

```bash
FRONTEND_ORIGIN=https://bubledrop.vercel.app
AUTH_SESSION_SECRET=<long-random-secret>
BASE_RPC_URL=https://your-stable-base-mainnet-rpc
```

### What each value does

- `FRONTEND_ORIGIN`
  - CORS allowlist for the deployed frontend
  - may be comma-separated if multiple trusted frontend origins are required
  - required in production

- `AUTH_SESSION_SECRET`
  - HMAC secret for signed BubbleDrop auth session tokens
  - required in production
  - must not use the placeholder value from `.env.example`

- `BASE_RPC_URL`
  - Base mainnet RPC used for SIWE verification client creation and reward-wallet payout execution
  - required for reliable production behavior

## Reward wallet envs for launch payout

Only required if live claim payout is intended for launch:

```bash
REWARD_WALLET_ADDRESS=0x...
REWARD_WALLET_PRIVATE_KEY=0x...
```

### What each value does

- `REWARD_WALLET_ADDRESS`
  - optional until live payout is enabled
  - if set, must match the address derived from `REWARD_WALLET_PRIVATE_KEY`
  - used as a safety check before payout execution

- `REWARD_WALLET_PRIVATE_KEY`
  - optional until live payout is enabled
  - must be a valid 32-byte hex private key
  - required for signing Base token transfers from the reward wallet

### Launch note

- If BubbleDrop launches with claim request creation but without real payout enabled, leave reward wallet envs unset and treat payout verification as post-launch or gated rollout work.
- If BubbleDrop launches with real payout enabled, both reward wallet envs plus a working `BASE_RPC_URL` are mandatory.

## Already production-ready in the repo

- Frontend read surfaces now use same-origin `/api/bubbledrop/...` proxy routes instead of depending on direct browser-side backend URLs.
- Frontend proxy prefers `BACKEND_URL`, then `NEXT_PUBLIC_BACKEND_URL`, and only falls back to `http://localhost:3000` outside production.
- Backend now fails fast in production when `FRONTEND_ORIGIN` is missing.
- Backend auth-session signing now fails fast in production when `AUTH_SESSION_SECRET` is missing or left as the placeholder value.
- Home wallet/auth flow, protected mutation auth usage, gameplay session UI, and read-surface runtime wiring all pass current automated repo checks.

## Deploy-side configuration still required

- Production PostgreSQL and Redis connectivity
- Real deployed backend HTTPS origin
- Stable Base RPC provider with acceptable uptime/rate limits
- Correct frontend env values:
  - `BACKEND_URL`
  - `NEXT_PUBLIC_BACKEND_URL`
  - `NEXT_PUBLIC_APP_URL`
- Correct backend env values:
  - `FRONTEND_ORIGIN`
  - `AUTH_SESSION_SECRET`
  - `BASE_RPC_URL`
- Reward wallet env values if live token payout is intended for launch

## Remaining repo-side gaps to keep in mind

- Frontend production success still depends on deployers setting at least one backend origin env for the proxy route; the repo now fails safely with a 503-style response, but live data will not load without deploy-side config.
- Full backend e2e proof is still outside repo-only verification because automated checks do not exercise a live PostgreSQL/Redis production environment.
- Reward payout remains environment-gated rather than repo-proven because live signing and transfer confirmation depend on funded wallet credentials and chain access.

## Live verification still required

- Base App in-app wallet connect and sign flow on a real device
- Production CORS success from frontend origin to backend
- Real SIWE nonce/verify flow against deployed backend
- Real profile bootstrap, daily check-in, session completion, and claim request flow against deployed services
- Live claim payout behavior if reward wallet is enabled
