# 0034 — Worklog Events on the Notes Surface (Inline Editor + Properties Rail)

- **Date:** 2026-06-18
- **Status:** Accepted
- **Supersedes:** ADR-0033 (modal creation), ADR-0027 Day-3 Cycle B's modal-edit decision
- **Chains to:** ADR-0024 (inline 3-pane retirement of the reader drawer), ADR-0025 (Properties rail composition), ADR-0027 (anchored creation contract, Q1=A `workHistoryId` immutability)

## Context

ADR-0033 just retired the map detour by promoting EventCreate to a Dialog with a chip row, Places autocomplete, and a mini-map preview. It shipped, was smoke-tested live, and the user accepted it as a functional improvement.

The user then flagged a **surface-shape inconsistency**: every other worklog kind (notes, procedures) opens in an **inline editor with a right-rail Properties panel** (per ADR-0024 + ADR-0025). Events were the only remaining kind that opened in a modal — both for creation and for editing. The mismatch was visible enough to call out as a UI break.

The Architectural Reviewer presented three options:

| Option | Shape | Ship cost | Verdict |
|---|---|---|---|
| **A — Inline editor + Properties rail** | `/worklog/events/<id>` mirrors `/worklog/notes/<id>` | High (one-shot landing) | **Chosen.** Surface consistency is the whole point. |
| B — Sidebar half-modal | Slide-over panel | Medium | Rejected — still a modal, just a wider one. |
| C — Keep dialogs | Status quo | Zero | Rejected — perpetuates the inconsistency the user just flagged. |

The Griller surfaced three concerns:

1. **Surface-cost vs payoff** — locked: A. The user explicitly demanded inline parity.
2. **Silent-create vs first-save gate** — locked: 2a (silent create) was the user's stated intent, but Q4 below revealed that 2a as written collides with ADR-0027 Q1=A. After Q4 the actual answer is **client-side draft on `/worklog/events/new`** until first save.
3. **Schema split — slim event editor vs merge events into `WorkLog`** — locked: **3a (slim editor)**. `CareerEvent` stays its own table. Merging is parked as a separate sprint.

### The immutability crux (Q4)

ADR-0027 Q1=A (verified in [event-edit-dialog.tsx](src/components/worklog/events/event-edit-dialog.tsx) and [route.ts](src/app/api/events/%5BeventId%5D/route.ts)): **`workHistoryId` is IMMUTABLE on PATCH.** Any PATCH body that includes `workHistoryId` is rejected with 400. Cycle B's response was "to 'move' an event the user must delete + recreate."

Notes can silent-POST because they have no schema discriminator. Events have `workHistoryId`, locked at creation. Three sub-options:

| | How "silent create" actually happens | Trade-off |
|---|---|---|
| **4a** | Silent POST a free-floating draft. Picking a chip in Properties triggers a hidden DELETE+POST swap. | Wasteful round-trip; transient duplicate row; client must orchestrate atomically. |
| **4b** ⭐ | `/worklog/events/new` renders the editor in **client-side draft mode** until first save. First save commits anchored-or-free in one shot to the right endpoint (`POST /api/events` or `POST /api/work-history/:id/events`). After save, navigate to `/worklog/events/<id>` and PATCH everything else. Anchor pick is a **creation-only** affordance; on `/worklog/events/<id>` the chip row is read-only ("delete + recreate to move"). | One brief async gap (no autosave during draft, but autocomplete+chip+title all work in client state). No API change. ADR-0027 Q1=A intact. |
| 4c | Amend ADR-0027 Q1=A to allow `null → set` PATCH. | Re-opens a settled ADR; touches API + tests; broader blast radius. |

**Locked: 4b.** Honest answer for "events have an immutable affiliation that notes don't" — the first save is the gate, after that it's pure notes-style PATCH.

### Rail reuse

The existing `WorklogReaderRightRail` is note-shaped: typed `WorkLog`, hardcoded `Photos` tab, requires `assets`/`equipment`/`tagSuggestions` corpora, and renders Backlinks/History panels keyed off `noteId`. It cannot be reused 1:1 for events. Three sub-options:

| | Cost | Verdict |
|---|---|---|
| Generalize the rail with a render-prop or tab-registry | High (refactor of existing rail + tests) | Parked — separate sprint. |
| **Parallel rail shell** ⭐ | Medium (~150 LOC duplicate of chrome) | **Chosen.** Copy the icon strip, collapse handle, ⌘1 shortcut, 320px panel; render only an event-Properties tab. |
| Inline the Properties body without a rail wrapper | Low | Rejected — loses the collapse/keyboard-shortcut affordance the user already learned on notes. |

## Decision

1. **Retire** `event-create-dialog.tsx` and `event-edit-dialog.tsx` once their replacements are wired.
2. **New routes:**
   - `/worklog/events/new` — client-side draft mode. Title input + "What happened" textarea + event-Properties rail (Location/Anchor section is editable here only). On submit, POST to the right endpoint and `router.replace("/worklog/events/<id>")`.
   - `/worklog/events/<id>` — persisted mode. Same shell. Title + "What happened" + event-Properties rail. Autosave PATCH on blur for every field. Location section is read-only for anchored events; address-only (no chip row) and editable for free-floating events.
