# Worklog Home Route Split + Landing-Page Architecture

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Sory
- **Tags:** frontend, routing, layout, worklog
- **Builds on:** [ADR-0013](./0013-worklog-section-nav-override.md)

## Context and Problem Statement

After ADR-0013 collapsed `/worklog` to a 2-pane (notes-list + reader) layout, a structural mismatch surfaced: the reader pane spans ~1000 px on a typical viewport, but worklog notes are short prose. The empty state — when no note is selected — became a giant blank pane with one centered "Select a note" placeholder.

The user's framing was sharper than "the reader is too wide": **the page itself shouldn't be the reader by default.** Most visits to `/worklog` are not to read or edit a specific note — they're to capture a quick thought, glance at recent work, or navigate into a folder. Treating the editor as the front door makes the simple case feel heavy and the home case impossible.

The pull-quote from the conversation: *"the page treated entirely different not stacked but sorta like a landing page with the notes functionality."*

A static mockup (`public/mockups/worklog-landing.html`) explored this as a curated home: greeting + summary line, Quick Capture hero, Today's notes (one-liners), 3 stat cards (streak / month / notable), folder grid, recent-week list. The existing 2-pane reader experience would be reachable via `/worklog/notes` (or a query param) and via deep-linking from any home item.

## Decision Drivers

- **Capture is the dominant action.** Users come to `/worklog` to log thoughts, not to read them. The hero of the page should be Quick Capture, not the editor.
- **The home view is a glance, not a task.** Stats, recent notes, folder shortcuts — these are scannable, not editable.
- **Don't lose the existing 2-pane experience.** It works for "I want to scan, pick, and write." Just relocate it; don't redesign it.
- **Routing should grow as the worklog feature does.** A future `/worklog/insights`, `/worklog/templates` (full page), or `/worklog/promotions` should be cheap to add without re-litigating layout.
- **Sidebar override (ADR-0013) must keep working.** Both `/worklog` (home) and `/worklog/notes` (deep view) need the same section nav.
- **Don't grow `worklog-page.tsx`.** Already at ~580 lines with both compact and non-compact branches inside it. Adding a home view to that file would push it through the 600-line god-file ceiling.

## Considered Options

- **Option A — Nested route split: `/worklog` (home) + `/worklog/notes` (list+reader).**
  - New `(app)/worklog/layout.tsx` wraps both routes in `<FullBleedShell>` once.
  - `(app)/worklog/page.tsx` renders the new `<WorklogHomeView>`.
  - `(app)/worklog/notes/page.tsx` renders the existing `<WorklogPage>` unchanged.
  - The home view is a new self-contained component tree under `src/components/worklog/home/`.
- **Option B — Single route, view query param: `/worklog?view=home|notes`.**
  - Same `<WorklogPage>` mounts, branches on `view` param.
  - No new route files, but pushes more state and JSX into an already-large component.
- **Option C — Default to home as a *replacement* of the current page.**
  - The current 2-pane experience is removed entirely; everything lives on the new home.
  - Quick Capture, Today, recent are all enough for daily use; deep dives happen via the global search palette.

## Decision Outcome

**Chosen option: Option A — Nested route split.**

The home and the list+reader are *different surfaces* with different mental models, different keyboard models, and different default scroll/focus patterns. Trying to host both in one component file fights both. Nesting them as sibling routes under a shared `worklog/layout.tsx` lets each be optimal for its use case while keeping the section nav and full-bleed chrome consistent.

The route split also matches the user's longer-term framing: *"we can nest more pages within it so we are not stuffing everything onto one page."* This ADR establishes the precedent for that.

### Positive Consequences

- **Capture-first home.** Quick Capture is the hero of the most-visited URL. Most visits never need to enter the deep view.
- **Existing 2-pane experience preserved verbatim.** `<WorklogPage>` moves files, no logic changes. ADR-0013's URL contract (`?folder=…&view=templates`) survives at `/worklog/notes`.
- **Sidebar override unchanged.** `pathname.startsWith("/worklog")` already matches both routes — no sidebar code touched this round.
- **Code stays modular.** Home view ships in its own folder (`src/components/worklog/home/`) with one component per section. None coexist in `worklog-page.tsx`. The 580-line god-file pressure does not increase.
- **Routing scales.** Adding `/worklog/insights` or `/worklog/promotions` later is cheap — they slot under the same layout.
- **URL semantics improve.** `/worklog` = "show me my worklog at a glance"; `/worklog/notes` = "let me work in my notes." Bookmarks, browser back/forward, and deep links each match the user's intent at the URL.

### Negative Consequences

