# Worklog Notes Document-Manager Layout + Drawer Reader

- **Status:** Accepted
- **Date:** 2026-06-06
- **Deciders:** Sory
- **Tags:** frontend, layout, worklog, navigation, routing
- **Builds on:** [ADR-0013](./0013-worklog-section-nav-override.md), [ADR-0014](./0014-worklog-home-route-split.md)

## Context and Problem Statement

After ADR-0014 split `/worklog` into a capture-first home and `/worklog/notes` (the existing 2-pane list+reader), a second mismatch surfaced at the deep view: the always-visible reader pane on `/worklog/notes` consumes ~1000 px for what is typically short prose, and the empty state — when no note is selected — is a giant blank pane.

The user reframed the deep view: it should look more like a **document-management UI** (Drive / OneDrive / Dropbox) than a reading shell. The list is the main view; the reader is a deliberate side action. Notes have metadata that benefits from being visible — position, folder, last-edited — and bulk operations that benefit from a Drive-style top bar.

A static mockup (`public/mockups/worklog-notes-table.html`) explored this as a Drive-style sortable list with column headers, a filter chip row above, a bulk-action bar that replaces the toolbar when items are selected, and a half-page reader drawer driven by URL state. The user iterated through five rounds of clarification questions; this ADR captures the outcomes.

## Decision Drivers

- **Match the user's stated mental model** — `/worklog/notes` is a document index, not a reader.
- **Surface metadata** — position, folder, last-edited as visible columns; today they're buried in the row.
- **Reader gets out of the way by default** — the deep view is for finding and acting; reading is a deliberate click.
- **Don't break the URL contract** — `?focus=<id>` already exists from ADR-0014 (Quick Capture handoff). Reuse, don't replace.
- **Keep the compact dashboard embed working** — `<WorklogPage compact />` is a different surface and stays untouched.
- **Honest scope** — read mode + a separate full-screen route + a "fresh-from-capture" signal are real costs. Capture them in the ADR explicitly so future-me sees the trade.

## Considered Options

### Where the reader lives

- **A. Full-width list, reader on its own route (`/worklog/notes/[id]`).** Click row → push to a new full-screen page. Simple. List is fully replaced.
- **B. Full-width list, reader as a half-page right drawer driven by `?focus=`.** Click row → URL gains `?focus=<id>`; drawer slides in; list shrinks via CSS grid (`1fr` → `1fr 600px`). List stays visible.
- **C. Intercepted route (`/worklog/notes/[id]` opens as modal over list).** Next.js parallel + intercepted routes. Half-page modal that's also a real route.

### What the drawer shows

- **a. Edit mode by default** (current `<WorklogNoteReader>` reused as-is in the drawer). Cheapest.
- **b. Read mode by default + Edit button.** Static title heading, Tiptap rendered with `editable: false`, static metadata chips. Edit button escalates.
- **c. Edit mode with an "Open full-screen" button.** Same as (a) plus an escalation hatch.

### Where Edit escalates to

- **α.** Inline within the drawer (toggle to edit view).
- **β.** Full-screen route at `/worklog/notes/[id]`.

## Decision Outcome

**Chosen: B + b + β.**

- **B — Half-page drawer driven by `?focus=`.** Honest URL contract (already public from ADR-0014), no Next.js parallel-routes machinery, list stays visible alongside the reader.
- **b — Read mode by default.** Drawer is "glance at this note." Static title `<h1>`, Tiptap with `editable: false`, metadata as static chips/text.
- **β — Edit button routes to `/worklog/notes/[id]`** full-screen. Back-button returns to the drawer.

The user explicitly chose this combination after pushback. The trade is: more surface to build (read-mode component, fresh-from-create signal, full-screen route) in exchange for an editing experience that doesn't fight the at-a-glance scan.

### URL contract

| URL | Behavior |
|---|---|
| `/worklog/notes` | Index. Drawer closed. |
| `/worklog/notes?focus=<id>` | Index + drawer open in **read** mode for `<id>`. |
| `/worklog/notes?focus=<id>&new=1` | Index + drawer open in **edit** mode (Quick Capture handoff path). `new=1` is consumed and stripped after first render. |
| `/worklog/notes/[id]` | Full-screen reader (the existing `<WorklogNoteReader>`, max-width centered, back-arrow header). Reached only via the Edit button on the drawer or by direct deep link. |
| `/worklog/notes?folder=…&view=…` | Existing folder/view contract from ADR-0013. Compatible with `?focus=`. |

The `new=1` signal exists because `?focus=<id>` from a row click is **indistinguishable** from `?focus=<id>` from a Quick Capture handoff. The signal is visible (URL-debuggable), one-shot (stripped after first render), and lossless under hard refresh (the worst case is "newly-created note opens in read mode," which is recoverable with one click).

### Layout

- `/worklog/notes` becomes a CSS grid: `grid-cols-[1fr_0]` by default, transitioning to `grid-cols-[1fr_minmax(0,600px)]` when `?focus` is present. List shrinks; drawer animates in. Row column grid compresses at narrower widths (drops the inline preview).
- Sortable column headers: Title · Position · Folder · Last edited (default sort, DESC).
- Filter chip row above the column headers replaces the current filter dropdown panel.
- Bulk-action bar replaces the toolbar when `selectedCount > 0`.
- Click row → `router.replace("/worklog/notes?focus=<id>")` (preserves history; back-button returns to list state, not previous folder selection).

### Positive Consequences

