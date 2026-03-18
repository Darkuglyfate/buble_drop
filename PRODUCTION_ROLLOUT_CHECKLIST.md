# BubbleDrop Production Rollout Checklist

This document is the strict operational checklist for BubbleDrop production rollouts on Render and Vercel.

Its purpose is to prevent partial deployments where the backend process is healthy but the live app is still broken because database migrations or reference seed data were not applied.

## Scope

Use this checklist for any production rollout that affects:

- the Render backend service
- the Render PostgreSQL database
- the Vercel frontend deployment

This is an operational runbook only. It does not change product behavior or infrastructure design.

## Backend start command

Use **`npm run start:prod`** in the backend service (not `node dist/main` alone).  
That script runs **TypeORM migrations** from compiled `dist/` before Nest listens, so new deploys apply schema without a separate migration step.  
Opt-out only if needed: `RUN_MIGRATIONS_ON_START=0` or `npm run start:prod:skip-migrate`.

## Hard Rules

- Do not treat `service healthy` as `app ready`.
- Do not redeploy the frontend and call rollout complete until backend DB-backed endpoints are verified.
- Always use `DB_USER` as the canonical database username variable.
- Do not use `DB_USERNAME` in Render env configuration for this repo.
- Do not skip the reference seed step for a fresh or reset production database.
- If running migrations or seed from outside Render against external Render Postgres, use an SSL-aware path.

## Required Backend Env Variables

Set these on the Render backend service:

```bash
NODE_ENV=production
PORT=<provided by Render>
FRONTEND_ORIGIN=https://bubledrop.vercel.app
AUTH_SESSION_SECRET=<long-random-secret>
BASE_RPC_URL=https://your-stable-base-mainnet-rpc

DB_HOST=<render-postgres-host>
DB_PORT=5432
DB_USER=<render-postgres-user>
DB_PASSWORD=<render-postgres-password>
DB_NAME=<render-postgres-database>

REDIS_HOST=<redis-host>
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

Only if live reward-wallet payout is intended for launch:

```bash
REWARD_WALLET_ADDRESS=0x...
REWARD_WALLET_PRIVATE_KEY=0x...
```

## Required Frontend Env Variables

Set these on the Vercel frontend project:

```bash
BACKEND_URL=https://buble-drop.onrender.com
NEXT_PUBLIC_BACKEND_URL=https://buble-drop.onrender.com
NEXT_PUBLIC_APP_URL=https://bubledrop.vercel.app
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Notes:

- `BACKEND_URL` is the preferred production source for the server-side proxy route.
- `NEXT_PUBLIC_BACKEND_URL` must stay aligned with `BACKEND_URL`.
- If these frontend backend-origin env values are wrong or missing, proxy routes can fail even if backend is healthy.

## Canonical DB Env Naming

Use this exact naming in backend runtime and operations:

```bash
DB_HOST
DB_PORT
DB_USER
DB_PASSWORD
DB_NAME
```

Do not use:

```bash
DB_USERNAME
```

The backend runtime and TypeORM datasource in this repo read `DB_USER`.

## Strict Safe Rollout Order

Follow this order exactly.

### 1. Local Preflight

From `backend/`:

```bash
npm install
npm run lint
npm run test
npm run build
npx tsc --noEmit
```

From `frontend/`:

```bash
npm install
npm run lint
npm run build
```

Do not start a production rollout if these checks are failing.

### 2. Confirm Backend Production Settings

In Render, confirm:

- backend service points at the correct production PostgreSQL database
- backend service has all required env values
- backend build command is valid for Nest production builds
- backend start command uses the compiled runtime

Safe expected commands:

```bash
# build
npm install --include=dev && npm run build

# start
npm run start
```

### 3. Deploy Backend

Trigger the backend deploy on Render and wait for startup success.

Do not stop here.

At this point the service may be alive while the app is still unusable.

### 4. Run Database Migrations

Preferred production-safe path: run migrations from the Render backend shell, where runtime env and internal connectivity already match production.

From the backend shell:

```bash
npm install --include=dev
npm run db:migration:show
npm run db:migration:run
```

Expected outcome:

- pending migrations are shown before apply
- migrations finish without SQL or connectivity errors

### 5. Run Reference Seed

After migrations, apply reference data before frontend verification.

