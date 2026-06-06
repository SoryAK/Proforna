# Workflow: Section-Nav Override for a Shell-Style Page

**Workflow type:** `section-nav-override`
**Last Updated:** 2026-06-05
**Origin sprint:** ADR-0013 (worklog) — first implementation.

This recipe applies when a feature page has its own *navigation* surface (folder rail, sidebar of filters that ARE navigation, etc.) that competes visually with the global app sidebar. The fix: replace the global sidebar's contents with section-specific nav while on that route, swap the page itself to fewer panes, and move feature state into URL search params so both render in lockstep.

## Stack Context

- Next.js 16 + Turbopack, App Router, `usePathname()` and `useSearchParams()` from `next/navigation`.
- TanStack Query v5 for shared data caches between sidebar and page.
- @dnd-kit/core for drag-drop spanning sidebar and page.
- shadcn/ui v2 (base-ui) for UI primitives.

## Successful Sequence

1. **ADR first.** Decision must be written before any code (see ADR-0013 as template). Capture:
   - The section's mental-model claim ("folders are navigation, not feature UI").
   - URL contract (param names, value encodings, missing-param defaults).
   - DnD provider scope decision (lift to LayoutShell vs keep in page).
   - Compact/embedded variants and whether they participate.

2. **URL hook.** Build `useFeatureSelection()` first — everything else depends on it.
   - Read with `useSearchParams()`, write with `router.push()` so back/forward navigates.
   - `URLSearchParams` round-trip preserves unrelated params.
   - Provide `{ enabled: false }` opt-out for compact embeds (returns local state, same `[value, setter]` shape).
   - Always-mounted local state fallback inside the hook prevents rules-of-hooks violations.

3. **Section nav component.** Build the new sidebar component before touching the global `<Sidebar>`.
   - Header row with back-arrow that calls the global sidebar's `toggle()`. Collapsed = escape hatch.
   - Reuse existing feature components where possible (e.g. `<WorklogFolderTreeItems>` shipped as-is into the new sidebar — its DnD context just needs to be in scope).
   - **Verify TanStack query keys match** the page's existing `useFeatureData` hook so the cache is shared, not duplicated. (Hit this on first attempt; see "First-Attempt Failures" below.)

4. **Global sidebar route override.** Edit `<Sidebar>`:
   - `usePathname()` + collapsed state.
   - When path matches AND expanded → render section nav. When collapsed → fall back to default `<NavLinks>` (escape hatch to other top-level routes).
   - Do NOT fork all of NavLinks. Sibling component.

5. **LayoutShell DnD lift.** If sidebar+page share a DndContext:
   - Move `<FeatureDndProvider>` from page to `<LayoutShell>`, conditionally on pathname.
   - The page must NOT mount its own provider in non-compact mode.
   - Compact embed keeps its own provider (no access to the global shell).

6. **Page refactor.** Drop the rail pane:
   - Branch on `compact`. Compact = unchanged 3-pane + own DndProvider. Non-compact = 2-pane.
   - Replace `useState<FolderSelection>` with `useFolderSelection({ enabled: !compact })`.
   - Move any "content widgets" (streak/heatmap/stats — things ABOUT the data, not navigation) to the top of the surviving content pane. They're not nav; the rail wasn't their right home.

7. **UI graph + feature shard updates.**
   - `.github/ui/<feature>.md` — replace 3-pane layout description with new shape, add URL contract table.
   - `.github/ui/global.md` — add a "Section Nav Override Pattern" entry if this is the first implementation. Future overrides reference it.
   - `.github/ui/index.md` — bump last-updated.

8. **Memory update.** Add observations to both `<Feature>Domain` and `LayoutShellDomain` shards. Mark the now-superseded "X-pane layout" observation explicitly (don't delete history; it's traceable).

## First-Attempt Failures

- **Sidebar query keys.** First draft of the new sidebar used `["work-logs"]` and `["templates"]`. The page's `useWorklogData` hook uses `["worklogs"]` and `["worklog-templates"]`. Result would be duplicate caches and stale counts. **Fix:** grep the existing data hook for `queryKey` literals BEFORE writing any new `useQuery` calls in the sidebar.

- **`router.push` on every folder click → history pollution.** Trade-off accepted (matches Linear/Notion). Alternative: `router.replace` for "fast switching" + `router.push` only on entries that should be bookmarkable. Decided against because back-button navigating folders is the explicit ADR contract.

- **Forgetting compact mode opts out.** First refactor used `useFolderSelection()` with no args, which writes URL even in compact mode. The dashboard embed would have polluted its host page's `?folder=…`. **Fix:** explicit `{ enabled: !compact }` in the page; hook returns local-state behavior with same signature when disabled.

- **DnD provider double-mount.** If you forget to remove the page's own `<WorklogDndProvider>` when lifting to LayoutShell, you get nested DndContexts and drag-end fires twice. Always git-grep `<FeatureDndProvider>` after the lift.

## Gotchas

- **Templates pane swap behavior.** The "Templates" item flips the *content* of the notes-list pane to a templates list (NOT a separate route). When moving to URL state, encode this as `?view=templates` separate from `?folder=…`. Setter clears both params before applying the new selection.

- **`category:<key>` URL encoding.** Colon is technically URL-safe but visually clunky. We picked it for compactness. If you regret it, the migration is two lines in `paramsToSelection` + `selectionToParams`.

- **Query-string preservation.** Use `URLSearchParams` round-trip (`new URLSearchParams(searchParams.toString())` then `delete` only your own keys) so unrelated deep-link params (`?focus=…`, `?new=…`) survive folder-flips.

- **Activity widget home.** Resist the urge to put streak/heatmap in the new sidebar. They're content widgets, not navigation. Top of the content pane is correct. Memory shard tags this so future-you doesn't re-litigate it.

- **Don't promote to `global.md` prematurely.** First override = feature-scoped pattern. Promote the reusable parts to `global.md` only when a second feature (e.g. Inventory section nav) actually adopts it.
