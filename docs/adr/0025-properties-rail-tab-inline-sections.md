# Collapse worklog reader rail to a Properties tab + Photos tab

- **Status:** Proposed
- **Date:** 2026-06-10
- **Deciders:** Sory
- **Tags:** frontend, ux, worklog

## Context and Problem Statement

ADR-0023 shipped a 4-tab right rail on the worklog reader:
`backlinks | history | tags | photos`. ADR-0023 Unit 3.1 then lifted Tags
into the rail's `tags` tab via [`InlineTagsField`](../../src/components/worklog/inline-tags-field.tsx),
which became the canonical dual-surface autosave template (xl+ rail / `xl:hidden`
inline below xl). The Tags tab works — but it also revealed a surface problem:
a 320×600 panel showing only a `TagInput` wastes ~85% of its vertical space.

Two follow-on observations:

1. **Assets and Tools (Equipment) currently live as inline blocks inside
   `WorklogNoteReader`**, stacked above each other in the reader body. The
   reader body is the same column the editor lives in — every additional
   inline metadata block pushes the editor further down the page and turns
   the reader into a vertical kitchen sink. Lifting Assets and Tools into
   the rail (the same way Tags was lifted) is the obvious next move.
2. **The four-tab shape doesn't accommodate that move cleanly.** Adding
   `assets` and `tools` as their own tabs would push the rail to 6 tabs
   (⌘1–⌘6), each with the same deadspace problem Tags has today. After
   refinement (user, 2026-06-10), the shape that actually fits the panel
   is **Tolaria-style stacked inline sections inside one scrollable
   tab** — Tags + Assets + Tools (and their backlinks/history neighbors)
   stacked vertically, single tab, single scrollable column.

The remaining design tension is **how five sections of wildly different
content sizes coexist in one scrollable column**: Tags/Assets/Tools are
short (autosave fields), but Backlinks and History can be 50+ entries each.
A naive always-expanded column buries the editable metadata behind long
reference lists. This ADR locks in the section-behavior rule, the tab
boundary, and the implementation sequencing.

Photos is **deliberately preserved as its own tab** — image previews and
upload affordances are content-heavy enough to deserve their own surface
rather than collapse into the Properties column.

## Decision Drivers

- **Eliminate rail deadspace.** The rail panel has ~600px of vertical real
  estate; one tag input doesn't earn that.
- **Single mental model for note metadata.** "Everything about this note's
  metadata in one place" beats "click around four small panels."
- **Preserve the dual-surface pattern.** ADR-0023 Unit 3.1's `InlineTagsField`
  template already mounts xl+ rail / `xl:hidden` inline. Assets and Tools
  must follow the same shape — not a new pattern.
- **No schema surface for v1.** Persisted per-section collapse state = ADR
  scope inflation. v1 must ship without a `WorklogPreferences` migration.
- **Bounded scroll depth on long lists.** Backlinks and History can be 50+
  entries each. Editable metadata must stay one viewport tall regardless.
- **Provider-neutral seam.** Each inline field component owns its own
  autosave wiring through `onUpdate` — no shared "Properties form" abstraction
  that couples Tags + Assets + Tools writes.

## Considered Options

- **Option A — Always-expanded, single scrollbar.** Tags/Assets/Tools/Backlinks/History
  stacked vertically with header dividers. One scrollbar at the column level.
- **Option B — Inner scrollers (fixed `max-h`).** Tags/Assets/Tools render at
  natural height. Backlinks and History capped at e.g. `max-h-64 overflow-y-auto`.
  Two scrollbars on screen when long lists overflow.
- **Option C — Collapsible sections with persisted state.** Each section has a
  chevron header; default expanded; collapse state synced into
  `WorklogPreferences`.
- **Option D — "Show more" pagination on lists only.** Tags/Assets/Tools
  always full; Backlinks/History show top 5 + "Show all (N)" footer that
  expands inline.

## Decision Outcome

**Chosen option: "Option B — inner scrollers"**, because it bounds the
scroll depth of the long-list sections without introducing schema surface
or per-section state, keeps editable metadata one viewport tall by default,
and is trivially convertible to Option D if the double-scrollbar feel lands
as user feedback.

