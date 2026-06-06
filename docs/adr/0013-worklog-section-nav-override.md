# Worklog Section Nav Override + URL Folder State

- **Status:** Accepted
- **Date:** 2026-06-05
- **Deciders:** Sory
- **Tags:** frontend, layout, navigation, worklog

## Context and Problem Statement

The `/worklog` page rendered three vertical rails before any editor surface:

1. The global app sidebar (`<Sidebar>` from `src/components/sidebar.tsx`).
2. A worklog-local folders rail (`<WorklogFoldersRail>`) — All notes / Notable / Folders / Categories / Library, plus an Activity heatmap and stats strip.
3. A notes-list pane.

On a 1366-px laptop this consumed ~800 px of left-side chrome before the editor, leaving the actual writing surface squeezed. The folders rail was also competing visually with the global sidebar even though both were *navigation* — they just had different scope (app-wide vs section-wide).

A side-panel mockup compared two patterns:

- **Pattern X (Swap)** — when the user is in `/worklog`, the global sidebar swaps its contents to worklog navigation (back-arrow ← returns to top-level nav). Worklog page content becomes 2-pane (notes list + editor).
- **Pattern Z (Hybrid)** — top-level nav stays visible, with worklog sub-nav expanded inline beneath it. Sidebar grows taller, not wider.

The user picked Pattern X, with a stated reason: folders + categories + library are "navigation, mainly" and belong with the rest of app navigation rather than fighting it.

A second decision followed: today `WorklogPage` owns folder selection in local React state. That means folder state isn't bookmarkable, isn't navigable with browser back/forward, and resets on refresh. With the rail moving to the global sidebar, multiple components (sidebar, page, future deep-links) need a shared source of truth. URL search params are the natural candidate.

## Decision Drivers

- **Stop the chrome stacking pain** — the user's stated trigger.
- **Folders/categories/library are navigation, not feature UI** — they should live where the rest of nav lives.
- **Bookmarkability and back-button parity with peer apps** (Linear / Notion / Mail) — folder views should round-trip through the URL.
- **Don't lose existing power** — drag-drop folder reordering, live counts, templates pane swap, drag-from-notes-list-onto-folder must all survive.
- **Don't grow more god-files** — `worklog-page.tsx` was already at 457 lines.
- **Keep the dashboard-embed (`compact`) variant working** without architectural change.

## Considered Options

- **Option A — Pattern X with global-sidebar route override.** When `pathname.startsWith("/worklog")`, the global `<Sidebar>` renders a `<WorklogNavSidebar>` instead of the default `<NavLinks>`. URL search params (`?folder=…&view=…`) become the source of truth for folder selection.
- **Option B — Pattern Z, expand-in-place sub-nav.** Top-level nav stays visible; worklog sub-nav expands inline beneath the active item. Side-by-side mockup showed this competes with vertical scroll real-estate when the section has many entries.
- **Option C — Keep the local rail; add a "collapse rail" toggle.** Smallest blast radius, preserves all existing UX, but does not change the user's mental model that folders are *navigation*. Still leaves three rails when expanded.

## Decision Outcome

**Chosen option: Option A — Pattern X with global-sidebar route override + URL-driven folder state.**

The user's framing was decisive: folders/categories/library are navigation, and navigation belongs in the navigation rail. Pattern X delivers that with a single sidebar width and zero ambiguity about where nav lives. URL state is the right contract because it is naturally shared, naturally undoable (back button), naturally linkable, and matches every peer app users already use.

The new architectural primitive ("a route can override the contents of the global sidebar") is intentionally narrow this round: only `/worklog` opts in. Future shells (potentially Inventory or Documents) may reuse the same primitive but require their own ADR.

### Positive Consequences

- Worklog page becomes 2-pane (notes list + editor); the editor reclaims ~220 px of horizontal space.
- Folder selection is bookmarkable: `/worklog?folder=field-kit` round-trips. Browser back/forward navigate through folders.
- Sidebar nav becomes a single, predictable column.
- `worklog-page.tsx` shrinks toward its single responsibility (orchestrating panes), improving the file-size headroom.
- Activity widget moves to the top of the notes-list pane — a more natural home for *content* (vs *navigation*).
- The override primitive is reusable: future shell-style pages can adopt it without re-litigating the architecture.

### Negative Consequences

- `<Sidebar>` now has two render paths (default vs override) — small but real branching cost.
- `<WorklogDndProvider>` must wrap both the global sidebar and the page content, since dragging a note onto a folder in the sidebar still has to work. The provider's mount point becomes layout-shell-aware on `/worklog`.
- Navigating *out* of `/worklog` requires either the back-arrow inside the override or collapsing the sidebar (which falls back to the default top-level nav). Discoverability is worse than today's permanent top-level nav. Mitigation: explicit ← back arrow in the override header.
- URL state is a public-ish contract — query-param shape (`?folder=…&view=…`) becomes a thing we shouldn't break casually.
- Compact-mode `<WorklogPage compact />` keeps its own `<WorklogFoldersRail>` because it doesn't have access to the global sidebar. Two code paths for folder navigation now exist. Acceptable: `compact` is an embedded surface, fundamentally different.

## Pros and Cons of the Options

### Option A — Pattern X with global-sidebar route override

- ✅ Single sidebar; cleanest "where does nav live" answer.
- ✅ URL state unlocks bookmarkability + back-button + future deep-links.
- ✅ Architecturally reusable primitive for future shell-style pages.
- ❌ Two sidebar render paths to maintain.
- ❌ DnD provider must move.
- ❌ Top-level nav becomes one-click-away (back arrow) instead of always visible.

### Option B — Pattern Z, expand-in-place

- ✅ Top-level nav always visible.
- ✅ Single click between sections.
- ❌ Sidebar grows tall; folders+categories+library push other top-level items below the fold on smaller screens.
- ❌ Doesn't fully resolve the user's mental model that nav was duplicating itself; just shows it more compactly.

### Option C — Local rail + collapse toggle

- ✅ Smallest change; preserves every existing power-user behavior.
- ❌ Does not address the underlying mental-model issue: folders/categories/library are navigation living in two places.
- ❌ A collapsed rail still exists as a third visual entity.

## Implementation notes

- **URL contract:** `/worklog?folder=<id|category|notable|all>&view=<notes|templates>`. Missing params default to `folder=all` + `view=notes`. New hook `useFolderSelection()` is the single read/write entry point.
- **Override gating:** `<Sidebar>` checks `usePathname()`. When the path starts with `/worklog`, render `<WorklogNavSidebar>` instead of `<NavLinks>`. Collapsing the sidebar (existing `useSidebar` toggle) keeps the global icon nav, providing a quick escape to other top-level routes.
- **DnD provider scope:** lift `<WorklogDndProvider>` to wrap the worklog-active section of `<LayoutShell>` so both the override sidebar and the page can participate in drag operations.
- **Compact embed:** unchanged. `<WorklogPage compact />` keeps its own internal `<WorklogFoldersRail>`.

## Status notes

- The `<FullBleedShell>` primitive (added 2026-06-05 earlier in the same session) remains the chosen way for this page to opt out of LayoutShell's default padding wrapper. ADR-0013 only governs the sidebar+state piece.
