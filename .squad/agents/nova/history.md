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
