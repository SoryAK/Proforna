# Workflow: Drawer-Preview Reader for a Document-Manager Page

**Workflow type:** `drawer-preview-reader-pattern`
**Last Updated:** 2026-06-07
**Origin sprint:** ADR-0015 Phase 5 (worklog) — first implementation.

This recipe applies when a document-manager page (a list/grid of records) needs a **two-tier reading model**: a quick preview without leaving the list, and a deliberate full-screen view for editing or focus reading. Click a row → drawer slides in (preview); click "Open" in the drawer → push to a dedicated route (full-screen). Same `?focus=<id>` URL contract drives the preview; the dedicated route is its own segment.

## When this applies

- A list/grid page is the user's primary working surface (scan, filter, act on many).
- The reader is a *side effect* of selection, not the main view.
- An editing escalation already exists or is justified by user intent.
- You already have an existing edit-mode component you don't want to fork yet.

If the page IS the reader (e.g. a single-doc focused editor), skip this — go straight to a dedicated route.

## Stack Context

- Next.js 16 + Turbopack, App Router. URL state via `router.replace(href, { scroll: false })`.
- shadcn/ui v2 (base-ui). DropdownMenu, Button, Dialog primitives.
- TanStack Query v5 for the row data the drawer reuses.
- Tailwind v4 — slide animation via `transition-transform translate-x-full ↔ translate-x-0`.

## Successful Sequence

1. **ADR first.** Decide:
   - Where the reader lives (drawer vs route vs intercepted route — three honest options).
   - What the drawer shows (read-mode vs edit-mode default).
   - Where Edit escalates to (inline toggle vs dedicated route).
   - URL contract — including any `new=1`-style one-shot signals for "fresh-from-create" cases.

2. **Read-only render component.** Build it BEFORE the drawer chrome.
   - Pure. No autosave, no editor mount, no drafts, no Y.js. Renders `contentJson` via the existing static reader.
   - Title as `<h1>`, metadata as static chips, body as `<NoteView>`.
   - Test against an existing seeded note before wrapping in drawer.
   - This is the component the drawer hosts AND the full-screen route hosts. One read-mode renderer, two surfaces.

3. **Drawer chrome.** Separate component. Owns:
   - Open/close lifecycle. `inset-0` mobile = full sheet; `md:inset-y-0 md:right-0 md:w-[min(600px,50vw)]` desktop = right rail.
   - Slide animation: `translate-x-full ↔ translate-x-0` + `transition-transform duration-200 ease-out`. NEVER use a Dialog primitive — it grabs focus, fights body scroll, and forces escape semantics that conflict with "drawer open while list still interactive."
   - Esc closes. Header shows ✕ + "Open" (links to dedicated route) + kebab menu (Delete, …).
   - Body branches: spinner / empty-state / read-only renderer.
   - Drawer must not own data-fetching. Pass the row object in from the list page.

4. **List page wiring.**
   - Read `?focus=<id>` from `useSearchParams()` on every render. Drawer open if present.
   - Build a single helper `buildXxxUrl(focus, rest)` that round-trips ALL non-focus params via `URLSearchParams`. Other deep-link params (`folder`, `view`, etc.) MUST survive.
   - `handleOpen(id)` → set `?focus=<id>` via `router.replace` (NOT push — back-button should escape the page, not flip through preview history).
   - "Open in full-screen" link from the drawer = strip `focus`, build href to `/segment/[id]?<rest>`. Don't include `focus` on the dedicated route — it's redundant.
   - Delete from drawer: close drawer first (clear `?focus`), then fire mutation. The drawer being unmounted while the row deletes prevents a flash of "loading deleted note."

5. **Dedicated route.**
   - `/<segment>/[id]` page reuses the SAME read-only renderer.
   - `backHref` reconstructed from current params so back-arrow preserves filter context.
   - Width: `max-w-5xl mx-auto px-4` for prose. Don't use `max-w-3xl` — feels cramped on modern monitors with the document-manager-style title chrome.

