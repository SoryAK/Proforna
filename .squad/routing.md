# Work Routing

How to decide who handles what.

## Routing Table

| Work Type | Route To | Examples |
|-----------|----------|----------|
| UI components, layouts, shadcn/ui | Nova | Redesign a card, add a dialog, fix CSS |
| Next.js pages, client-side state, React hooks | Nova | New page route, TanStack Query hook, Tiptap editor |
| API routes (Route Handlers), Prisma queries | Axiom | New endpoint, migration, query optimization |
| Database schema, Prisma migrations | Axiom | Add model, add column, raw SQL migration |
| External API integrations (BLS, USAJobs, Maps) | Axiom | New proxy route, API key config, response shaping |
| Architecture decisions, ADRs, trade-off analysis | Rex | New library choice, structural refactor, ADR authoring |
| Sprint planning, roadmap, task breakdown | Rex | What to build next, sequencing, scoping |
| Test writing, edge case hunting, QA | Echo | Vitest tests, TypeScript strict errors, smoke testing |
| TypeScript strict errors, type fixes | Echo | Fix `any`, narrow types, add missing guards |
| Code review | Echo | Review PRs, check quality, suggest improvements |
| Session logs, decisions, handoff docs | Scribe | Automatic — never needs routing |
| GitHub issue triage, label assignment | Ralph | Automatic via watch mode |

## Issue Routing

| Label | Action | Who |
|-------|--------|-----|
| `squad` | Triage: analyze issue, assign `squad:{member}` label | Rex (Lead) |
| `squad:rex` | Architecture / planning work | Rex |
| `squad:nova` | Frontend / UI work | Nova |
| `squad:axiom` | Backend / API / DB work | Axiom |
| `squad:echo` | QA / testing / type fixes | Echo |

### How Issue Assignment Works

1. When a GitHub issue gets the `squad` label, **Rex** triages it — analyzing content, assigning the right `squad:{member}` label, and commenting with triage notes.
2. When a `squad:{member}` label is applied, that member picks up the issue in their next session.
3. Members can reassign by removing their label and adding another member's label.
4. The `squad` label is the "inbox" — untriaged issues waiting for Lead review.

## Rules

1. **Eager by default** — spawn all agents who could usefully start work, including anticipatory downstream work.
2. **Scribe always runs** after substantial work, always as `mode: "background"`. Never blocks.
3. **Quick facts → coordinator answers directly.** Don't spawn an agent for "what port does the server run on?"
4. **When two agents could handle it**, pick the one whose domain is the primary concern.
5. **"Team, ..." → fan-out.** Spawn all relevant agents in parallel as `mode: "background"`.
6. **Anticipate downstream work.** If a feature is being built, spawn the tester to write test cases from requirements simultaneously.
7. **Issue-labeled work** — when a `squad:{member}` label is applied to an issue, route to that member. The Lead handles all `squad` (base label) triage.
