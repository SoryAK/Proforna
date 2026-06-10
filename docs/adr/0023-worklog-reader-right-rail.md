# Worklog reader right-rail (Tolaria pattern #1)

- **Status:** Accepted
- **Date:** 2026-06-10
- **Deciders:** Sory, GitHub Copilot
- **Tags:** frontend, worklog, ux, persistence

## Context and Problem Statement

The worklog note reader (`src/components/worklog/worklog-note-reader.tsx`) currently stacks every secondary surface — Backlinks, History, Tags, Photos — inline below the editor body in a single vertical scroll. As notes grow, the reader becomes a long scroll well in which the body and its metadata fight for the same column. Long notes push backlinks off-screen entirely; readers lose discoverability of related material, version history, and asset context exactly when they need it most.

Tolaria (AGPL-3.0) demonstrates the inverse pattern: keep the editor body pure and rotate auxiliary surfaces into a persistent right rail with a 4-icon vertical strip + 320px content panel. We want the same affordance, written from scratch against base-ui + our existing panel components (Backlinks/History) so no AGPL code is copied.

Reference design: `public/mockups/worklog-reader-right-rail.html` — two frames (note-selected, no-selection), both preserving the existing left `WorklogFoldersRail` exactly.

## Decision Drivers

- **Reader purity** — the editor body should be just the note. Everything secondary belongs in a discoverable but dismissable surface.
- **Discoverability** — backlinks, history, tags, and photos must be one click away regardless of note length.
- **Muscle memory** — left sidebar (`WorklogFoldersRail`) must remain unchanged; the change is additive on the right.
- **Cross-device** — desktop earns the rail; mobile fallback must be ergonomic (bottom-sheet, not a shrunken rail).
- **Persistence** — the rail's open/closed + active-tab state should survive page reloads without bloating the DB.
- **License hygiene** — Tolaria informs the pattern; no source code copied.

## Considered Options

- **Option A — Right rail (this ADR)** — 44px icon strip + 320px content panel. 4 tabs: Backlinks, History, Tags, Photos. Persistent per-user. Mobile = bottom-sheet.
- **Option B — Stacked inline (status quo)** — leave everything in vertical scroll. No new surfaces.
- **Option C — Tabbed bottom panel** — Discord/Slack-style horizontal tab strip docked below editor. Always visible, never collapses.
- **Option D — Modal popovers per icon** — floating icon strip but each tab opens as a modal overlay, not a docked panel.

## Decision Outcome

**Chosen option: "Option A — Right rail"**, because it preserves reader purity without hiding secondary surfaces, matches the proven Tolaria interaction model, and aligns with the existing 3-pane shell (folders rail · list · reader) by extending — not redesigning — the right edge.

### Locked design (from mockup)

1. **Surface** — desktop-only at `xl:` breakpoint. 44px vertical icon strip + 320px content panel. Collapses to a 7px ghost stub.
2. **Tabs at launch (v1, all 4 ship together)** — Backlinks, History, Tags, Photos. Tags and Photos move out of the inline reader scroll into rail panels; reader body becomes just the note + status bar.
3. **Deferred** — Table of Contents tab unlocks automatically when a note has ≥4 headings OR ≥800 words. Not in v1.
4. **Persistence — per-user** — two new columns on `WorkLogPreference`:
   - `readerRailTab: String @default("backlinks")` — last-active tab key.
   - `readerRailCollapsed: Boolean @default(false)` — collapsed state.
   Per-user (not per-note): matches Tolaria, one column pair, no per-note write amplification.
5. **Keyboard** — `⌘1`–`⌘4` switch tabs; `⌘\` toggle collapse. Shortcuts only bind when reader is focused.
6. **No-selection mode** — when no note is selected: reader + rail collapse, notes list claims `flex-1`, the **7px ghost rail stays** on the right edge as an affordance and signal that the rail still exists. Esc-Esc deselects.
7. **Edit-mode rail** — rail stays open by default while editing (does not auto-collapse on focus).
8. **Mobile fallback** — `< xl`: bottom-sheet variant with horizontal tab strip across the top. Single sheet, swipe to dismiss.
9. **AGPL boundary** — Tolaria informs interaction grammar only. Components written from scratch against base-ui, reusing our existing `WorklogBacklinksPanel` and `WorklogHistoryPanel` inside the rail tabs.

### Positive Consequences

- Editor body becomes a pure reading/writing surface; long notes no longer bury their own metadata.
- Backlinks and version history become first-class navigation aids (always visible toggle in icon strip, badge counts).
- Tags + Photos get dedicated real estate without competing with the body for vertical space.
- Cross-session continuity: users land on their preferred tab on every note open.
- Mobile is not punished — bottom-sheet is a proven small-screen pattern.

### Negative Consequences

- New persistence columns require a Prisma migration + `WorklogPreferences` type extension + matching test coverage in `src/data/worklog-preference.ts` (TDD-mandated by Phase 2.5).
- Reader integration is a larger refactor than the parked entry implied — Tags and Photos must be relocated out of the editor scroll, not just augmented.
- Mobile bottom-sheet is a new component with its own gesture/focus-trap responsibilities.
- Adds a second rail-state machine to maintain alongside `WorklogFoldersRail`'s existing collapse logic.
- Keyboard shortcuts (`⌘1`–`⌘4`, `⌘\`) compete with existing app/browser bindings — must scope to reader focus.

## Pros and Cons of the Options

### Option A — Right rail

- ✅ Reader body stays pure; long notes no longer bury Backlinks.
- ✅ 4 tabs surface secondary data without scroll cost.
- ✅ Reuses existing `WorklogBacklinksPanel` / `WorklogHistoryPanel` — minimal panel rewrite.
- ✅ Per-user persistence is cheap (two columns, one row per user).
- ❌ Larger reader refactor (Tags + Photos relocation).
- ❌ Adds new state machine + mobile bottom-sheet to maintain.

### Option B — Stacked inline (status quo)

- ✅ Zero new code.
- ❌ Long notes hide Backlinks/History below the fold.
- ❌ No way to keep a tab "pinned" while scrolling the body.

### Option C — Tabbed bottom panel

- ✅ Cross-platform (no mobile fallback needed).
- ❌ Steals vertical space from the editor body permanently.
- ❌ Awkward with the existing status bar; competes for the same screen edge.
- ❌ Discord-style bottom tabs feel like dev tools, not reading affordances.

### Option D — Modal popovers per icon

- ✅ Zero permanent space cost.
- ❌ Forces context switches (modal overlays interrupt reading).
- ❌ Cannot reference rail content while editing — defeats the purpose of Backlinks.

## Links / References

- Design mockup: `public/mockups/worklog-reader-right-rail.html` (two frames + state gallery + 9 design-decision details)
- Parked-ideas entry source: `/memories/repo/parked-ideas.md` — Tolaria pattern #1
- Related ADRs:
  - [ADR-0007](./0007-worklog-notes-three-pane-redesign.md) — established the 3-pane shell this rail extends
  - [ADR-0015](./0015-worklog-notes-document-manager.md) — reader/list/sidebar contracts
  - [ADR-0016](./0016-note-to-note-linking-and-backlinks.md) — `WorklogBacklinksPanel` source
  - [ADR-0017](./0017-worklog-version-history-and-visual-diff.md) — `WorklogHistoryPanel` source
  - [ADR-0018](./0018-tdd-as-first-class-skill.md) — Phase 2.5 mandates RED-GREEN-REFACTOR for the persistence work in `src/data/**`
- License note: Tolaria is AGPL-3.0; this work copies no source. Pattern reference only.
