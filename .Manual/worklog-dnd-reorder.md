# Worklog Notes & Folder Drag-and-Drop Reorder

**Status:** Shipped
**Owner:** Nova (Frontend)
**Related ADR(s):** [0012](../docs/adr/0012-w2.1-dnd-context-and-tree-strategy.md)
**Source files:**
- `src/components/worklog/worklog-dnd-provider.tsx`
- `src/components/worklog/hooks/use-worklog-dnd.ts`
- `src/components/worklog/worklog-folder-tree.tsx`
- `src/components/worklog/worklog-folder-tree-items.tsx`
- `src/components/worklog/worklog-notes-list.tsx`
- `src/components/worklog/constants.ts` (DND_* constants)

---

## 1. Functional Description

Users can reorder items in the worklog by dragging and dropping:

- **Notes within a folder**: When viewing a specific folder, note rows in the middle pane can be dragged up or down to reorder them. The order is persisted to the server.
- **Folder rows in the sidebar**: Folder rows in the left rail can be dragged up or down to reorder them among their siblings (same parent). The order is persisted to the server.

While dragging, a "ghost" pill (a floating preview showing the item title or folder name) follows the cursor. The original row becomes semi-transparent. Valid drop targets gain a highlighted ring.

Cross-folder **reparenting** (moving a note from one folder to another) is handled separately via the right-click → "Move to folder…" dialog, not via drag-and-drop.

---

## 2. Internal Workflow

1. **Mount**: `WorklogDndProvider` wraps the 3-pane grid in `worklog-page.tsx`. It mounts a single `<DndContext>` from @dnd-kit/core.

2. **Sensor activation**: `useWorklogDnd()` configures a `PointerSensor` with an activation distance of 8px. This prevents accidental drags from clicks.

3. **Sortable registration**:
   - Folder rows: each row in `worklog-folder-tree.tsx` is wrapped in `SortableFolderWrapper` (uses `useSortable({ id: "folder:<id>" })`). A single flat `<SortableContext>` in `worklog-folder-tree-items.tsx` registers all folder IDs in pre-order depth-first order (via `flattenFolderTree`).
   - Note rows: when `sortable={true}` is passed to `WorklogNotesList` (which happens when `activeFolder.kind === "folder"`), each `<li>` row is wrapped in `SortableNoteWrapper` (uses `useSortable({ id: "note:<id>" })`). A `<SortableContext>` wraps each group's `<ul>`.

4. **Drag start** (`onDragStart`): `useWorklogDnd` records `activeId` and `activeType`. `WorklogDndProvider` looks up the dragged item from the TanStack Query cache and renders it in `<DragOverlay>`.

5. **Drag over** (`onDragOver`): `useWorklogDnd` tracks `overId` and `overIsFolder` to allow cross-container detection.

6. **Drag end** (`onDragEnd`): `useWorklogDnd` computes the new position using `arrayMove`. It then calls either:
   - `reorderNotes({ noteIds })` → `POST /api/work-logs/reorder` → Prisma `$transaction` assigns dense `sortOrder` to all siblings.
   - `reorderFolders({ folderIds })` → `POST /api/work-logs/folders/reorder` → same pattern.
   Both mutations use TanStack Query v5 optimistic updates (onMutate → cache patch, onError → rollback, onSettled → invalidate).

7. **Visual feedback**: DnD constants from `constants.ts`:
   - `DND_ACTIVE_ROW_CLASS = "opacity-40"` — applied to the dragged row's original position.
   - `DND_DROP_TARGET_CLASS = "ring-1 ring-ring bg-accent/30"` — available for future drop-zone highlighting.

---

## 3. Configuration / Params

| Name | Location | Default | Purpose |
|------|----------|---------|---------|
| `DND_DROP_TARGET_CLASS` | `src/components/worklog/constants.ts` | `"ring-1 ring-ring bg-accent/30"` | Tailwind classes for a valid drop-target highlight |
| `DND_ACTIVE_ROW_CLASS` | `src/components/worklog/constants.ts` | `"opacity-40"` | Tailwind class for the row being dragged |
| Pointer activation distance | `use-worklog-dnd.ts` | `8px` | Min pixels to move before a drag starts |
| `FOLDER_MAX_DEPTH` | `src/lib/worklog-folders.ts` | `8` | Max folder nesting depth |
| `MAX_ITEMS` | API route | `200` | Max items accepted in a single reorder batch |
| `sortable` prop | `WorklogNotesList` | `false` | Enables note DnD; true only in folder view |

---

## 4. Known Constraints

- **Folder view only for notes**: Note DnD reorder is only active when `activeFolder.kind === "folder"`. "All Notes", category views (Task, Meeting, etc.), Notable, and search results are read-only — the list is sorted by date and reorder would be semantically wrong.
- **Same-parent only for folders**: Folder DnD only reorders siblings within the same parent. Cross-parent folder reparenting is done via the "Move…" dialog in the folder row kebab menu.
- **No note cross-folder reparenting via DnD**: Moving a note to a different folder is done via the right-click → "Move to folder…" context menu.
- **Compact rail**: The compact mode sidebar (icon-only, ≤48px wide) shows a folder popover; DnD is not active inside that popover.
- **Touch not configured**: Currently only `PointerSensor` is configured. Touch-specific `TouchSensor` has not been added.

## 5. Future / Deferred

- `TouchSensor` for mobile drag-and-drop support — deferred until mobile layout is designed.
- `DND_DROP_TARGET_CLASS` visual feedback on folder rows during note drag (cross-folder reparent via DnD) — deferred; current UX uses Move dialog instead.
