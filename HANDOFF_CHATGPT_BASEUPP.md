# 13. Minimal handoff bundle for ChatGPT

## BLOCK_A_TREE
```text
C:\Users\Èëüÿ\Desktop\baseupp
+- .cursor/
+- .git/
+- backend/
¦  +- .env.example
¦  +- .env.local
¦  +- README.md
¦  +- nest-cli.json
¦  +- package.json
¦  +- tsconfig.json
¦  +- tsconfig.build.json
¦  L- src/
¦     +- database/
¦     ¦  L- migrations/
¦     ¦     +- 1741950000000-InitialBubbleDropSchema.ts
¦     ¦     +- 1741990000000-AddMvpInvariantPartialIndexes.ts
¦     ¦     +- 1741995000000-AddSingleActiveSeasonInvariant.ts
¦     ¦     +- 1741996000000-AddTokenClaimProcessedAt.ts
¦     ¦     +- 1742100000000-AddEquippedStyleSnapshotToProfiles.ts
¦     ¦     +- 1742205000000-AddAvatarPaletteKey.ts
¦     ¦     L- README.md
¦     +- modules/
¦     ¦  +- auth-session/
¦     ¦  +- bubble-session/
¦     ¦  +- check-in/
¦     ¦  +- claim/
¦     ¦  +- partner-token/
¦     ¦  +- profile/
¦     ¦  +- qualification/
¦     ¦  +- rewards/
¦     ¦  L- wallet-binding/
¦     +- redis/
¦     L- scripts/
¦        +- deploy-daily-check-in-streak.ts
¦        L- seed-reference-data.ts
+- bubble/
¦  +- README.md
¦  +- package.json
¦  +- next.config.ts
¦  +- farcaster.config.ts
¦  +- app/
¦  L- public/
+- frontend/
¦  +- .env.example
¦  +- README.md
¦  +- next.config.ts
¦  +- package.json
¦  +- playwright.config.ts
¦  +- tsconfig.json
¦  +- app/
¦  ¦  +- api/
¦  ¦  +- claim/
¦  ¦  +- inventory/
¦  ¦  +- leaderboard/
¦  ¦  +- partner-tokens/
¦  ¦  +- referrals/
¦  ¦  +- season/
¦  ¦  +- session/
¦  ¦  +- token/
¦  ¦  L- ui/
¦  ¦     +- bubbledrop-shell.tsx
¦  ¦     +- bubble-session-play-screen.tsx
¦  ¦     +- claim-screen.tsx
¦  ¦     +- leaderboard-screen.tsx
¦  ¦     +- partner-token-transparency-screen.tsx
¦  ¦     +- referral-progress-screen.tsx
¦  ¦     +- rewards-inventory-screen.tsx
¦  ¦     +- season-hub-screen.tsx
¦  ¦     L- token-detail-screen.tsx
¦  +- public/
¦  L- smoke/
¦     L- bubbledrop.smoke.spec.ts
+- .gitignore
+- docker-compose.local.yml
+- render.yaml
+- PRODUCTION_ROLLOUT_CHECKLIST.md
+- SESSION_DEV_BYPASS_MEMO.md
+- Bubble Drop Prd V1.pdf
+- Bubble Drop Ai Agent Rules.pdf
+- Bubble Drop Agents Md.pdf
+- Bubble Drop First Dev Task Prompt.pdf
+- design-bubble-world-variants.html
+- design-drop-cards-preview.html
+- design-drop-cards-preview-v2.html
+- design-drop-cards-preview-v3.html
+- design-drop-cards-variants-v1.html
L- design-drop-cards-variants-v2.html
```

