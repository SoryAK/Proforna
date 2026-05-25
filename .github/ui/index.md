# Resumsify UI Design Graph — Index

Last updated: 2026-05-25

## Purpose
This graph is the single navigable source of truth for all UI decisions in Resumsify.
It is a graph, not a monolithic document. Read only what is relevant to your current task.

## How to use (mandatory pre-read order)
1. Read **`tokens.md`** — the centralized color, scale, and brand tokens. Always first.
2. Find your feature area in the table below and read its file.
3. If no feature file exists yet, derive from the nearest existing component and create a stub.

## Feature → File Map

| Feature area | File | Status |
|---|---|---|
| App-wide tokens (colors, scale, brand) | `tokens.md` | Active |
| Shared component patterns (buttons, states, layouts) | `global.md` | Active |
| Worklog (3-pane notes shell) | `worklog.md` | Active |
| Resume builder | `resume.md` | Stub |
| Job map | `maps.md` | Stub |

## Governance rules (non-negotiable)

1. **Tokens live in `tokens.md` only.** Feature files reference tokens by name. They never define new values.
2. **New token = edit `tokens.md` first.** Then reference it in feature files. No exceptions.
3. **End of session = UI Graph Keeper runs.** Any pattern introduced during the session must be captured before the handoff is written (Phase 4, step 3).
4. **File size limit: 150 lines per file.** If a feature file exceeds 150 lines, split it and update this index.

## How to read token references
Feature files use shorthand like `→ tokens.brand.primary`. This means: look up `brand.primary`
in `tokens.md` for the exact Tailwind classes to apply.
