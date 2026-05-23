# WorkLog User-Defined Folders

## Feature Name
Folders — user-defined directory tree for WorkLog notes.

## Functional Description
End-users can organise their WorkLog notes into a hierarchy of personal
folders (e.g. `2026 Q2 / Customer Escalations / Acme`). Folders are
independent from the note's `category` axis (a `learning` note and an
`accomplishment` note can sit in the same folder). Every note is either
inside a folder or shown under the virtual **Unfiled** group.

The folder tree lives in the left rail under a **Folders** section,
below Categories and Library. Users can:

- Create root and child folders (`+` next to the section header, or
  "New subfolder" from a folder's kebab menu).
- Rename a folder inline (kebab → Rename, or single-click on the active
  folder name).
- Move a folder to another parent or to the root (kebab → Move…).
- Delete a folder in two modes:
  - **Orphan** (default): folder is removed; its notes become Unfiled;
    its child folders are re-rooted to the deleted folder's parent.
  - **Hard delete**: the entire subtree (folders + notes) is removed.
    Requires the user to type the folder name to confirm.

A note's folder is set in the reader (meta-strip → Folder pill) and is
persisted as `WorkLog.folderId`. Selecting a folder in the rail filters
the notes list to the folder **and all its descendants**.

## Internal Workflow

1. **Storage** — `WorkLogFolder` table (`id`, `userId`, `parentId`,
   `name`, `color?`, `icon?`, `sortOrder`, timestamps). `WorkLog.folderId`
   is a nullable FK with `ON DELETE SET NULL`.
2. **Read** — `GET /api/work-logs/folders` returns a flat list +
   per-folder note counts (`prisma.workLog.groupBy`) and the global
   `unfiledCount`. The client builds the tree via
   `buildFolderTree(folders)` in [src/lib/worklog-folders.ts](src/lib/worklog-folders.ts).
3. **Write** —
   - `POST /api/work-logs/folders` creates a folder (validates name,
     ownership of parent, and depth ≤ 8).
   - `PATCH /api/work-logs/folders/[id]` updates name/color/icon/sortOrder
     or moves the folder. Cycle-prevention walks ancestors server-side;
     subtree depth is re-validated.
   - `DELETE /api/work-logs/folders/[id]?mode=orphan|delete` — hard
     delete additionally requires header `x-folder-name-confirm` matching
     the folder name exactly.
4. **Filter** — In `worklog-page.tsx`, when the active folder is
   `{ kind: "folder", folderId }`, the visible list filter calls
   `collectDescendantIds(folders, folderId)` and keeps notes whose
   `folderId` is in that set. `{ kind: "unfiled" }` keeps notes with
   `folderId == null`.
5. **Move a note** — meta-strip Folder pill opens
   `WorklogMoveToFolderDialog`. Choosing a target calls
   `saveLog.mutate({ id, folderId })`. "Unfiled" sets `folderId` to null.

## Configuration / Params

- `FOLDER_MAX_DEPTH = 8` — clamps tree nesting (root counts as depth 1).
- `FOLDER_NAME_MAX = 80` — character limit on folder names.
- LocalStorage key `worklog-folder-tree-expanded` — set of expanded
  folder IDs; persists across reloads.
- TanStack Query keys: `["worklog-folders"]` (folders + counts) and
  `["worklogs"]` (notes — invalidated together when a folder is
  deleted in case `folderId` was nulled on cascade).

## Known Constraints

- Single-user trees only; folders are not sharable or workspace-scoped.
- No drag-and-drop reordering or moving in v1 — use the kebab → Move…
  dialog. Sort is alphabetical by default; `sortOrder` is reserved on
  the schema for future use.
- No emoji or color picker in v1 (schema fields exist; UI deferred).
- Hard-delete requires retyping the folder name — there is no
  "are you really sure" shortcut.
- Descendant collection is O(n) over the user's folders. Fine for
  ≤ ~200 folders; large trees would warrant indexing.
