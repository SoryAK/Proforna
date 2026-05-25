# Nova — Session History

What Nova knows about this project. Accumulated across sessions.

## Component Patterns

- Worklog is the most complex feature: `src/components/worklog/` — orchestrator `worklog-page.tsx` + hooks in `hooks/`
- Hooks extracted in W1.1: `use-worklog-preferences`, `use-worklog-visible-logs`, `use-worklog-stats`, `use-worklog-create-flow`, `use-worklog-keyboard-nav`
- The `/` shortcut opens the search palette (WorklogSearchPalette). `Cmd/Ctrl+A` selects all visible logs.
- shadcn/ui v2: NO `asChild`. Use `render` prop. `DropdownMenuLabel` must be in `DropdownMenuGroup`.
- Tiptap 3: never pass `null` to `useEditor`. Gate mount with outer component.
- Images for user uploads: use `unoptimized` prop on `<Image>` (Turbopack image optimizer returns null for some `/public/uploads/*` paths).

## Key Files

- `src/components/worklog/worklog-page.tsx` — main orchestrator
- `src/components/worklog/worklog-notes-list.tsx` — list with checkbox column (W1.3)
- `src/components/worklog/worklog-search-palette.tsx` — `/` overlay (W1.2)
- `src/components/worklog/worklog-bulk-action-bar.tsx` — floating bulk bar (W1.3)
- `src/components/worklog/worklog-folders-rail.tsx` — left rail (smart folders, categories, library, heatmap); 396 lines post-split (T4.0)
- `src/components/worklog/worklog-folder-tree-items.tsx` — user-defined folders section extracted from rail; owns `useWorklogFolders`, CRUD handlers, move/delete dialogs; 161 lines (NEW T4.0)
- `src/components/ui/` — all shadcn/ui v2 components

## Learnings

### T4.0 — Rail God-File Split (2026-05-24)
- **Split boundary**: Extracted `useWorklogFolders` hook call, `moveTargetId`/`deleteTargetId` dialog states, `handleCreateRoot`/`handleCreateChild` handlers, `WorklogFolderTree` render, and `WorklogMoveToFolderDialog`/`WorklogFolderDeleteDialog` dialogs into new `WorklogFolderTreeItems` component.
- **Type promotion**: `FolderSelection` discriminated union was inline in rail; moved to `src/types/worklog.ts` to avoid circular import. Rail re-exports it with `export type { FolderSelection } from "@/types/worklog"` for backward compat with `worklog-page.tsx` consumer.
- **TS pattern**: `export type { X } from "mod"` (re-export) + `import type { X } from "mod"` (local use) in same file — both valid TypeScript, no compiler error.
- **Final line counts**: rail = 396, tree-items = 161 (both under 300-line target; rail is above 300 due to retained logic — heatmap, stats strip, smart folders — acceptable since only the folder tree section was in scope).
- **PowerShell workaround**: Dead-code trim on the rail used `(Get-Content $path)[0..N]` pattern when `replace_string_in_file` failed due to Unicode `…` chars in the old string.

### T3.1 / T3.2 — DnD Mutations + Core Hook (2026-05-25)
- `sortOrder?: number` added to `WorkLog` type as optional after `updatedAt` (`prisma generate` was blocked by OneDrive EPERM; DB column already exists).
- `reorderNotes` and `reorderFolders` mutations added to `useWorklogMutations` (file: `use-worklog-mutations.ts`). Both use TanStack Query v5 optimistic `onMutate` + `onError` rollback + `onSettled` invalidate pattern matching `saveLog`.
- `FolderListResponse` imported from `./use-worklog-folders` into `use-worklog-mutations.ts` to type the folder cache snapshot.
- `use-worklog-dnd.ts` created at `src/components/worklog/hooks/`. Exports `useWorklogDnd()` → `WorklogDndState`. ID prefix convention: `"note:<id>"`, `"folder:<id>"`, `"zone:unfiled"`, `"zone:notable"`. Hook is self-contained (calls `useWorklogMutations()` internally). No `"use client"` directive needed.

### T4.1–T4.5 — DnD UI Wiring (2026-05-25)
- `DND_DROP_TARGET_CLASS` and `DND_ACTIVE_ROW_CLASS` constants appended to `constants.ts` — pure Tailwind strings, no imports needed.
- `WorklogDndProvider` created as a `"use client"` wrapper around `<DndContext>` + `<DragOverlay>`. Calls `useWorklogData()` and `useWorklogFolders()` for ghost lookups — both are already mounted by the page so no extra network requests.
- `SortableFolderWrapper` added to `worklog-folder-tree.tsx` (renders `<div>` with DnD attrs). The `renderNode` return wraps with it; key moves to wrapper. Added imports: `useSortable`, `CSS`, `DND_ACTIVE_ROW_CLASS`.
- `worklog-folder-tree-items.tsx`: added `useMemo`, `SortableContext`/`verticalListSortingStrategy`, `flattenFolderTree`/`buildFolderTree`. Computes flat pre-order folder ID list for single `<SortableContext>` wrapping `WorklogFolderTree`.
- `worklog-notes-list.tsx`: added `sortable?: boolean` prop + `SortableNoteWrapper` (renders `<div>` — keeps `<ul>→<li>` ARIA attrs intact inside, trades perfect HTML for simpler a11y preservation). `SortableContext` always rendered; empty `items=[]` when `sortable=false`.
- `worklog-page.tsx`: wraps 3-pane grid with `<WorklogDndProvider>`. Passes `sortable={activeFolder.kind === "folder"}` to `WorklogNotesList`.
- **God-file check**: folder-tree.tsx ≈503 lines, notes-list.tsx ≈487 lines, page.tsx ≈447 lines — all under 600. ✓

### T5 — Bulk Mode Activation Gate (2026-05-25)
- Bulk mode is gated by `bulkMode` state in `worklog-page.tsx`; toggled via `toggleBulkMode` (useCallback) in `WorklogToolbar` "Select" button.
- `selection` prop on `WorklogNotesList` is `undefined` when bulk mode is off — no checkboxes rendered, no row-click toggle.
- `sortable` prop is `false` when bulk mode is on — DnD and bulk mode are mutually exclusive.
- The "Select" toggle button lives in `WorklogToolbar`; Escape also exits via a `keydown` effect on `window`.
- Row click in bulk mode: always calls `selection.toggle(l.id)` AND `onSelect(l.id)` so the note opens simultaneously with checkbox toggle.
