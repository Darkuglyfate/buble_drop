# BubbleDrop PostHog MVP Analytics

This document captures the minimal approved PostHog instrumentation currently wired for BubbleDrop MVP flows.

## Analytics provider

- Provider: `posthog-js`
- Initialization: `frontend/app/analytics.ts`
- Bootstrap: `frontend/app/providers.tsx`
- Analytics stays disabled until `NEXT_PUBLIC_POSTHOG_KEY` is set
- Autocapture is intentionally disabled

## MVP events currently tracked

- `bubbledrop_app_started`
  - app start
  - emitted from home shell boot
- `bubbledrop_profile_bootstrap_completed`
  - profile bootstrap from connected wallet
- `bubbledrop_onboarding_completed`
  - onboarding completion confirmed by backend
- `bubbledrop_daily_check_in_completed`
  - daily check-in success
- `bubbledrop_bubble_session_started`
  - bubble session start confirmed by backend
- `bubbledrop_bubble_session_completed`
  - bubble session completion confirmed by backend
- `bubbledrop_claim_requested`
  - claim request created
- `bubbledrop_partner_transparency_opened`
  - user opened the partner transparency surface from home
- `bubbledrop_partner_transparency_viewed`
  - partner transparency screen loaded from backend
- `bubbledrop_token_detail_opened`
  - user opened token detail from the season hub
- `bubbledrop_token_detail_viewed`
  - token detail screen loaded from backend

## Supporting events already present

- `bubbledrop_frontend_base_sign_in_completed`
  - verified frontend sign-in success
- `bubbledrop_partner_market_link_opened`
  - outbound market link click from transparency
- `bubbledrop_token_market_link_opened`
  - outbound market link click from token detail

## Required env

Frontend:

```bash
NEXT_PUBLIC_POSTHOG_KEY=
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

## Notes

- This map is intentionally MVP-only.
- No speculative retention funnels, Phase 2 cohorts, or extra passive events are included.
- If `NEXT_PUBLIC_POSTHOG_KEY` is empty, BubbleDrop keeps current behavior and no analytics events are sent.