The rail collapses to **two tabs**: `properties` and `photos`. `RAIL_TABS`
shrinks from 4 → 2; keyboard shortcuts ⌘1 / ⌘2; `DEFAULT_RAIL_TAB` becomes
`"properties"`. Stale `readerRailTab` preference values
(`"backlinks"` / `"history"` / `"tags"`) migrate to `"properties"` at read
time in `useReaderRailState`; the API validator (`ALLOWED_RAIL_TABS`) drops
those values so future writes can't reintroduce them.

The Properties tab body composes five sections in this order:

1. **Tags** — already shipped via `InlineTagsField`. No changes.
2. **Assets** — new `InlineAssetsField` (Unit 1). Inline `AssetPicker` with
   the existing auto-tag merge moved into the new component. Single
   `onUpdate({ assetIds, tags })` patch shape preserved.
3. **Tools (Equipment)** — new `InlineToolsField` (Unit 2). Inline
   `EquipmentPicker`. `onUpdate({ equipmentIds })`.
4. **Backlinks** — embedded in a `max-h` inner scroller. Reuses the existing
   `WorklogBacklinksPanel` component.
5. **History** — embedded in a `max-h` inner scroller. Reuses the existing
   `WorkHistoryPanel` component.

The dual-surface pattern (xl+ rail / `xl:hidden` inline) carries forward:
each new inline field component must mount inline below xl just like
`InlineTagsField` does today.

### Positive Consequences

- **Rail panel earns its real estate.** Five sections of useful content
  replace one autosave field plus 85% deadspace.
- **Tab count drops 4 → 2.** Lower visual noise on the rail strip; one less
  decision per note ("which tab am I in?").
- **`InlineTagsField` template proven and replicated twice.** Codifies the
  dual-surface pattern into something a future contributor can copy without
  reading three ADRs.
- **AssetPicker auto-tag merge race is encapsulated.** The merge logic moves
  out of the reader body and into the field component that owns the picker.
- **No schema migration.** Zero `WorklogPreferences` columns added.
  Preference value migration is read-time only.
- **Backlinks + History become reachable from the dashboard 2-pane** without
  switching tabs (currently they require ⌘1 / ⌘2 keyboard nav to reach).

### Negative Consequences

- **Two scrollbars on screen when Backlinks or History overflows.** The
  column scrolls; the inner section scrolls. Scroll-jacking edge cases at
  the section boundaries are possible. **This is the technical debt being
  incurred.** If user feedback reports "double scrollbar feels weird," the
  cheapest fix is swap to Option D (Show more); the expensive fix is
  Option C (persisted collapse). Do not retrofit C without a real
  "I keep collapsing the same section" signal.
- **History timeline rendering** (currently `WorkHistoryPanel`) embedded in
  a `max-h-64` scroller may need virtualization if a note has 200+ versions.
  Acceptable for v1; flag here so future-me doesn't re-discover.
- **Backlinks query fires on every Properties-tab open** (vs. only when the
  Backlinks tab is selected today). TanStack Query cache covers this in
  practice but the query frequency does increase.
- **Keyboard shortcut breakage.** Users who learned ⌘3 = Tags or ⌘1 = Backlinks
  lose the muscle memory. Mitigation: prefs migration plus a one-line release
  note in `.Manual/`.
- **Photos stays as its own tab forever.** If a future ADR wants
  "everything in one column" purity, Photos would need its own re-design.
  Not in scope here.

## Pros and Cons of the Options

### Option A — Always-expanded, single scrollbar

- ✅ Simplest possible shape. No state. No new prefs.
- ✅ Maximum discoverability — every section is visible.
- ❌ Long Backlinks/History blow out the column scroll.
- ❌ Editable metadata gets buried below long reference lists.

### Option B — Inner scrollers

- ✅ Bounded scroll depth on long-list sections.
- ✅ Editable metadata always one viewport tall.
- ✅ Zero schema surface.
- ✅ Trivially convertible to Option D if double-scrollbar UX lands badly.
- ❌ Two scrollbars on screen when long sections overflow.
- ❌ Possible scroll-jacking at section boundaries.

### Option C — Collapsible sections with persisted state

- ✅ User-controlled.
- ✅ Power-user friendly.
- ❌ `WorklogPreferences` schema migration.
- ❌ Per-section state sync logic.
- ❌ ADR scope inflation.
- ❌ Defeats "everything in one place" by default.

### Option D — Show more pagination on lists only

