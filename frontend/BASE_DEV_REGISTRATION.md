# BubbleDrop Base.dev Registration Package

This file captures the minimum metadata package that is ready to paste into Base.dev, plus the repo-side gaps that still need manual completion before registration.

## Registration-ready fields

- App name: `BubbleDrop`
- Tagline: `Daily Base check-ins, active bubble sessions, and gated rare rewards.`
- Description: `BubbleDrop is a mobile-first Base app where players return for daily check-ins, active bubble sessions, XP progression, and transparent partner token reward paths.`
- Category suggestion: `games`
- Primary URL field:
  - expected production URL: `https://bubledrop.vercel.app`
  - repo env field: `NEXT_PUBLIC_APP_URL`
- Builder code placement:
  - keep it in Base.dev project settings at registration time
  - do not hardcode it into frontend runtime metadata unless a later integration explicitly needs it

## Asset inventory

### Already present in repo

- Existing app icon source: `frontend/app/favicon.ico`

### Still missing for a clean Base.dev listing

- A polished square BubbleDrop app icon suitable for listing use
- At least one real BubbleDrop screenshot taken from the production UI
- Preferably 2-3 screenshots that show:
  - home or profile progression
  - active bubble session
  - rewards or partner token transparency
- A social or preview image for richer external link sharing

## Repo-side status

### Already registration-ready

- Next.js frontend metadata now exposes:
  - app title
  - description
  - canonical URL support
  - Open Graph title and description
  - Twitter summary metadata
- Production app URL has a dedicated env field: `NEXT_PUBLIC_APP_URL`
- Current product positioning stays aligned with BubbleDrop PRD v1:
  - daily habit loop
  - active bubble sessions
  - XP progression
  - gated rare rewards
  - partner token transparency

### Still manual outside the repo

- Register the app in Base.dev
- Fill the Base.dev listing fields with the values above
- Upload final icon and screenshots
- Set the primary URL to the production frontend domain
- Add the builder code in Base.dev if you plan to attribute installs or traffic

## Notes

- This package is intentionally minimal and MVP-safe. It does not introduce new product claims beyond the current PRD positioning.
- `games` is the best single category suggestion for the current BubbleDrop MVP because the core loop is daily gameplay plus progression. If Base.dev's available category list makes `social` a better fit for your listing strategy, that can be chosen manually without changing repo behavior.
