## BubbleDrop Frontend Local Runtime

The BubbleDrop frontend is configured for local MVP development on `http://localhost:3001`.
The backend is expected to run on `http://localhost:3000`.

This default split avoids the local port conflict between Next.js and NestJS and matches the backend CORS setup.

## Env Quickstart

Create `frontend/.env.local` with:

```bash
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

- `NEXT_PUBLIC_BACKEND_URL` in the frontend env
- `FRONTEND_ORIGIN` in the backend env

`NEXT_PUBLIC_APP_URL` should point at the production frontend domain once BubbleDrop is deployed. The frontend uses it for canonical and social metadata, and it is also the expected primary URL value for Base.dev registration.

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