- ✅ No new prefs.
- ✅ Recent-items mental model fits History especially well.
- ✅ Column stays short by default.
- ❌ Mixed UX (some sections paginate, others don't).
- ❌ Inline "Show all" expansion can re-introduce the long-scroll problem.

## Implementation Plan

Four units, each independently revertible:

### Unit 1 — `InlineAssetsField`

- Build `InlineAssetsField` (mirrors `InlineTagsField` shape).
- Mount inline (`xl:hidden`) in `worklog-note-reader.tsx`.
- Strip standalone `AssetPicker` block from the reader.
- Auto-tag merge logic moves into the new component (single
  `onUpdate({ assetIds, tags })` patch shape preserved).
- **Rail tab unchanged.** User-visible no-op on the rail.
- Files: NEW `inline-assets-field.tsx`; EDIT `worklog-note-reader.tsx`.

### Unit 2 — `InlineToolsField`

- Build `InlineToolsField` (same shape as Unit 1).
- Mount inline below xl. Strip `EquipmentPicker` block from the reader.
- **Rail tab unchanged.** User-visible no-op on the rail.
- Files: NEW `inline-tools-field.tsx`; EDIT `worklog-note-reader.tsx`.

### Unit 3 — Rename `tags` tab → `properties`

- Rename `RailTabId` value `"tags"` → `"properties"` in `rail-tabs.ts`.
- Rename `tags-tab.tsx` → `properties-tab.tsx`. Body composes Tags + Assets + Tools
  sections in that order.
- Migrate stale `readerRailTab="tags"` preference values → `"properties"` at
  read time in `use-reader-rail-state.ts`.
- Drop `"tags"` from `ALLOWED_RAIL_TABS` in the prefs route validator so future
  writes can't reintroduce it.
- Files: EDIT `rail-tabs.ts`, `tags-tab.tsx` → `properties-tab.tsx`,
  `worklog-reader-right-rail.tsx`, `use-reader-rail-state.ts`,
  `/api/work-logs/preferences/reader-rail/route.ts`,
  `WorklogPreferences` type.

### Unit 4 — Collapse Backlinks + History into the Properties column

- Add Backlinks + History sections to `properties-tab.tsx` with `max-h` inner
  scrollers (Option B). Reuse `WorklogBacklinksPanel` and `WorkHistoryPanel`.
- Remove `backlinks` and `history` from `RAIL_TABS` (registry now: `properties`,
  `photos`).
- Set `DEFAULT_RAIL_TAB = "properties"`. Update keyboard shortcuts to ⌘1 / ⌘2.
- Migrate stale prefs (`backlinks` / `history` → `properties`) at read time and
  drop those values from `ALLOWED_RAIL_TABS`.
- Files: EDIT `rail-tabs.ts`, `properties-tab.tsx`,
  `worklog-reader-right-rail.tsx`, `use-reader-rail-state.ts`,
  `/api/work-logs/preferences/reader-rail/route.ts`.

After Unit 4, `RAIL_TABS = ["properties", "photos"]` with shortcuts ⌘1 / ⌘2.

Each unit ships as its own commit. Units 1 and 2 are user-visible no-ops on
the rail (the rail still shows Tags as today); Units 3 and 4 are the
user-visible structural changes.

## Open Questions Deferred to Implementation

- **AssetPicker compact variant?** The picker UI must work in 320px. If the
  existing component handles narrow containers reasonably, keep the inline
  shape; if it's broken below 360px, the field component takes a `compact`
  prop and `AssetPicker` gains a narrower layout. Decide at Unit 1 review,
  not here.
- **`max-h` value for Backlinks/History.** Tentatively `max-h-64` (256px).
  Adjust at Unit 4 review against a worklog that has real volume.
- **Section header style.** Each section probably wants
  `<p class="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">`
  per the existing rail tab body convention. Lock at Unit 1 review.

## Links / References

- ADR-0023 — Worklog reader right-rail (Tolaria pattern #1)
- ADR-0024 — Inline reader-first notes surface
- [`src/components/worklog/inline-tags-field.tsx`](../../src/components/worklog/inline-tags-field.tsx) — canonical dual-surface template
- [`src/components/worklog/right-rail/rail-tabs.ts`](../../src/components/worklog/right-rail/rail-tabs.ts) — `RAIL_TABS` registry
- [`src/components/worklog/right-rail/use-reader-rail-state.ts`](../../src/components/worklog/right-rail/use-reader-rail-state.ts) — preference read/write
- [`/memories/repo/parked-ideas.md`](../../#) — original parked entry that surfaced this design
- Tolaria right-panel Properties pattern (architecture reference, AGPL — patterns only, not code)
