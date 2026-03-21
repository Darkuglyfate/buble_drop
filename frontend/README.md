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
NEXT_PUBLIC_ONCHAIN_STREAK_CONTRACT_ADDRESS=
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

Base App / mini app compatibility env values:

```bash
NEXT_PUBLIC_BASE_APP_ID=69b7314fd6271e8cedf2addb
NEXT_PUBLIC_ONCHAIN_STREAK_CONTRACT_ADDRESS=
MINIKIT_ACCOUNT_ASSOCIATION_HEADER=
MINIKIT_ACCOUNT_ASSOCIATION_PAYLOAD=
MINIKIT_ACCOUNT_ASSOCIATION_SIGNATURE=
```

`NEXT_PUBLIC_BASE_APP_ID` controls the embed metadata published by the main app.
`NEXT_PUBLIC_ONCHAIN_STREAK_CONTRACT_ADDRESS` is required for the user-paid daily check-in wallet transaction on Base.

`MINIKIT_ACCOUNT_ASSOCIATION_*` are optional in local development. If omitted, the repo falls back to the currently checked-in production manifest credentials. Before production publishing, verify these values against the live domain in Base preview tooling.

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

## Base App manifest flow

The main BubbleDrop frontend now treats `frontend/minikit.config.ts` as the manifest source of truth.

Runtime approach:

- keep the main app as a standard web app using `Base Account + wagmi + viem`
- use MiniKit-style manifest compatibility only for Base App publishing metadata
- do not inject MiniKit into gameplay runtime
- do not use OnchainKit in the main app

Manifest output:

- source config: `frontend/minikit.config.ts`
- served manifest: `frontend/app/.well-known/farcaster.json/route.ts`

This route replaces the need to maintain a separate static manifest by hand.

Preview/publishing notes:

- verify `/.well-known/farcaster.json` on the deployed domain
- verify `fc:frame` and `base:app_id` metadata in the rendered home page
- if `MINIKIT_ACCOUNT_ASSOCIATION_*` are not set explicitly, confirm the checked-in association block still matches the production domain before publishing

## Production env contract

The explicit production checklist now lives in `frontend/PRODUCTION_ENV_CHECKLIST.md`.