## BLOCK_B_RUN_COMMANDS
```bash
# project root
cd C:\Users\Èëüÿ\Desktop\baseupp

# frontend install / dev
cd frontend
npm install
npm run dev

# frontend checks
npm run lint
npm run build
npm run smoke
npm run smoke:headed

# backend install / dev
cd ..\backend
npm install
npm run start:dev

# backend local infra
npm run dev:services:up
npm run dev:services:logs
npm run dev:services:down

# backend DB bootstrap
npm run db:migration:run
npm run db:seed:reference-data
npm run db:bootstrap:local

# backend checks
npm run lint
npm run test
npm run test:e2e
npm run test:cov
npm run build

# backend production start
npm run start:prod
npm run start:prod:skip-migrate

# backend typeorm helpers
npm run db:migration:show
npm run db:migration:create
npm run db:migration:generate
npm run db:migration:revert

# optional root-level docker compose direct usage
docker compose -f docker-compose.local.yml up -d postgres redis
docker compose -f docker-compose.local.yml down
docker compose -f docker-compose.local.yml logs -f postgres redis
```

## BLOCK_C_KEY_FILES
```text
=== FILE: C:\Users\Èëüÿ\Desktop\baseupp\frontend\package.json ===
{
  "name": "frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "lint": "eslint",
    "smoke": "playwright test",
    "smoke:headed": "playwright test --headed"
  },
  "dependencies": {
    "@base-org/account": "^2.5.2",
    "@tanstack/react-query": "^5.90.21",
    "framer-motion": "^12.38.0",
    "next": "16.1.6",
    "posthog-js": "^1.360.2",
    "react": "19.2.3",
    "react-dom": "19.2.3",
    "viem": "^2.47.4",
    "wagmi": "^3.5.0"
  },
  "devDependencies": {
    "@playwright/test": "^1.55.1",
    "@tailwindcss/postcss": "^4",
    "@types/node": "^20",
    "@types/react": "^19",
    "@types/react-dom": "^19",
    "eslint": "^9",
    "eslint-config-next": "16.1.6",
    "tailwindcss": "^4",
    "typescript": "^5"
  }
}

=== FILE: C:\Users\Èëüÿ\Desktop\baseupp\backend\package.json ===
{
  "name": "backend",
  "version": "0.0.1",
  "description": "",
  "author": "",
  "private": true,
  "license": "UNLICENSED",
  "scripts": {
    "build": "nest build",
    "format": "prettier --write \"src/**/*.ts\" \"test/**/*.ts\"",
    "start": "node dist/main",
    "start:dev": "nest start --watch",
    "start:debug": "nest start --debug --watch",
    "start:prod": "node scripts/start-production.cjs",
    "start:prod:skip-migrate": "node dist/main",
    "typeorm": "node -r ts-node/register -r tsconfig-paths/register ./node_modules/typeorm/cli.js -d src/database/typeorm.datasource.ts",
    "db:migration:create": "npm run typeorm -- migration:create src/database/migrations/ManualMigration",
    "db:migration:generate": "npm run typeorm -- migration:generate src/database/migrations/AutoSchemaMigration",
    "db:migration:run": "npm run typeorm -- migration:run",
    "db:migration:revert": "npm run typeorm -- migration:revert",
    "db:migration:show": "npm run typeorm -- migration:show",
    "seed:reference-data": "ts-node -r tsconfig-paths/register src/scripts/seed-reference-data.ts",
    "db:seed:reference-data": "npm run seed:reference-data",
    "deploy:daily-check-in-streak": "ts-node -r tsconfig-paths/register src/scripts/deploy-daily-check-in-streak.ts",
    "dev:services:up": "docker compose -f ../docker-compose.local.yml up -d postgres redis",
    "dev:services:down": "docker compose -f ../docker-compose.local.yml down",
    "dev:services:logs": "docker compose -f ../docker-compose.local.yml logs -f postgres redis",
    "db:bootstrap:local": "npm run dev:services:up && npm run db:migration:run && npm run db:seed:reference-data",
    "lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix",
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json"
  },
  "dependencies": {
    "@nestjs/common": "^11.0.1",
    "@nestjs/config": "^4.0.3",
    "@nestjs/core": "^11.0.1",
    "@nestjs/platform-express": "^11.0.1",
    "@nestjs/typeorm": "^11.0.0",
    "ioredis": "^5.10.0",
    "pg": "^8.20.0",
    "reflect-metadata": "^0.2.2",
    "rxjs": "^7.8.1",
    "typeorm": "^0.3.28",
    "viem": "^2.47.4"
  },
  "devDependencies": {
    "@eslint/eslintrc": "^3.2.0",
    "@eslint/js": "^9.18.0",
    "@nestjs/cli": "^11.0.0",
    "@nestjs/schematics": "^11.0.0",
    "@nestjs/testing": "^11.0.1",
    "@types/express": "^5.0.0",
    "@types/jest": "^30.0.0",
    "@types/node": "^22.10.7",
    "@types/supertest": "^6.0.2",
    "eslint": "^9.18.0",
    "eslint-config-prettier": "^10.0.1",
    "eslint-plugin-prettier": "^5.2.2",
    "globals": "^16.0.0",
    "jest": "^30.0.0",
    "prettier": "^3.4.2",
    "solc": "^0.8.34",
    "source-map-support": "^0.5.21",
    "supertest": "^7.0.0",
    "ts-jest": "^29.2.5",
    "ts-loader": "^9.5.2",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.7.3",
    "typescript-eslint": "^8.20.0"
  },
  "jest": {
    "moduleFileExtensions": [
      "js",
      "json",
      "ts"
    ],
    "rootDir": "src",
    "testRegex": ".*\\.spec\\.ts$",
    "transform": {
      "^.+\\.(t|j)s$": "ts-jest"
    },
    "collectCoverageFrom": [
      "**/*.(t|j)s"
    ],
    "coverageDirectory": "../coverage",
    "testEnvironment": "node"
  }
}

=== FILE: C:\Users\Èëüÿ\Desktop\baseupp\frontend\README.md ===
## BubbleDrop Frontend Local Runtime

The BubbleDrop frontend is configured for local MVP development on `http://localhost:3001`.
The backend is expected to run on `http://localhost:3000`.

