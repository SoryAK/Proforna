# 0031 — Three-way Create picker on the worklog-notes toolbar

- **Status:** Superseded by [ADR-0032](0032-rail-inline-create-buttons.md)
- **Date:** 2026-06-16
- **Deciders:** Sory (PM/builder) + Copilot agent
- **Tags:** frontend, worklog, ux, kind-discriminator

> **Superseded 2026-06-17.** The toolbar dropdown was a defensible 1-day-old answer to misclassification, but inline `+` buttons next to the rail Events / Procedures rows turned out to be both faster (1 click vs 2-3) and more discoverable (action lives next to the kind label). See ADR-0032 for the replacement design and rationale.

## Context and Problem Statement

ADR-0029 introduced `WorkLog.kind` as a `"note" | "procedure"` discriminator and shipped a procedure list at `/worklog/procedures`. ADR-0030 layered visual identity (rose badges, structured `procedureDoc` editor). ADR-0027 added events as a separate map-anchored kind.

What was still rough: **at creation time** the user had a single "+ New note" button on `/worklog/notes`, which always created a `kind="note"` row. To create a procedure they had to navigate to `/worklog/procedures` and use *its* "+ New procedure" button — an extra route hop that broke the focus rhythm of the notes view (where users live most often). To create an event they had to remember `/worklog/map` exists, navigate there, then arm place-mode by clicking a FAB.

The natural draft fix was a **kind-move operation** ("change this note into a procedure after the fact"). The Griller pushback during planning surfaced that misclassification is a *theoretical* problem today — only one procedure exists in the user's DB and the rose badge already gives 80% of the practical clarity. A kind-move sprint would have built symmetry without solving observed pain.

The tighter fix is to remove the misclassification opportunity at the source: let the user pick the row shape **at creation time**, in the place they already create things.

## Decision Drivers

- **Cause not cure** — fix misclassification by making the choice obvious at creation time, not by building a salvage path after the fact.
- **Single mount, dual reach** — the notes toolbar already renders on both `/worklog/notes` (list) and `/worklog/notes/[id]` (reader), so one component change covers two surfaces without a hunt for entry points.
- **No new validator paths** — events still require `lat + lng + location` (ADR-0027). Free-floating event creation has no defined data shape. Routing into the existing `/worklog/map` place-mode is the cheapest correct path.
- **Kind-neutral language** — labelling the trigger "+ New" (not "+ New note") matches the new semantics and avoids "+ New note → wait, I want a procedure" friction.
- **Don't over-replace** — six other "+ New note" entry points exist (list rail, grid empty-state, reader empty-state, home Quick Capture, command palette, Cmd+K). Each is contextually obvious in its own surface. Replacing them all would be an audit sweep with no marginal value.

## Considered Options

- **Option A — Kind move ("flip a note ↔ procedure later")** — symmetric, elegant, requires `PATCH /api/work-logs/[id]/kind`, `WorkLogVersion` migration story, More-menu UI, regression-test rewrite. Solves a problem that doesn't exist yet.
- **Option B — 3-way Create picker on the notes toolbar (chosen)** — a `DropdownMenu` replaces the `+ New note` button, exposing **New note · New procedure · New event**. One mount point, three creation paths.
- **Option C — Replace all 7 "+ New note" entry points** — sweep across grid, table, list-rail, reader-empty-state, home, command-palette, toolbar. High cost, low marginal value (most callsites are contextually kind-locked).
- **Option D — Split-button (primary "New note" + chevron for kind picker)** — visually accurate ("note is the default") but base-ui has no canonical split-button primitive; would mean writing one. Cost/benefit didn't justify it.

## Decision Outcome

**Chosen option: "Option B — 3-way Create picker on the notes toolbar."**

The picker mounts on `worklog-notes-view.tsx` only — that single mount point covers the list view (`/worklog/notes`) and the inline 3-pane reader (`/worklog/notes/[id]`). The "+ New" trigger uses kind-neutral language. Three items: **New note** (cyan `FileText`), **New procedure** (rose `ListChecks`), **New event** (fuchsia `MapPin`). Note creation goes through the existing `useWorklogMutations().saveLog.mutateAsync({ kind: "note" })` path; procedure creation mirrors it with `kind: "procedure"` and `title: "Untitled procedure"`; event creation routes to `/worklog/map?place=1`, where the map view auto-arms place-mode and strips the query param via `router.replace` so refresh + back-nav don't loop.

### Positive Consequences

- Misclassification is solved at the source — the user picks the row shape in the moment they decide to capture something.
- Procedure creation is one click away from the notes view (no route jump to `/worklog/procedures`).
- Free-floating event creation has a discoverable entry point that respects the existing `lat+lng+location` validator.
- The kind-neutral "+ New" label invites the choice; removes the implicit "default to note" framing.
- Single mount point means the change is contained — two files touched, no audit sweep across surfaces.
- Kind move (the abandoned alternative) stays parked with a clear rationale; can still be revisited if real misclassification incidents accumulate.

### Negative Consequences

- One more click to create a note (was: button → row created; now: trigger → menu item → row created). Negligible at usage scale; the click count is identical to `/worklog/procedures`'s existing "+ New procedure" pattern.
- The notes toolbar is now the **primary** events entry point for free-floating events even though the user is on `/worklog/notes`. The route jump to `/worklog/map?place=1` is necessary because we have no map-less event-create path; this is captured in ADR-0027 and the `?place=1` query param is the seam.
- Six other "+ New note" entry points stay note-locked. Future work (or a real misclassification incident) might broaden them; tracked as a parked item under ADR-0029 follow-ups.
- Adds a `useSearchParams` dependency to `worklog-map-view.tsx` (was already a client component, so cost is negligible).

