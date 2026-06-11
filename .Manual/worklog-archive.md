# Worklog — Archive Bucket (Gmail-style)

## Feature Name
Worklog **Archive** — soft-dismiss a note without deleting it.

## Functional Description
Lets the user dismiss a note from the active worklog without losing the
content. The note stays in its folder, keeps its tags and assets, and
can be restored at any time with one click. The default "All notes"
view hides archived rows; a dedicated **Archived** row in the sidebar
exposes them. Bulk archive/unarchive works the same way as bulk
move/delete (Gmail rhythm).

## Internal Workflow
1. **Trigger archive** — any of:
   - Reader header → click the Archive icon button (between the
     Promoted indicator and Delete). Single click, no confirm.
   - Multi-select rows in the middle pane → Archive button in the
     floating bulk bar (`WorklogNotesBulkBar` / `WorklogBulkActionBar`).
   - Sidebar Archived row + multi-select → Archive button flips into
     **Unarchive**, restoring the rows back to "All notes" / their
     folder.
2. **Wire format** — every surface emits the same intent:
   - Single note: `PUT /api/work-logs/[id]` with body `{ archived: true \| false }`.
   - Bulk: `POST /api/work-logs/bulk` with body
     `{ action: "archive" \| "unarchive", ids: [...] }`.
3. **Server clamps the timestamp** — when `archived: true` the server
   sets `archivedAt = new Date()`. When `archived: false` it sets
   `archivedAt = null`. The client never authors the timestamp.
4. **List + search filtering** —
   - `GET /api/work-logs` and `GET /api/work-logs/search` with no
     archived param hide archived rows by default.
   - `?archived=only` returns ONLY archived rows.
   - `?archived=all` returns both buckets.
5. **Client cache strategy** —
   - `useWorklogData` fetches `?archived=all` once.
   - `useWorklogVisibleLogs` partitions the cached list by sidebar
     selection: Archived row → archived rows; everything else →
     unarchived rows.
   - `useWorklogMutations.saveLog` translates the boolean intent into
     a synthetic `archivedAt` (now or null) for instant optimistic
     bucket-flip; server response replaces it with the authoritative
     timestamp.
6. **Sidebar counts** — `worklog-nav-sidebar.tsx` reads the same
   cached list and renders `inboxCount` (archivedAt == null) on
   "All notes" and `archivedCount` (archivedAt != null) on the
   Archived row.

## Configuration / Params
| Constant | Where | Value | Meaning |
|---|---|---|---|
| `ACTIONS` | `src/app/api/work-logs/bulk/route.ts` | `["move","delete","archive","unarchive"]` | Allowed bulk actions; widen here when adding pin/star. |
| `archivedParam` | `src/app/api/work-logs/route.ts` | `"only" \| "all" \| absent` | Server-side bucket filter. |
| Reader Archive button | `src/components/worklog/worklog-note-reader.tsx` | `aria-pressed={!!log.archivedAt}` | Reflects bucket state for screen readers. |
| Bulk bar `archivedView` | `worklog-notes-bulk-bar.tsx`, `worklog-bulk-action-bar.tsx` | `activeFolder.kind === "archived"` | Flips Archive button into Unarchive. |
| Schema index | `prisma/schema.prisma` | `@@index([userId, archivedAt])` | Powers the `archivedAt IS NULL` / `IS NOT NULL` filters. |

## Known Constraints
- **No per-row right-click Archive shortcut yet.** Right-click on a row
  in the middle pane currently opens the Move-to-Folder dialog. To
  archive without leaving the keyboard, multi-select-of-1 the row and
  use the bulk bar's Archive button. A unified row context menu with
  Move + Archive + Delete merged is parked for a future sprint.
- **Single-fetch client.** The cached list contains both archived and
  unarchived rows. At very large dataset sizes (10k+ notes) we may
  need to switch to a lazy fetch for the archived bucket, but at
  current sizes this is the simplest correct architecture.
- **No "archive on delete-confirm-cancel" flow.** Delete still uses
  `confirm("Delete this note?")` (which is blocked in Next 16 dev — see
  user memory). When that's swapped to a Dialog, an "Archive instead"
  affordance can be added there.
- **Server is the timestamp authority.** Local clock skew never
  reorders archives. Pre-existing optimistic patches in saveLog use
  the local clock for the *bucket flip only*; the persistent value is
  always the server's.
- **Search ranking.** Archived notes are excluded from default search,
  not de-ranked. Pass `?archived=only` to search ONLY archived rows or
  `?archived=all` for unified search.

## Related
- ADR-0026 — Worklog Archive Bucket.
- ADR-0007 — Worklog three-pane redesign (the surfaces that gained the
  archive button).
- ADR-0011 — Postgres tsvector worklog search (now respects the
  archived filter).
- `.Manual/worklog-bulk-actions.md` — same bulk bar / `bulkAction`
  invalidation pattern.
- `.Manual/worklog-folders.md` — folders are independent of the
  archive bucket; archiving never reassigns `folderId`.
