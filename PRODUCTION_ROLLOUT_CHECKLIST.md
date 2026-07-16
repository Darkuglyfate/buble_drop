# BubbleDrop Production Rollout Checklist

This document is the strict operational checklist for BubbleDrop production rollouts on Render and Vercel.

Its purpose is to prevent partial deployments where the backend process is healthy but the live app is still broken because automatic migrations, reference seed data, or frontend security env values were not verified.

## Scope

Use this checklist for any production rollout that affects:

- the Render backend service
- the Render PostgreSQL database
- the Vercel frontend deployment

This is an operational runbook only. It does not change product behavior or infrastructure design.

## Backend start command

Use **`npm run start:prod`** in the backend service (not `node dist/main` alone).  
That script runs **TypeORM migrations** from compiled `dist/` before Nest listens, so new deploys apply schema without a separate migration step.  

## Hard Rules

- Do not treat `service healthy` as `app ready`.
- Do not redeploy the frontend and call rollout complete until backend DB-backed endpoints are verified.
- Always use `DB_USER` as the canonical database username variable.
- Do not use `DB_USERNAME` in Render env configuration for this repo.
- Do not skip the reference seed step for a fresh or reset production database.
- Production migrations are owned by `npm run start:prod`; do not invoke the TypeORM migration CLI as a second owner.
- If running the reference seed from outside Render against external Render Postgres, use an SSL-aware path.

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
REWARD_PAYOUT_MIN_CONFIRMATIONS=2
PAYOUT_RECONCILIATION_INTERVAL_MS=15000
```

Keep `REWARD_PAYOUT_MIN_CONFIRMATIONS` aligned with the Base finality policy; payouts remain unresolved until this depth is reached.
Keep the backend payout reconciliation processor running; it automatically rebroadcasts durable prepared transactions after crashes or ambiguous RPC responses.

Before enabling live payouts after the season-scoping migration, audit legacy rows:

```sql
SELECT "profileId", "tokenSymbol", "claimableAmount"
FROM "claimable_token_balances"
WHERE "seasonId" IS NULL;
```

The migration backfills only symbols that map to exactly one season. Ambiguous legacy rows stay hidden from the active-season claim API and require an operator-approved season assignment before payout.

## Required Frontend Env Variables

Set these on the Vercel frontend project:

```bash
BACKEND_URL=https://buble-drop.onrender.com
FRONTEND_ORIGIN=https://bubledrop.vercel.app
NEXT_PUBLIC_APP_URL=https://bubledrop.vercel.app
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Notes:

- `BACKEND_URL` is the required server-only production source for the proxy route.
- `FRONTEND_ORIGIN` must exactly match the deployed frontend origin used for same-origin and CSRF validation.
- If either value is wrong or missing, proxy routes fail closed even if the backend is healthy.

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

Install both workspace dependency sets, then run the aggregate gate from the repository root:

```bash
npm --prefix backend ci
npm --prefix frontend ci
node scripts/release-check.cjs
```

The component gates can also be run independently when isolating a failure:

```bash
cd backend
npm run lint:check
npm run contracts:compile
npm run contracts:check
npm run release:check

cd ../frontend
npm run smoke:production
npm run release:check
```

- `lint:check` reports ESLint failures without applying fixes.
- `contracts:compile` uses the checked-in `solc` dependency without Base RPC access.
- `contracts:check` deploys all three contracts to a deterministic in-memory EthereumJS VM and exercises their core behavior without deployment keys.
- `smoke:production` builds and starts Next in production mode while keeping the real local mock backend for BFF/security coverage.

Do not start a production rollout if the aggregate gate or any required component gate is failing.

### 2. Confirm Backend Production Settings

In Render, confirm:

- backend service points at the correct production PostgreSQL database
- backend service has all required env values
- backend build command is valid for Nest production builds
- backend start command uses the compiled runtime

Safe expected commands:

```bash
# build
npm ci --include=dev && npm run build

# start
npm run start:prod
```

### 3. Deploy Backend

Trigger the backend deploy on Render and wait for startup success.

Do not stop here.

At this point the service may be alive while the app is still unusable.

### 4. Verify Automatic Database Migrations

Inspect the Render startup logs from `npm run start:prod` before running any seed or frontend verification.

Expected outcome:

- the production wrapper acquires its PostgreSQL advisory lock
- compiled migrations finish without SQL or connectivity errors
- the advisory lock is released and Nest starts only after migration success
- no separate TypeORM migration command is started by an operator or a second instance

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

If you must run the reference seed from a machine outside Render against external Render Postgres, the connection path must be SSL-aware.

Important:

- external Render Postgres can reject non-SSL connections with `SSL/TLS required`

Preferred rule:

- use the Render backend shell for production seed operations whenever possible

If an external path is unavoidable:

- ensure the seed execution path explicitly enables SSL for the Postgres client
- do not introduce a second migration owner outside `npm run start:prod`

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

- Backend startup wrapper cannot acquire the migration lock or apply migrations.
- Migrations were applied but reference seed data was not loaded.
- Operator uses `DB_USERNAME` instead of `DB_USER`.
- Frontend `BACKEND_URL` is set, so proxying starts, but backend DB rollout is incomplete.
- External Render Postgres is targeted from a local machine without SSL-aware seed execution.
- Rollout is judged only by Render health or root URL response instead of BubbleDrop endpoints.
- Frontend is redeployed before direct backend endpoint verification is complete.

## What Should Be Automated Next

- Monitor automatic migration-lock acquisition, completion, and release in startup logs.
- Automate reference seed for fresh production databases or first-run environments.
- Add a production readiness check that verifies BubbleDrop endpoints, not just process health.
- Version the provider-side deploy configuration so build, start, and env contracts do not drift in UI-only configuration.
- Add a documented SSL-aware operational script for external Render Postgres seed flows.
- Make frontend rollout completion dependent on successful backend verification.

## Rollout Completion Gate

Do not mark the rollout complete until this final statement is true:

`Backend started successfully, migrations applied, reference seed applied, direct backend checks passed, frontend proxy checks passed.`