This default split avoids the local port conflict between Next.js and NestJS and matches the backend CORS setup.

## Env Quickstart

Create `frontend/.env.local` with:

```bash
BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=https://bubledrop.vercel.app
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

You can also copy from `frontend/.env.example`.

`NEXT_PUBLIC_POSTHOG_KEY` is optional for local development. When omitted, analytics stays disabled and the app keeps current MVP behavior.

## Local Startup

1. Start the backend from `backend/`.
2. Start the frontend from `frontend/`.

Frontend commands:

```bash
npm install
npm run dev
```

The frontend dev server runs on:

```text
http://localhost:3001
```

## Expected Backend Pairing

For the default local setup, backend should expose:

```text
http://localhost:3000
```

And `backend/.env.local` or `backend/.env` should allow the frontend origin:

```bash
FRONTEND_ORIGIN=http://localhost:3001
```

If you change either port, update both:

- `BACKEND_URL` in the frontend env
- `NEXT_PUBLIC_BACKEND_URL` in the frontend env
- `FRONTEND_ORIGIN` in the backend env

`NEXT_PUBLIC_APP_URL` should point at the production frontend domain once BubbleDrop is deployed. The frontend uses it for canonical and social metadata, and it is also the expected primary URL value for Base.dev registration.

For production, the current repo expects the frontend server-side proxy to know the backend origin. Set `BACKEND_URL` to the deployed backend URL. Keep `NEXT_PUBLIC_BACKEND_URL` aligned as the compatibility fallback for the current app.

## Production Build Check

```bash
npm run build
```

## Browser smoke coverage

The frontend now includes a minimal Playwright smoke suite in `frontend/smoke/`.

It is intentionally lightweight:

- it runs against the local frontend
- it mocks BubbleDrop backend API responses in-browser
- it covers core MVP flows without requiring a live database

Covered smoke paths:

- wallet connect / bootstrap entry affordances
- onboarding completion
- daily check-in
- session completion reward reveal
- claim gating
- season / token / transparency navigation

Run it from `frontend/`:

```bash
npm run smoke
```

If you want a visible browser:

```bash
npm run smoke:headed
```

## Base.dev registration prep

The repo now includes a minimal registration-ready metadata package in `frontend/BASE_DEV_REGISTRATION.md`.

Use it to prepare:

- app name
- tagline
- description
- category suggestion
- expected production URL
- current asset inventory and missing listing assets
- manual Base.dev steps that still happen outside the repo

## Production env contract

The explicit production checklist now lives in `frontend/PRODUCTION_ENV_CHECKLIST.md`.

=== FILE: C:\Users\Èëüÿ\Desktop\baseupp\backend\README.md ===
<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## BubbleDrop local services

BubbleDrop backend expects local PostgreSQL and Redis on the default ports already present in `backend/.env.example`:

```bash
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=bubbledrop

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
```

The repo now includes a minimal local bootstrap at `../docker-compose.local.yml` with:

- PostgreSQL `16` on `localhost:5432`
- Redis `7` on `localhost:6379`

If you want to keep the default local setup, you usually do not need to change backend env values at all.

### Local BubbleDrop bootstrap

From `backend/`:

```bash
# start postgres + redis
$ npm run dev:services:up

