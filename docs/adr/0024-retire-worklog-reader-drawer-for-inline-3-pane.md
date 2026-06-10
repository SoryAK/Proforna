# Retire preview drawer in favor of inline list+reader+rail

- **Status:** Proposed
- **Date:** 2026-06-10
- **Deciders:** Sory
- **Tags:** frontend, ux, worklog

## Context and Problem Statement

ADR-0015 Phase 5 introduced a two-tier read model on `/worklog/notes`: a row
click opens a half-page right-anchored **preview drawer** (`WorklogReaderDrawer`
plus `WorklogNoteReadView`), and an explicit "Open" button in the drawer
escalates to the full-screen reader at `/worklog/notes/[id]`. The justification
was Drive-style "peek many notes without losing your place" UX.

Three things have changed since:

1. **ADR-0023 (Tolaria pattern #1 right rail)** shipped Units 1-3. The rail is
   wired into the dashboard 2-pane (`WorklogNotesAndReader`) and into the
   standalone `/worklog/notes/[id]` route, but **not** into the drawer — the
   drawer was intentionally left as a minimal read-only preview surface.
   Users hitting `/worklog/notes` and clicking a row therefore see Backlinks /
   History / Photos panels **disappear** vs. the rail-enabled surfaces.
2. The Tolaria-style rail composition expected by ADR-0023 (mockup at
   `/mockups/worklog-reader-right-rail.html`) is **inline 3-pane** —
   list (`~288px`) + reader (`flex-1`) + rail (`44+320px`). The drawer (which
   overlays the list with a fixed `min(600px, 50vw)` panel) is structurally
   incompatible with that layout.
3. User-reported "extra click" friction — peek + escalate-to-Open is a
   two-click model for what is functionally a one-click intent
   ("open a note to read or edit").

We can either keep the drawer and accept that ADR-0023's rail never reaches
the drawer surface, or retire the drawer and unify all worklog-note reading
behind the inline 3-pane shell. This ADR chooses the latter.

## Decision Drivers

- **One mental model per note.** Every note should have one canonical URL
  (`/worklog/notes/<id>`) and one canonical view (list + reader + rail on
  desktop). The current `?focus=<id>` query-param + `[id]` path-param coexist
  is two URL contracts for the same intent (ADR-0015 trap captured in memory:
  `${pathname}?focus=<id>` is silently ignored on the dedicated reader).
- **Fewer clicks.** Row click → reader, no escalation step.
- **Rail surface parity.** Backlinks / History / Photos available on every
  reader surface, not gated on which click path got the user there.
- **Mockup fidelity.** The ADR-0023 mockup is the design target; the drawer
  cannot be the implementation of that mockup.
- **Code surface.** Retiring the drawer deletes ~250 lines (`WorklogReaderDrawer`)
  plus the `?focus=` URL machinery + the `buildWorklogFocusHref` reader/list
  branching + the drawer-specific `handleOpen` / `handleCloseDrawer` /
  `drawerOpenHref` / `handleDeleteFromDrawer` in `WorklogNotesView`.

## Considered Options

- **Option A — Inline 3-pane, drawer retired (chosen).** `/worklog/notes`
  and `/worklog/notes/[id]` render the same `WorklogNotesView` shell. Without
  a selection: list claims full width (mockup Frame 2). With a selection
  (URL = `/worklog/notes/<id>`): list shrinks to `w-72`, reader sits middle,
  rail sits right. Drawer + `?focus=` URL contract deleted.
- **Option B — Keep drawer, add rail inside it.** Mount `WorklogReaderRightRail`
  inside `WorklogReaderDrawer`. The drawer would need to grow to fit
  44+320+content (~700px+) and the inline mockup composition is never reached.
- **Option C — Two-mode toggle on `/worklog/notes`.** Per-user preference
  flips between drawer mode and inline 3-pane mode. Doubles the code surface.

## Decision Outcome

**Chosen option: "Option A — Inline 3-pane, drawer retired."** It is the only
option that delivers the ADR-0023 mockup, unifies the URL contract, removes a
click, and reduces code. Option B keeps an awkward overlay-plus-rail composition
that fights the mockup. Option C is the worst of both worlds (double the
maintenance, no clear "default" experience).

### Concrete shape

- `WorklogNotesView` becomes URL-driven on the path segment: it reads
  `/worklog/notes/<id>` from the active pathname and renders the reader+rail
  inline as flex siblings of the list.
- `/worklog/notes/[id]/page.tsx` mounts the **same** `WorklogNotesView`,
  passing `selectedNoteId={id}` so the list is still present on the left.
  The standalone "max-w-5xl single-reader full-screen" page is deleted.
- Row click in the list = `router.push('/worklog/notes/' + id)`. No `?focus=`.
- Mobile (`< md`): with a selection → reader full-screen + "← Back to notes"
  header (returns to `/worklog/notes`). Without a selection → list
  full-screen. This is the **Apple Notes / Bear / native-mail** pattern.
- Empty state (desktop, no selection): list at full width (mockup Frame 2).
  No CTA needed — the list **is** the call to action.
- Rail mount stays guarded on `activeNoteId != null` (ADR-0023 Unit 3).

### Out of scope (this ADR)

- `/worklog` dashboard (`WorklogPage compact` + `WorklogNotesAndReader`)
  is untouched. It already has its own 2-pane experience with the rail.
- ADR-0023 Unit 3.1 (Tags lift into rail) and Unit 4 (ghost-rail
  no-selection mode) are unaffected.

### Migration / cleanup checklist (tracked as Units 1-5 of the ship)

1. Unit 1 — `WorklogNotesView` accepts `selectedNoteId` + renders reader+rail
   inline. Drawer **kept mounted** in this unit for revertibility.
2. Unit 2 — `/worklog/notes/[id]/page.tsx` switches to mounting
   `WorklogNotesView`; old layout deleted.
3. Unit 3 — Drawer + `?focus=` URL contract deleted. Three callers
   (`command-palette`, `equipment-usage-history`, `position-worklog-tab`)
   plus `focus-href.ts` test updated. `WorklogReaderDrawer` file deleted.
4. Unit 4 — Mobile responsive (`md:` breakpoints) for list/reader swap.
5. Unit 5 — `WorklogNoteReadView` orphan check (used to back the drawer);
   ADR-0015 status flipped to "Phase 5 superseded by ADR-0024"; memory
   shards + handoff.

### Positive Consequences

- One URL per note. Bookmarks, deep links, command-palette routes all work
  identically and survive refresh/back/forward without a query-param dance.
- Every reader surface has the rail.
- ~250 LOC + an entire URL contract retired.
- Mockup-faithful UI shipped.

### Negative Consequences

- **`WorklogNoteReadView` may become orphaned.** It was a shared renderer
  between the drawer and the standalone `[id]` route. If `WorklogNoteReader`
  fully covers the new inline reader, this file is dead code (delete in
  Unit 5). If we want a future "peek" affordance back, we'd recreate it.
- **Loss of "skim multiple notes without scroll position drift."** The
  drawer kept the list scrolled where the user was; the inline pane likewise
  doesn't move the list, but if a future redesign brings the list back to
  full-width when no selection, the scroll position becomes a new concern.
  Acceptable cost — we are not seeing this complaint today.
- **ADR-0015 Phase 5 retired.** That ADR remains valid history; this ADR
  supersedes it in part (Phase 5 only) and is recorded as such in the
  ADR-0015 status banner.
- **Deep links to `/worklog/notes?focus=<id>` break.** They will land on
  the list with no selection (the `?focus=` param is silently ignored once
  Unit 3 lands). Acceptable — the param is only ~2 weeks old and the four
  callers being migrated cover the only places it's emitted from.

## Pros and Cons of the Options

### Option A — Inline 3-pane, drawer retired

- ✅ Mockup-faithful UI
- ✅ One URL contract per note
- ✅ Rail available on every reader surface
- ✅ Net LOC reduction
- ❌ Supersedes ADR-0015 Phase 5 (paper trail required)
- ❌ Old `?focus=` deep links become inert

### Option B — Keep drawer, add rail inside

- ✅ Smallest UX change for users who liked the drawer
- ❌ Drawer width balloons (44 + 320 + content ≈ 700px+)
- ❌ Mockup never reachable
- ❌ Doubles the worklog-reader surface count (drawer + `[id]` route + dashboard pane)
- ❌ Two URL contracts continue to coexist

### Option C — Two-mode toggle (drawer vs inline)

- ✅ Lets users self-select
- ❌ Both implementations must be maintained
- ❌ No clear "default" experience to design against
- ❌ Doubles the QA matrix

## Links / References

- ADR-0013 — sidebar nav override (folder picker)
- ADR-0014 — `/worklog` home + `/worklog/notes` split
- ADR-0015 — Drive-style document-manager surface (Phase 5 superseded by this ADR)
- ADR-0023 — Worklog reader right-rail (Tolaria pattern #1)
- Mockup — `/mockups/worklog-reader-right-rail.html`
