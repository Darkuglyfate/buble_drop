# CODEX Safe Editing Memo

Project: BubbleDrop / BASEUPP

This memo is mandatory for all future edits in this project.

## Core safety rules

- High-risk file: `frontend/app/ui/bubbledrop-shell.tsx`
- Never mix UI changes and logic changes in one edit.
- Prefer zero-behavior refactors first.
- Extract small presentational components before larger UI changes.
- Do not change sign-in, gating, check-in, CTA, or home-flow logic unless explicitly required by the task.
- Make only small isolated diffs.
- Preserve current behavior unless the task explicitly asks to change behavior.
- Inspect the current flow before editing uncertain areas.
- After meaningful changes run the relevant validation commands.
- Use build and smoke checks before considering a change complete.
- Document what changed and what was intentionally not changed.
- If a change touches a risky flow, state the risk explicitly before editing.

## Mandatory workflow before edits

1. Read `CODEX_SAFE_EDITING_MEMO.md` first.
2. Identify whether the target file is high-risk.
3. State whether the task is UI-only, logic-only, or refactor-only.
4. Minimize scope and avoid unrelated edits.
5. Preserve behavior unless explicitly asked otherwise.
6. Run validation after changes.
7. Report changed files, validations run, risks, and untouched sensitive areas.