# run schema migrations
$ npm run db:migration:run

# seed MVP reference data
$ npm run db:seed:reference-data

# start backend
$ npm run start:dev
```

Or run the one-shot DB bootstrap:

```bash
$ npm run db:bootstrap:local
```

Useful helpers:

```bash
# stream local postgres + redis logs
$ npm run dev:services:logs

# stop local services
$ npm run dev:services:down
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode (runs DB migrations first, then API)
$ npm run start:prod

# production without migrations (emergency only)
$ npm run start:prod:skip-migrate
```

### Production deploy (Render, Railway, VPS)

1. Set `NODE_ENV=production`, `FRONTEND_ORIGIN`, `DB_*` (or compatible Postgres URL via env your host provides), `AUTH_SESSION_SECRET`, etc.
2. Build: `npm ci && npm run build`
3. Start: **`npm run start:prod`** — on each deploy this **applies pending TypeORM migrations** then starts Nest. No manual `db:migration:run` on the server unless you prefer it.
4. After **first** production DB setup, run reference seed once if your checklist requires it: `npm run db:seed:reference-data` (needs DB env; may use Render shell).
5. To disable auto-migrate: `RUN_MIGRATIONS_ON_START=0 npm run start:prod` (not recommended).

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Deployment

### Render

For low-memory Render instances, do not start the backend with the Nest CLI runtime.
Use the compiled production entry instead:

```bash
# build command
npm install && npm run build

