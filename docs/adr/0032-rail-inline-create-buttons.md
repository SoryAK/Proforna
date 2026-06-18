# 0032 — Rail-inline `+` buttons for kind-locked create

- **Status:** Accepted
- **Date:** 2026-06-17
- **Supersedes:** [ADR-0031](0031-three-way-create-picker.md)
- **Deciders:** Sory (PM/builder) + Copilot agent
- **Tags:** frontend, worklog, ux, kind-discriminator, navigation

## Context and Problem Statement

ADR-0031 (2026-06-16) shipped a 3-way `+ New` dropdown on the `/worklog/notes` toolbar — items: **New note · New procedure · New event**. It was a 1-day-old fix that converted misclassification from a "fix-it-after" salvage problem into a "pick-the-right-shape-up-front" choice. Smoke-tested fine, was committed locally as `40d7969`, never pushed.

A day later the user pushed back: the dropdown still costs ≥2 clicks (open menu → scan items → click), and "I dont like how the events are shown in the worklog" — flagging an unrelated but adjacent concern that the picker doesn't address.

The opportunity: the global worklog rail (`worklog-nav-sidebar.tsx`) already has dedicated rows for **Events** (`/worklog/events`, fuchsia `CalendarDays`) and **Procedures** (`/worklog/procedures`, rose `ClipboardList`) sitting under "All notes." Each row has a clear kind identity, a count badge, and is visible from every `/worklog/*` route. Per Notion / Linear / GitHub convention, those rows are the natural home for kind-locked create actions.

## Decision

Replace the toolbar dropdown picker with **always-visible inline `+` buttons** on the rail Events and Procedures rows. The toolbar reverts to a single kind-locked `+ New note` button. The `+` icon is monochrome (tokens-only, `text-muted-foreground hover:text-foreground hover:bg-accent`), 28×28 hit target, sits to the right of the count badge as a flex sibling of the row's `<Link>`.

Behavior:

- **Procedures `+`** → calls `useWorklogMutations().saveLog.mutateAsync(...)` with `kind: "procedure"`, title `"Untitled procedure"`, and the user's saved defaults from `useWorklogPreferences()` (mirrors the prior toolbar handler exactly so optimistic cache prepends stay coherent). On success, routes to `/worklog/notes/<id>` where the procedure editor mounts.
- **Events `+`** → routes to `/worklog/map?place=1`. The map's `useEffect` reads the param, arms place-mode, then strips the param via `router.replace`. Free-floating events still require lat+lng+location (ADR-0027 validator), so creation completes when the user clicks a point on the map.
- **Notes `+`** → stays on the `/worklog/notes` toolbar (kind-locked, single click). "All notes" is a mixed-kind filter view, so a `+` on that rail row would have ambiguous semantics; the toolbar is the right home.

Decision sub-points:

1. **Always-visible, not hover-reveal.** Notion-style `opacity-0 group-hover:opacity-100` looks clean on desktop but is dead on touch. Resumsify is mobile-first (ADR-0021). A subtle always-on glyph wins.
2. **Monochrome, not kind-colored.** Three `+` glyphs blooming in cyan/rose/fuchsia in the rail would look like a circus. The kind identity is already carried by the row's main icon (`CalendarDays` fuchsia for events, `ClipboardList` rose for procedures); the `+` is just an action affordance.
3. **HTML structure.** A `<Link>` cannot nest a `<button>`. Each row is restructured from `<Link>` to `<div className="flex items-stretch">` + `<Link className="flex-1">` + sibling `<button>`. The active-state background and the Events row's top divider move from the Link to the wrapping div so they span the full row width including the `+` button.

## Consequences

**Pros**
- 1 click vs 2-3 clicks for procedure / event creation. Hick's Law win.
- Action lives next to the kind label — zero ambiguity about what each `+` creates.
- Works from every `/worklog/*` route (rail is global), not just `/worklog/notes`.
- Toolbar simplifies — single button, no dropdown state, no base-ui `MenuGroupRootContext` traps.

**Cons / Trade-offs**
- The Events `+` only saves 1 click, not the full creation cost — the user still has to load the map and click a point. The deeper "events-creation-feels-heavy" friction needs its own sprint (parked).
- Two callsites now duplicate the procedure-create handler shape (rail + toolbar's old version, now removed). One callsite remains. If a third callsite appears (Cmd+K, Quick Capture), extracting `useCreateProcedure()` becomes worth it.
- The `+` button's hover state (`hover:bg-accent` on the button only, not the whole row) creates a visible split between the Link and button hover regions. Intentional — communicates two distinct affordances — but a future polish sprint could choose a unified hover.
- Out of scope: how events are *displayed* in the worklog. Parked separately.

## Alternatives considered

- **Kept the toolbar dropdown (ADR-0031).** Defensible but loses on click count and discoverability. Ship-pivot is cheap because it never left local.
- **Extracted `useCreateProcedure()` shared hook now.** Over-engineering per the implementation discipline rule — single caller after this change. Defer until a third caller appears.
- **Hover-reveal `+` (Notion-style).** Cleaner desktop look, but breaks on touch. Resumsify is mobile-first; rejected.
- **Global FAB / Cmd+K only.** Hides the action from the eye; high discoverability cost; rejected.

## Implementation notes

- `worklog-nav-sidebar.tsx` — wrapped Events + Procedures rows in flex containers, lifted Events' `border-t border-border/60 mt-1 pt-3` divider and the active `bg-orange-100` onto the wrapper. Added `useWorklogMutations` + `useWorklogPreferences(emptyMap)` hooks; `useMemo(() => new Map<string, Position>(), [])` keeps the positionMap arg ref-stable (the `defaultsSummary` memo that consumes it is unused here).
- `worklog-notes-view.tsx` — removed `FileText`, `ListChecks`, `MapPin` from lucide imports and `buttonVariants` from button imports (all picker-only). Removed `handleNewProcedure` and `handleNewEvent` — both lifted to the sidebar. The `<DropdownMenu>` block became a kind-locked `<Button>` matching the existing Send/Export toolbar button styling.
- No API or schema changes. Same `POST /api/work-logs` body shape, same `?place=1` query param contract.
