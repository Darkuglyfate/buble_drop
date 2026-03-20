# AGENTS.md

Project: BubbleDrop / BASEUPP

This file is the mandatory safety protocol for all future edits in this project.

## Required protocol

- Always read `AGENTS.md` before making edits.
- `frontend/app/ui/bubbledrop-shell.tsx` is a high-risk file.
- `frontend/app/ui/welcome-intro-screen.tsx` is the preferred file for welcome visual changes.
- Do not edit `frontend/app/ui/bubbledrop-shell.tsx` for UI-only tasks.
- Classify every task as `UI-only`, `logic-only`, or `refactor-only` before editing.
- Never mix UI and logic changes in one uncontrolled edit.
- Prefer minimal safe diffs and preserve behavior unless explicitly asked to change it.
- Decorative bubbles must never block taps for real interactive elements.
- After meaningful changes, run relevant validation and report files changed, validations run, risks, and untouched sensitive areas.
- In future task reports, always start with: `Safety memo consulted: AGENTS.md`
- If `frontend/app/ui/bubbledrop-shell.tsx` is touched, also state: `High-risk file detected`

## Practical safety guidance

- Prefer zero-behavior refactors first.
- Extract small presentational components before larger UI changes.
- Do not change sign-in, gating, check-in, CTA, or home-flow logic unless explicitly required by the task.
- Inspect the current flow before editing uncertain areas.
- Use build and smoke checks before considering a change complete.
- Document what changed and what was intentionally not changed.
- If a change touches a risky flow, state the risk explicitly before editing.

## Task classification rule

Before editing, explicitly identify the task as one of:

- `UI-only`
- `logic-only`
- `refactor-only`

If the requested work includes more than one of these categories, split it into controlled steps instead of performing one mixed edit.

## High-risk file rule

`frontend/app/ui/bubbledrop-shell.tsx` controls sensitive product flows around:

- welcome / intro display
- onboarding transitions
- sign-in
- gating
- CTA behavior
- home-flow state

Treat this file as high-risk in every task.

## Welcome screen rule

For welcome / entry visual changes:

- Prefer editing `frontend/app/ui/welcome-intro-screen.tsx`.
- Avoid editing `frontend/app/ui/bubbledrop-shell.tsx` unless the task explicitly requires welcome logic changes.
- Preserve onboarding behavior, skip behavior, and tap/progress logic unless explicitly asked to change them.

## Validation and reporting rule

After meaningful changes:

1. Run the relevant validation commands.
2. Report the exact files changed.
3. Report the exact validations run.
4. Report any risks.
5. Report which sensitive areas were intentionally left untouched.