# start command
npm run start
```

`npm run start` now runs `node dist/main`, which is the same lightweight production path as `npm run start:prod`.

Required Render runtime env values:

```bash
NODE_ENV=production
PORT=<provided by Render>
FRONTEND_ORIGIN=https://your-frontend.example.com
AUTH_SESSION_SECRET=<long-random-secret>
DB_HOST=...
DB_PORT=5432
DB_USER=...
DB_PASSWORD=...
DB_NAME=...
REDIS_HOST=...
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
BASE_RPC_URL=https://your-stable-base-mainnet-rpc
```

If live reward-wallet payout is intended for launch, also set:

```bash
REWARD_WALLET_ADDRESS=0x...
REWARD_WALLET_PRIVATE_KEY=0x...
```

=== FILE: C:\Users\Èëüÿ\Desktop\baseupp\frontend\next.config.ts ===
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_SMOKE_TEST_SERVER === "1" ? ".next-smoke" : ".next",
};

export default nextConfig;

=== FILE: C:\Users\Èëüÿ\Desktop\baseupp\frontend\playwright.config.ts ===
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./smoke",
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:3002",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: {
    command: "npx next dev --port 3002",
    url: "http://127.0.0.1:3002",
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_BACKEND_URL: "http://localhost:3000",
      NEXT_PUBLIC_SMOKE_TEST_MODE: "1",
      NEXT_SMOKE_TEST_SERVER: "1",
      NEXT_PUBLIC_POSTHOG_KEY: "",
      NEXT_PUBLIC_POSTHOG_HOST: "https://us.i.posthog.com",
    },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
      },
    },
    {
      name: "mobile-chrome",
      use: {
        ...devices["Pixel 7"],
      },
    },
  ],
});

=== FILE: C:\Users\Èëüÿ\Desktop\baseupp\frontend\.env.example ===
BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
NEXT_PUBLIC_APP_URL=https://bubledrop.vercel.app
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

=== FILE: C:\Users\Èëüÿ\Desktop\baseupp\backend\.env.example ===
PORT=3000
# Comma-separated allowlist. In production include the deployed BubbleDrop frontend origin.
FRONTEND_ORIGIN=http://localhost:3001

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=bubbledrop

REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Use a stable Base mainnet RPC in production.
BASE_RPC_URL=https://mainnet.base.org
# Replace this before any production deploy. Do not keep the example value.
AUTH_SESSION_SECRET=replace-with-a-long-random-string
# Optional until live payout is enabled. Must match the signer derived from REWARD_WALLET_PRIVATE_KEY.
REWARD_WALLET_ADDRESS=0x0000000000000000000000000000000000000000
# Optional until live payout is enabled. Must be a 32-byte hex private key when set.
REWARD_WALLET_PRIVATE_KEY=
# Enable onchain daily check-in streak writes (1 = enabled, 0 = disabled).
ONCHAIN_STREAK_ENABLED=0
# Deployed DailyCheckInStreak contract address on Base mainnet.
ONCHAIN_STREAK_CONTRACT_ADDRESS=
# Single-key mode: one private key for deploy + writer signer.
ONCHAIN_STREAK_PRIVATE_KEY=
# Private key for the authorized contract writer (backend signer).
ONCHAIN_STREAK_SIGNER_PRIVATE_KEY=
# Optional safety check: expected signer address derived from ONCHAIN_STREAK_SIGNER_PRIVATE_KEY.
ONCHAIN_STREAK_SIGNER_ADDRESS=
ONBOARDING_XP_AMOUNT=20

# QA override: unlock and allow applying all skins (1 = enabled, 0 = disabled).
BUBBLEDROP_TEST_UNLOCK_ALL_SKINS=0

=== FILE: C:\Users\Èëüÿ\Desktop\baseupp\docker-compose.local.yml ===
services:
  postgres:
    image: postgres:16-alpine
    container_name: bubbledrop-postgres
    environment:
      POSTGRES_DB: bubbledrop
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports:
      - "5432:5432"
    volumes:
      - bubbledrop-postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres -d bubbledrop"]
      interval: 5s
      timeout: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    container_name: bubbledrop-redis
    command: ["redis-server", "--save", "", "--appendonly", "no"]
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  bubbledrop-postgres-data:

=== FILE: C:\Users\Èëüÿ\Desktop\baseupp\render.yaml ===
# Optional Render Blueprint (from repo root). In Dashboard set FRONTEND_ORIGIN,
# AUTH_SESSION_SECRET, DB_HOST/DB_USER/DB_PASSWORD/DB_NAME, REDIS_*, etc.

services:
  - type: web
    name: buble-drop-api
    runtime: node
    buildCommand: cd backend && npm ci && npm run build
    startCommand: cd backend && npm run start:prod
    envVars:
      - key: NODE_ENV
        value: production
```