3. **Editor shell** (`worklog-event-editor.tsx`) renders title (large input, top), "What happened" (textarea below — plaintext, NOT Tiptap; per Q3=3a slim editor), and a parallel rail (`worklog-event-editor-rail.tsx`) with one tab.
4. **Properties sections** for events: Category select, Start/End date, Metrics, Location/Anchor (mode-aware: chip row + autocomplete + mini-map on `/new`; read-only badge OR address-only on `/<id>`).
5. **Callsite rewires:**
   - Sidebar `+ Events` → `router.push("/worklog/events/new")`.
   - Map view FAB → `router.push("/worklog/events/new?lat=…&lng=…&location=…")` so the editor pre-fills the location section.
   - Events list row click → `router.push("/worklog/events/<id>")`.
6. **Validator unchanged.** `/api/events` (free-floating) and `/api/work-history/:id/events` (anchored) keep their current contracts. Q1=A immutability stays intact.

## Consequences

### Pros

1. **Surface consistency.** Events join notes and procedures in the inline-editor + Properties-rail pattern. No more single-modal odd-one-out.
2. **No API change.** Q1=A immutability survives untouched; the validator and route handlers are unchanged.
3. **Anchor decision is honest.** The first-save gate is the cleanest answer to "events have an immutable affiliation that notes don't" — no swap dance, no DELETE+POST round-trip.
4. **Existing ADR-0033 work survives.** `places-autocomplete.tsx` (`onCoordsResolved`), the chip-row layout, and the mini-map preview all transplant directly into the new Location section.
5. **Map FAB stays useful.** URL-param hydration of the draft means the map's "drop a pin here" gesture lands the user in the editor with coords pre-resolved, same as today.

### Cons / Trade-offs

1. **Code duplication for the rail chrome.** ~150 LOC of icon-strip + collapse-handle + shortcut wiring is copied from `worklog-reader-right-rail.tsx`. Generalizing both rails into a shared shell is parked.
2. **Anchor pick is creation-only.** Existing free-floating events can't be promoted to anchored without delete + recreate (Cycle B's UX preserved). User-flagged future work: a "convert to anchored" affordance — out of scope here.
3. **Brief client-side-draft window.** During `/worklog/events/new`, no DB row exists yet, so closing the tab loses the in-progress draft. This is acceptable because the user explicitly opted into 4b over 4a's silent-POST. Notes silent-POST tolerates an "Untitled" row in the DB; events get a draft window in exchange for keeping anchor as a one-shot decision.
4. **Two rail shells until refactor.** `WorklogReaderRightRail` and `WorklogEventEditorRail` will live side by side. Acceptable short-term cost; both are <300 LOC.

## Implementation Plan (units)

| # | Unit | Files |
|---|---|---|
| 1 | This ADR | `docs/adr/0034-worklog-events-inline-editor.md` |
| 2 | Event Properties sections | new `event-properties-fields.tsx`, `event-location-section.tsx` |
| 3 | Event editor rail shell | new `worklog-event-editor-rail.tsx` (parallel to `worklog-reader-right-rail.tsx`) |
| 4 | Event editor main shell | new `worklog-event-editor.tsx` (title + "What happened" + rail) |
| 5 | `/worklog/events/new` route | new `src/app/(app)/worklog/events/new/page.tsx` |
| 6 | `/worklog/events/[id]` route | new `src/app/(app)/worklog/events/[id]/page.tsx` |
| 7 | Callsite rewires | `worklog-nav-sidebar.tsx`, `worklog-events-view.tsx`, `worklog-map-view.tsx` |
| 8 | Retire dialogs | delete `event-create-dialog.tsx` + `event-edit-dialog.tsx`; extract `eventPatchUrl` helper to standalone module so `event-delete-confirm.tsx` keeps working |
| 9 | parked-ideas annotation | `/memories/repo/parked-ideas.md` |
| 10 | E→T→C verify + commit | get_errors clean, vitest 814+, browser smoke (4 entry points × 2 modes), single commit |

## Smoke matrix (Unit 10)

- Sidebar `+ Events` → `/worklog/events/new` → fill title only → submit → routes to `/worklog/events/<id>` (free-floating, no location).
- Sidebar `+ Events` → `/worklog/events/new` → click chip → submit → anchored event lands.
- Sidebar `+ Events` → `/worklog/events/new` → type address → pick → submit → free-floating event with coords.
- Map FAB → `/worklog/events/new?lat=…&lng=…&location=…` → coords prefilled in mini-map → submit.
- Click existing free-floating event row → `/worklog/events/<id>` → edit title → autosave → reload survives.
- Click existing anchored event row → `/worklog/events/<id>` → location section shows read-only "Anchored to: [Job]" badge → edit metrics → autosave.