- **Two new route files plus a layout file.** Worklog now has three route boundaries instead of one. Each has its own data-loading lifecycle (kept consistent via shared TanStack Query keys).
- **The activity widget moves out of the notes page.** Yesterday's `<WorklogActivityWidget>` mounted at the top of the notes-list pane on `/worklog/notes`. It now lives only on `/worklog`. Trade-off: scanning recent activity is one extra navigation. Justified because the widget is *content about the data*, which belongs on the home; the deep view should be focused on note work.
- **Sidebar gains a "Home" row.** Without it, navigating from a folder back to the home requires clicking the "Worklog" header link. Adding the row is correct UX but enlarges the sidebar's filter section by one row.
- **Quick Capture ergonomics depend on the route handoff working.** Save → `router.push("/worklog/notes?focus=<id>")`. If the focus-id deep-link is racy or hasn't refreshed the query cache yet, the user lands on `/worklog/notes` with no selection. Mitigated by `useWorklogDeepLinks`'s existing wait-for-id pattern.
- **Compact embed (`<WorklogPage compact />`) is unaffected** — it still mounts directly, no route boundary involved.

## Pros and Cons of the Options

### Option A — Nested route split

- ✅ Each surface optimal for its use case.
- ✅ Existing component tree unchanged.
- ✅ `worklog-page.tsx` stays at ~580 lines instead of pushing past 600.
- ✅ Future sub-pages slot in cheaply.
- ❌ Two more route files + layout file.
- ❌ Two data-loading lifecycles (mitigated by shared TanStack keys).

### Option B — Single route, view query param

- ✅ Smallest file count change.
- ❌ `worklog-page.tsx` grows past 600 lines (definitionally a god file).
- ❌ Forces home and notes JSX to coexist in one component, with `view`-keyed branches everywhere — keyboard handlers, scroll containers, dnd context, focus management.
- ❌ Conflicts with the existing `?view=templates` URL state from ADR-0013.

### Option C — Replace, no deep view

- ✅ Smallest implementation by far.
- ❌ Deletes the user's existing scan-and-edit workflow without an audit of how it's used today.
- ❌ Search palette is not a substitute for the 2-pane scan view.
- ❌ Reversal cost is high.

## Implementation notes

### URL contract

| URL | Page | State source |
|---|---|---|
| `/worklog` | `<WorklogHomeView>` | No URL state — read-only home |
| `/worklog/notes` | `<WorklogPage>` (current 2-pane) | `?folder=…&view=…` per ADR-0013 |
| `/worklog/notes?focus=<id>` | `<WorklogPage>` with note open | Reuses existing `useWorklogDeepLinks` |

The `?view=templates` state from ADR-0013 only applies on `/worklog/notes`. The home page does not consume any URL state in v1.

### File structure

```
src/app/(app)/worklog/
├─ layout.tsx           NEW — wraps both routes in <FullBleedShell>
├─ page.tsx             EDIT — renders <WorklogHomeView />
└─ notes/
   └─ page.tsx          NEW — renders <WorklogPage />

src/components/worklog/home/
├─ worklog-home-view.tsx       NEW — composes the 5 sections + greeting
├─ worklog-quick-capture.tsx   NEW — capture hero, escalates to /worklog/notes?focus=<id>
├─ worklog-today-list.tsx      NEW — one-liner list, today's notes only
├─ worklog-stat-cards.tsx      NEW — streak / month / notable cards
├─ worklog-folder-grid.tsx     NEW — top 8 folders by recent activity
└─ worklog-recent-list.tsx     NEW — earlier-this-week one-liner list
```

### Behavior decisions baked in (resolved Grillers)

- **Today section style:** one-liner list (high density). Decided 2026-06-06.
- **Quick Capture submit:** escalate to full editor by routing to `/worklog/notes?focus=<id>`. Decided 2026-06-06.
- **Sidebar Home row:** added at the top of `<WorklogNavSidebar>`, active when `pathname === "/worklog"`. Decided 2026-06-06.
- **Activity widget on `/worklog/notes`:** removed. Lives only on `/worklog`. Decided 2026-06-06.
- **Folder grid scope:** top 8 by recent activity. Iterate based on real-use feedback. Decided 2026-06-06.

### Out of scope this round

- Refactoring `worklog-page.tsx` into smaller components. Tracked separately as a follow-up extraction (deferred from yesterday's handoff).
- Designing additional worklog sub-pages (`/worklog/insights`, `/worklog/promotions`). The route precedent is established here; specific pages each earn their own ADR.
- Mobile-specific home layout. v1 home assumes desktop-first; mobile gets the same component tree with default Tailwind breakpoints. Mobile UX review deferred.

## Status notes

- Builds on ADR-0013 (sidebar override + URL folder state). Sidebar override gating still works because `pathname.startsWith("/worklog")` matches both new routes.
- `<FullBleedShell>` lives in the new layout file once, replacing the per-page wrapper that was added in the same session as ADR-0013.
- The worklog-as-landing concept was first explored in `public/mockups/worklog-landing.html`. The mockup is the visual reference for v1 implementation.