## BLOCK_D_ARCHITECTURE
```text
Project type:
- Split app: Next.js frontend + NestJS backend.
- Main project path: C:\Users\Èëüÿ\Desktop\baseupp
- Primary active app is frontend/ + backend/.
- bubble/ is a separate mini-app/demo and not the main BubbleDrop runtime.

Frontend:
- Next.js app router.
- Main home/menu shell lives in frontend/app/ui/bubbledrop-shell.tsx.
- Game/session UI lives in frontend/app/ui/bubble-session-play-screen.tsx.
- Other sections have dedicated screen components:
  claim, inventory, leaderboard, partner tokens, referrals, season, token detail.
- Frontend talks to backend via /api/bubbledrop proxy routes and env-configured backend URL.
- Wallet/auth flow is Base-oriented:
  wallet connect -> Sign in with Base -> sync/load profile -> menu -> play/check-in/etc.
- Playwright smoke tests mock backend API in-browser and verify core user flows.

Backend:
- NestJS modular backend with TypeORM.
- Core modules:
  auth-session: sign-in nonce/verify session
  profile: onboarding, wallet/profile summary, avatar/style/profile state
  check-in: daily check-in flow
  bubble-session: start/activity/complete run
  qualification: season qualification logic
  rewards: XP + rare reward handling
  claim: claimable balances and token claim flow
  partner-token: season hub, token transparency, referrals
  wallet-binding: access checks tying wallet to profile/session
- PostgreSQL stores product state.
- Redis exists for backend support/runtime caching.
- Migrations are in backend/src/database/migrations.
- Reference seed script is required for MVP data like starter avatars.

Operational flow:
- Local dev:
  docker-compose for postgres/redis
  backend migrations + seed
  backend on :3000
  frontend on :3001
- Smoke tests:
  frontend launches isolated Next dev server on :3002 and mocks API.
- Production:
  backend expected on Render
  frontend expected on Vercel
  backend start:prod runs migrations automatically before Nest starts.

Practical “where to edit what”:
- Home/menu UX and CTA logic:
  frontend/app/ui/bubbledrop-shell.tsx
- In-session gameplay UX:
  frontend/app/ui/bubble-session-play-screen.tsx
- Browser regression coverage:
  frontend/smoke/bubbledrop.smoke.spec.ts
- Daily check-in backend behavior:
  backend/src/modules/check-in/*
- Session backend behavior:
  backend/src/modules/bubble-session/*
- Claim flow:
  backend/src/modules/claim/*
- Profile summary and season state:
  backend/src/modules/profile/*
  backend/src/modules/qualification/*
  backend/src/modules/rewards/*
```