From the backend shell:

```bash
npm run db:seed:reference-data
```

This step is required for BubbleDrop read surfaces that depend on seeded reference data, including starter avatars.

Do not treat migrations alone as sufficient on a fresh production database.

### 6. Verify Backend Directly

Verify direct backend endpoints before touching the frontend deployment status.

Recommended checks:

```bash
curl -i https://buble-drop.onrender.com/
curl -i https://buble-drop.onrender.com/profile/starter-avatars
curl -i -X POST https://buble-drop.onrender.com/auth/session/nonce \
  -H "Content-Type: application/json" \
  --data '{"walletAddress":"0x1111111111111111111111111111111111111111","chainId":8453}'
```

Expected results:

- `GET /` returns `200`
- `GET /profile/starter-avatars` returns `200` and JSON data
- `POST /auth/session/nonce` returns `201`

If `GET /profile/starter-avatars` fails with `relation "avatars" does not exist`, stop and fix database rollout before moving on.

### 7. Deploy Frontend

Only after direct backend verification succeeds:

- confirm Vercel env values are correct
- redeploy the frontend project

### 8. Verify Frontend Proxy Endpoints

After the Vercel redeploy finishes, verify the same backend-backed paths through the frontend proxy:

```bash
curl -i https://bubledrop.vercel.app/api/bubbledrop/profile/starter-avatars
curl -i -X POST https://bubledrop.vercel.app/api/bubbledrop/auth/session/nonce \
  -H "Content-Type: application/json" \
  --data '{"walletAddress":"0x1111111111111111111111111111111111111111","chainId":8453}'
```

Expected results:

- proxy `GET /api/bubbledrop/profile/starter-avatars` returns `200`
- proxy `POST /api/bubbledrop/auth/session/nonce` returns `201`

Rollout is not complete until both direct backend and frontend proxy checks pass.

## SSL-Aware Note For External Render Postgres

If you must run migrations or seed from a machine outside Render against external Render Postgres, the connection path must be SSL-aware.

Important:

- the repo's normal local TypeORM CLI flow does not by itself guarantee an SSL-ready external Render Postgres path
- external Render Postgres can reject non-SSL connections with `SSL/TLS required`

Preferred rule:

- use the Render backend shell for production DB rollout whenever possible

If an external path is unavoidable:

- ensure the migration and seed execution path explicitly enables SSL for the Postgres client
- do not assume local `npm run db:migration:run` is production-safe against the external Render database unless SSL has been handled

## Post-Deploy Verification Checklist

All of the following must be true before marking rollout successful:

- Render backend service starts successfully
- database migrations were applied successfully
- reference seed completed successfully
- direct backend `GET /profile/starter-avatars` returns `200`
- direct backend `POST /auth/session/nonce` returns `201`
- frontend proxy `GET /api/bubbledrop/profile/starter-avatars` returns `200`
- frontend proxy `POST /api/bubbledrop/auth/session/nonce` returns `201`
- Render logs show no schema-missing errors for BubbleDrop read paths
- Render logs show no production Postgres timeout errors during verification

## Highest-Risk Failure Points

- Backend process starts successfully but migrations were never applied.
- Migrations were applied but reference seed data was not loaded.
- Operator uses `DB_USERNAME` instead of `DB_USER`.
- Frontend `BACKEND_URL` is set, so proxying starts, but backend DB rollout is incomplete.
- External Render Postgres is targeted from a local machine without SSL-aware migration or seed execution.
- Rollout is judged only by Render health or root URL response instead of BubbleDrop endpoints.
- Frontend is redeployed before direct backend endpoint verification is complete.

## What Should Be Automated Next

- Automate backend migrations as a required production post-deploy step.
- Automate reference seed for fresh production databases or first-run environments.
- Add a production readiness check that verifies BubbleDrop endpoints, not just process health.
- Version the provider-side deploy configuration so build, start, and env contracts do not drift in UI-only configuration.
- Add a documented SSL-aware operational script for external Render Postgres migration and seed flows.
- Make frontend rollout completion dependent on successful backend verification.

## Rollout Completion Gate

Do not mark the rollout complete until this final statement is true:

`Backend started successfully, migrations applied, reference seed applied, direct backend checks passed, frontend proxy checks passed.`