## Pros and Cons of the Options

### Option A — Kind move

- ✅ Elegant symmetry — every kind decision is reversible.
- ✅ Future-proof — handles "I miscategorized 5 notes a year ago" gracefully.
- ❌ Solves a problem the user doesn't have today (one procedure exists, badge handles disambiguation).
- ❌ Requires API + UI + version-history story + regression-test rewrite — multi-day sprint.
- ❌ Hides the *real* fix (don't create the wrong kind in the first place).

### Option B — 3-way Create picker (chosen)

- ✅ Fixes the root cause (creation-time choice).
- ✅ Single-file mount (toolbar) covers two surfaces (list + reader) for free.
- ✅ Reuses existing `useWorklogMutations` + the existing API kind whitelist (POST already accepts `kind: "procedure"`).
- ✅ Procedure path is identical to note path minus a string — no new server logic.
- ❌ Requires the map auto-arm seam for events (small; one `useEffect` with a query-param guard).
- ❌ Doesn't help notes that are *already* miscategorized (deferred to kind-move if that becomes a real pain).

### Option C — Replace all 7 entry points

- ✅ Maximum consistency — every "create" affordance is kind-aware.
- ❌ Most callsites are contextually obvious (empty-state of grid view → user is creating a note). The picker adds friction without adding value.
- ❌ Audit sweep across 7 components, each with its own selection state, dialog wrappers, mobile considerations.
- ❌ Multiplies test surface; no commensurate user-visible benefit.

### Option D — Split-button

- ✅ Communicates "note is default" while still exposing the picker.
- ❌ base-ui has no canonical split-button primitive — would mean writing one (Radix had `<DropdownMenu.SubTrigger>` patterns; base-ui equivalent is rougher).
- ❌ Two click targets visually crowd the toolbar at compact widths.
- ❌ The kind-neutral "+ New" framing is intentionally **not** "note-defaulted" — split-button would walk that back.

## Implementation Notes

### Files touched (commit `40d7969`)

- `src/components/worklog/worklog-notes-view.tsx`
  - `lucide-react` imports gained `FileText, ListChecks, MapPin`.
  - `@/components/ui/button` import gained `buttonVariants` (the `DropdownMenuTrigger` is styled via `cn(buttonVariants({ size: "sm" }))` since base-ui v2 has no `asChild` prop).
  - New handlers: `handleNewProcedure` (mirrors `handleNewNote` with `kind: "procedure"` + title `"Untitled procedure"`), `handleNewEvent` (`router.push("/worklog/map?place=1")`).
  - Trigger button replaced with a `DropdownMenu` carrying three items, each with a colored icon.
- `src/components/worklog/worklog-map-view.tsx`
  - Imported `useRouter, useSearchParams` from `next/navigation`.
  - Inside `WorklogMapView()`: a `useEffect` reads `searchParams.get("place")`, calls `setPlaceMode(true)` when it equals `"1"`, then `router.replace("/worklog/map", { scroll: false })` to strip the param.

### Verified end-to-end (browser smoke)

- Trigger renders as **+ New** with the primary button styling on `/worklog/notes`.
- Dropdown opens with all 3 items + color-coded icons.
- **New procedure** click → POST `/api/work-logs` returns `{ kind: "procedure", title: "Untitled procedure" }` → URL becomes `/worklog/notes/<id>`.
- **New event** click → URL becomes `/worklog/map` (param stripped) → "Click on the map to drop your event" banner visible → place-mode armed.
- `npm test`: **814/814** across 61 files. Existing kind-preservation regression test still guards the PUT path; the POST whitelist already accepted `"procedure"` from the day ADR-0029 shipped (no new server work).

### Surfaces deliberately NOT modified

- `worklog-procedures-view.tsx` — its `+ New procedure` button stays. Users on `/worklog/procedures` are explicitly creating procedures; presenting a picker would be redundant.
- `worklog-notes-grid.tsx`, `worklog-notes-table.tsx` empty-state buttons — stay note-locked. Empty-state buttons are about emptying the empty state; the user already chose this surface.
- `worklog-note-reader.tsx` empty-state — same logic. Reader empty-state means "open a note to read"; the path back to creation is the toolbar.
- `home/worklog-quick-capture.tsx`, `command-palette.tsx`, Cmd+K — kind-neutral capture is a future improvement; current implementation creates notes, the dominant case.

## Links / References

- [ADR-0027 — Worklog events](./0027-worklog-events.md) — defines the `lat+lng+location` validator and `EventCreateDialog`. Free-floating events have no map-less creation path; the picker routes through `?place=1` to honor that contract.
- [ADR-0029 — Worklog procedures kind discriminator](./0029-worklog-procedures-kind-discriminator.md) — defines `kind` and the POST whitelist that already accepts `"procedure"`.
- [ADR-0030 — Worklog procedures visual identity](./0030-worklog-procedures-visual-identity.md) — rose badge + structured `procedureDoc` schema; this ADR builds on the visual cues established there.
- Commit `40d7969` — `feat(worklog): 3-way create picker (note / procedure / event)`.
- Parked **Kind move** entry in `/memories/repo/parked-ideas.md` — superseded by this ADR's cause-not-cure framing. Re-entry trigger raised: real misclassification incidents in the wild, not theoretical symmetry.