6. **Migrate legacy callers.**
   - Find every caller pushing `?focus=` to the OLD route (e.g. `/worklog`).
   - Distinguish single-note callers (open a specific record) from list-filter callers (focus a category/folder). Only migrate the former. Renaming `?focusEquipment=` to `?focus=` would conflate intents.
   - Targets: command palette, related-record tabs, quick-capture handoff, history widgets.

7. **Docblock + UI graph + memory.**
   - Page docblock describes the URL contract and the drawer/route handoff.
   - `.github/ui/<feature>.md` — add a "Reader Drawer" section with the slide pattern and dimensions; update routes table.
   - Memory shard: add observations dated today on drawer-as-preview tier vs route-as-edit tier; record the URL contract.

## First-Attempt Failures

- **Reusing the edit-mode component inside the drawer.** Tempting because it already exists, but it mounts Tiptap, runs autosave, and hits the draft-flush race on unmount (already a documented codebase gotcha). The autosave fights the "drawer is read-only by default" decision. **Fix:** build a separate static reader; the small duplication is worth it.

- **Using a Dialog primitive for the drawer.** base-ui Dialog grabs focus and locks body scroll — both wrong for a drawer that should leave the list interactive (especially keyboard arrow-nav). **Fix:** build the drawer as a plain styled container with a one-line Esc handler. No focus-trap, no scroll-lock, no `onOpenAutoFocus` (which base-ui doesn't support anyway — that's a separate Radix-only API per user memory).

- **`router.push` for `?focus`.** Pollutes history. Each row click = one back-button press to escape preview. Want one back-button press to escape the *whole* preview model and return to where the user was before opening the page. **Fix:** `router.replace`.

- **Forgetting to strip `focus` on the "Open" link.** Leaves both `/notes/<id>?focus=<id>` parameters present. Cosmetic, but indicates URL hygiene wasn't thought through. **Fix:** `handleOpenLink` clones the search params and `delete("focus")` before constructing the href.

- **Migrating list-filter callers along with single-note callers.** First sweep risked changing `?focusEquipment=` (which means "filter list by equipment X") into `?focus=` (which means "open the drawer for note X"). They mean opposite things. **Fix:** explicit allowlist of single-note callers — equipment usage history, position worklog tab, command palette, quick capture. Skip anything that filters a list.

- **Width on the full-screen route.** Started at `max-w-3xl`. User correctly flagged "stuck centered with dead space." **Fix:** `max-w-5xl mx-auto px-4`. Document this in the recipe — the default reader-pane width on a full-screen route is wider than a Tiptap editor pane.

## Gotchas

- **Mobile drawer = full sheet, not right rail.** `inset-0` on mobile, `md:inset-y-0 md:right-0` on desktop. Two layouts, one component.

- **Slide animation timing.** 200ms `ease-out` matches OS-native drawer feel. Slower (300ms) feels sluggish; faster (150ms) feels janky on desktop.

- **Drawer + grid view layout.** When the drawer opens on a grid view, the grid does NOT need to compress (drawer is `position: fixed`, overlay-style). If the requirement is "list compresses to make room," that's a different layout system — explicitly call out the choice in the ADR.

- **Delete from drawer.** Close drawer FIRST (`router.replace` to strip `?focus`), THEN fire mutation. Mutation success → invalidate query → list re-renders. If you delete-then-close, the drawer briefly shows "note not found" while waiting for `router.replace` to commit.

- **`new=1` one-shot signal (optional).** If the page is reachable from a Quick Capture path and from a row click, both produce `?focus=<id>`. The drawer can't tell them apart. Add a one-shot `?new=1` companion param consumed and stripped on first render, so capture → edit-mode default; row-click → read-mode default. Visible in URL, debuggable, lossless on hard refresh (worst case: capture opens read-mode, user clicks Edit).

- **TanStack Query keyspace.** Drawer should not refetch the row — it should read from the same cache the list populates. Pass the row object as a prop, or read by ID from the existing query result. Adding a separate `useQuery` keyed differently = duplicate cache + double network call.

- **Don't surface drafts in the drawer.** If the underlying record has a draft (Y.js or otherwise), the drawer shows the *committed* state only. Drafts are the editor's concern; the preview tier is committed-state-only by definition.
