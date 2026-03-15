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

## Current production-ready repo behavior

- Frontend read surfaces now use same-origin `/api/bubbledrop/...` proxy routes instead of depending on direct browser-side backend URLs.
- Frontend proxy prefers `BACKEND_URL`, then `NEXT_PUBLIC_BACKEND_URL`, and only falls back to `http://localhost:3000` outside production.
- Backend now fails fast in production when `FRONTEND_ORIGIN` is missing.
- Backend auth-session signing now fails fast in production when `AUTH_SESSION_SECRET` is missing or left as the placeholder value.

## Deploy-side requirements still outside the repo

- Production PostgreSQL and Redis connectivity
- Real deployed backend HTTPS origin
- Stable Base RPC provider with acceptable uptime/rate limits
- Reward wallet env values if live token payout verification is needed

## Live verification still required

- Base App in-app wallet connect and sign flow on a real device
- Production CORS success from frontend origin to backend
- Real SIWE nonce/verify flow against deployed backend
- Live claim payout behavior if reward wallet is enabled