## BLOCK_E_ENV_AND_RISKS
```text
Frontend env vars:
- BACKEND_URL=http://localhost:3000
- NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
- NEXT_PUBLIC_APP_URL=https://bubledrop.vercel.app
- NEXT_PUBLIC_POSTHOG_KEY=
- NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com

Backend env vars:
- PORT=3000
- FRONTEND_ORIGIN=http://localhost:3001
- DB_HOST=localhost
- DB_PORT=5432
- DB_USER=postgres
- DB_PASSWORD=postgres
- DB_NAME=bubbledrop
- REDIS_HOST=localhost
- REDIS_PORT=6379
- REDIS_PASSWORD=
- REDIS_DB=0
- BASE_RPC_URL=https://mainnet.base.org
- AUTH_SESSION_SECRET=replace-with-a-long-random-string
- REWARD_WALLET_ADDRESS=0x...
- REWARD_WALLET_PRIVATE_KEY=
- ONCHAIN_STREAK_ENABLED=0
- ONCHAIN_STREAK_CONTRACT_ADDRESS=
- ONCHAIN_STREAK_PRIVATE_KEY=
- ONCHAIN_STREAK_SIGNER_PRIVATE_KEY=
- ONCHAIN_STREAK_SIGNER_ADDRESS=
- ONBOARDING_XP_AMOUNT=20
- BUBBLEDROP_TEST_UNLOCK_ALL_SKINS=0

Production expectations:
- Frontend prod domain appears to be https://bubledrop.vercel.app
- Backend prod domain in docs appears to be https://buble-drop.onrender.com
- FRONTEND_ORIGIN and frontend BACKEND_URL vars must stay aligned.

Known practical risks:
1. The main home screen logic is concentrated in one large file:
   frontend/app/ui/bubbledrop-shell.tsx
   This speeds iteration but increases regression risk for UI state changes.
2. Smoke tests are strong for core flows, but they use mocked backend responses.
   Passing smoke does not guarantee real backend/env correctness.
3. Fresh production DB requires both migrations and reference seed.
   Missing seed can break UI surfaces like starter avatars.
4. Backend env naming is strict:
   use DB_USER, not DB_USERNAME.
5. Auth/session and wallet gating are easy to weaken accidentally during UI work.
   SESSION_DEV_BYPASS_MEMO.md explicitly warns against shipping bypass logic.
6. Onchain streak / reward wallet env vars are optional until launch-critical flows are enabled,
   but become high-risk once activated because signer mismatch can break payout/check-in writes.
7. Next.js dev warning about allowedDevOrigins exists in smoke/dev context.
   Not a current blocker, but should be cleaned later.

Current blockers:
- No structural blocker found for local development.
- Main caution areas are env correctness, migration/seed discipline, and avoiding regressions in home CTA/auth flow.
```

# 14. Current Status Snapshot

## STATUS_SUMMARY
```text
Branch: main
Latest pushed commit: 8700b2f fix: gate post-sign-in home actions

Recent home-screen work status:
- Welcome screen now returns on each fresh app open; localStorage intro persistence was removed.
- skipIntro=1 remains as a temporary bypass, stabilized with a sessionStorage flag for remount/dev behavior.
- Hero/profile/menu CTA flow was revised several times and is currently gated so post-sign-in home actions appear only after a real Sign in with Base state.
- Tap to play placement and Daily Check-in card layout were adjusted to better match the provided mobile references.
- Production build and frontend smoke suite were green at the last verification point.

Last verified checks during recent CTA/auth fix:
- frontend: npm run build -> passed
- frontend: npm run smoke -> 16 passed

Current untracked files in repo root:
- HANDOFF_CHATGPT_BASEUPP.md
- baseupp_files.txt
- baseupp_tree.txt

Note:
- The handoff file itself is documentation only and does not affect frontend/backend runtime.
- The two additional txt files look like auxiliary local inventory outputs and are not part of the tracked app runtime.
```

## RECENT_COMMITS
```text
8700b2f fix: gate post-sign-in home actions
31119ca fix: restore separate daily check-in card
90f6626 fix: raise daily mission play cta
1505482 fix: resolve home cta build error
a7822c5 fix: move play cta into daily mission
b9b2065 fix: restore home CTA flow
ba162f4 fix: restore welcome CTA and helper flight
ed3f264 fix: unify session CTA and premium helper
```

## RECENT_CHANGE_CONTEXT
```text
8700b2f
- Gated the new post-sign-in home layout so it appears only after real app sign-in.
- Fixed the remaining TypeScript/render branch around home CTA logic.

31119ca
- Restored a separate Daily Check-in card below the Daily Mission + Drop Radar area.
- Kept Tap to play in Daily Mission instead of mixing it into the wrong zone.

90f6626
- Nudged the Tap to play placement upward for better visual alignment in Daily Mission.

1505482
- Fixed a home CTA build error that broke Vercel/Next production compilation.

a7822c5
- Moved play CTA into Daily Mission as part of the layout corrections.

b9b2065
- Restored the broader home CTA flow around sign-in / check-in / play transitions.

ba162f4
- Restored welcome CTA behavior and improved helper flight presentation.

ed3f264
- Earlier attempt to unify session CTA and premium/helper behavior before later home-flow refinements.
```
