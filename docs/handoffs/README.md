# Session Handoffs

Chronological session logs created by the **Handoff Architect** skill (see [`.github/copilot-instructions.md`](../../.github/copilot-instructions.md)).

Each file captures the state of a working session so the next session (human or AI) can resume without re-discovering context.

## Trigger

A new handoff is created **only** when the user explicitly says one of:

- "Wrap up"
- "Session End"
- "Handoff"

## Naming Convention

```
YYYY-MM-DD_HHmm_handoff.md
```

Examples: `2026-05-17_1730_handoff.md`, `2026-05-18_0915_handoff.md`

- 24-hour time, no separator inside `HHmm`
- One file per session — **never overwrite** older handoffs
- Files sort chronologically by filename

## Required Sections

Each handoff must contain (see [`_template.md`](./_template.md)):

1. **Current Sprint** — the high-level goal we are working toward
2. **Last Completed Step** — what was achieved in this specific session
3. **The "Live" Context** — variables, active logic paths, line numbers warm in memory
4. **Next Immediate Step** — the exact prompt to resume work
5. **Unresolved Blockers** — bugs, missing info, technical debt left open

## Reading Handoffs at Session Start

At the start of any new session, the agent's first priority is to **locate and read the most recent file** in this folder and summarize it to the user.

Find the latest with:

```powershell
Get-ChildItem docs/handoffs/*_handoff.md | Sort-Object Name -Descending | Select-Object -First 1
```