- The deep view matches its stated job: scan, sort, filter, act on many.
- The reader gets out of the way unless asked for.
- Metadata becomes legible — position, folder, last-edited as columns.
- Bulk operations get a proper top bar instead of a corner-floating bar.
- The CSS-grid drawer is reversible — closing returns to a clean full-width list with no animation reflow gotchas.
- Full-screen `/worklog/notes/[id]` exists as a real escape hatch when users want focused writing space.

### Negative Consequences

- **More surface to build.** Read-mode component (Tiptap with `editable: false` + static metadata layout), drawer chrome with read/edit/back affordances, full-screen route wrapper, new=1 handshake.
- **Drawer width compresses the list.** At narrower viewports the list rows lose the inline preview snippet; this is a design trade, not a bug.
- **`new=1` is a contract** that future callers must respect. Quick Capture writes it; row clicks must NOT.
- **Two ways to view a note** (drawer and full-screen) means the editor's autosave logic runs in both contexts. Today's `<WorklogNoteReader>` already saves on blur; the drawer's edit mode (post-MVP, only via `new=1`) reuses that.
- **Compact embed is now structurally divergent** from `/worklog/notes`. Two list patterns (3-pane rail+list+reader for compact; flat table+drawer for full) exist for the same data. Acceptable: compact serves a different surface (dashboard glance), the full route serves browsing.
- **Grid view is shipped as a placeholder.** The toolbar shows a List/Grid toggle; Grid routes to a stub. Real Grid is a future sprint. Risk: looks half-built. Mitigation: the toggle's Grid state shows a clear "coming soon" message.

## Pros and Cons of the Options

### Option B — Half-page drawer with `?focus=`

- ✅ Reuses the existing URL contract.
- ✅ No Next.js parallel-routes machinery.
- ✅ List stays visible alongside the reader.
- ✅ Clean reverse animation (drawer close = grid column collapse).
- ❌ Two URL paths to a note's view exist (`?focus=<id>` and `/worklog/notes/[id]`).
- ❌ The `new=1` signal is one more piece of visible URL contract to maintain.

### Option A — Full-screen route

- ✅ Simplest mental model: each note is a resource at `/worklog/notes/[id]`.
- ❌ Click on a row replaces the entire list. Loses scan-and-pick UX.
- ❌ Doesn't match the user's stated "smaller reader, list still visible."

### Option C — Intercepted route

- ✅ Bookmarkable URL per note that ALSO behaves as a modal in-context.
- ❌ Next.js parallel + intercepted routes are non-trivial; doubles the route boundaries to maintain.
- ❌ Two render paths for the same content (modal-in-context vs full-screen on direct visit) make focus and scroll management more complex than they need to be.

## Implementation notes

### Phase plan

1. **ADR (this doc).** Done.
2. **`<WorklogNotesTable>`** — full-width sortable rows, click → set `?focus=`. Replaces the current `<WorklogNotesList>` on `/worklog/notes` only; compact still uses the old list.
3. **`<WorklogNotesFilterChips>`** — chip row above the table; replaces the current filter dropdown panel on `/worklog/notes` only.
4. **`<WorklogNotesBulkBar>`** — top bulk-action bar that replaces the toolbar when `selection.selectedCount > 0`.
5. **`<WorklogReaderDrawer>`** — wraps a new `<WorklogNoteReadView>` (read mode) AND a re-mountable `<WorklogNoteReader>` (edit mode, only when `new=1`). Sliding right-side panel; CSS-grid column transitions; close button; Edit button.
6. **`<WorklogNoteReadView>`** — new component. Static `<h1>` title, Tiptap with `editable: false`, static metadata chips for position / folder / category / tags / equipment / assets / mood. Reuses existing extensions for content rendering.
7. **View switcher in the toolbar** (List / Grid). Grid state routes to a placeholder component with a "coming soon" message.
8. **`/worklog/notes/[id]` route** — new file at `(app)/worklog/notes/[id]/page.tsx`. Wraps the existing `<WorklogNoteReader>` in a max-w-3xl container with a back-arrow header. Title metadata.
9. **Refactor `<WorklogPage>` (or fork)** — current `<WorklogPage>` keeps serving the dashboard `compact` embed; a new `<WorklogNotesView>` becomes the surface for `/worklog/notes`. Avoids further bloat in `worklog-page.tsx` and lets the full-screen route reuse `<WorklogNoteReader>` cleanly.
10. **UI graph + memory shards** — `.github/ui/worklog.md` rewritten; new ADR cross-linked.

### URL helpers

`useFolderSelection()` keeps writing `?folder=` and `?view=` via `router.push`. `?focus=` and `?focus=…&new=1` are handled by a new `useFocusSelection()` hook (or extension of the existing deep-links hook) that uses `router.replace` for focus changes (so back-button doesn't accumulate every row click).

### Compact embed

Untouched. `<WorklogPage compact />` continues to use the 3-pane layout with rail, internal `<WorklogFoldersRail>`, and its own `<WorklogDndProvider>`. The new components are non-compact only.

### Out of scope (explicitly)

- Real Grid view component — only the toggle ships in v1.
- Per-column resize, server-side sort, virtualization on the table.
- Touch-optimized mobile drawer behavior beyond CSS responsive defaults.
- Mode-switch animations between read and edit within the drawer (Edit always navigates, never inline-toggles).

## Status notes

- Builds on ADR-0013 (sidebar override + `?folder=`/`?view=`) and ADR-0014 (route split).
- The mockup at `public/mockups/worklog-notes-table.html` is the visual reference; the live implementation will diverge on tokens (use real shadcn primitives instead of mocked classes) and on the Edit-button placement.
