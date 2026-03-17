# BubbleDrop mobile post-check feedback

Date: 2026-03-17
Scope: Base App-like mobile viewport pass (inventory, claims, season, referrals, leaderboard, partner transparency).

## Phone validation notes

- Performance: transitions and list rendering stay responsive in core menu flows. No blocking freeze reproduced during regular navigation.
- HUD readability: short status labels remain readable on compact width, but dense cards require tighter hierarchy and stronger chip grouping.
- Tap comfort: most action controls are comfortable; filter/select actions needed explicit minimum touch height in inventory.
- Pop animation visibility: reward/preview emphasis is visible, but before/after preview needed clearer side-by-side state to avoid ambiguity.

## P0 and P1 list

### P0 (breaks scenario)

- None currently open after this pass.

### P1 (hurts UX)

- `Fixed` Inventory lacked explicit slot model (`avatar`, `bubbleSkin`, `trail`, `badge`), which made equip intent unclear on mobile.
- `Fixed` Inventory had no practical filter system for obtained/equipped/rarity/season, causing long-scroll friction.
- `Fixed` No concrete before/after preview before apply; users could not confidently compare style outcome.
- `Monitoring` Keep validating that avatar equip through backend call remains stable with signed-in session in real phone runtime.

## Smoke checklist before next push

- Home -> season -> token detail -> partner transparency
- Home -> rewards inventory (filters, preview, equip)
- Home -> claim (eligibility + balance section)
- Home -> referrals
- Home -> leaderboard
- Session screen entry and return

Status: complete in local smoke run context after this iteration.
