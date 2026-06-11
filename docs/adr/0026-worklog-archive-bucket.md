# 0026 — Worklog Archive Bucket (Gmail-style)

- **Status:** Accepted
- **Date:** 2026-06-11
- **Deciders:** Sory (product + engineering)
- **Tags:** worklog, ux, data, api

## Context and Problem Statement

The worklog list grows quickly — quick-captures from a phone, end-of-day
reflections, AI-suggested cards, and import drops all pile up in the
default "All notes" view. Users explicitly told us they want a way to
get a note **out of their way without deleting it**. They want the same
escape hatch Gmail's archive offers: "I'm done thinking about this, but
don't make me confirm a destructive dialog and don't lose the content."

Two failure modes drove the work:

1. **Delete-as-archive misuse** — users were Trash-ing notes they would
   later regret (interview prep notes, role notes, draft AI prompts).
   Soft-delete already exists at the DB level, but the only UI surface
   to dismiss a note was the destructive Delete button.
2. **Folder-as-archive misuse** — power users were creating folders
   like "Old", "Archive 2025", "Done" and dragging notes there. The
   folder system is meant for *organizing what's active*, not for
   *hiding what's done*. A bucket separate from the folder tree was
   required.

The constraint was that the bucket had to be **truly orthogonal** to
folders: a note in `MyJob/Interviews` should be archivable without
losing its folder, and unarchiving should restore it back into
`MyJob/Interviews` without any "where do I put this?" prompt.

## Decision Drivers

- **No data loss.** Archive must be reversible without confirmation
  cost. A single click both archives and unarchives.
- **Server is the timestamp authority.** Client clocks can drift; the
  server clamps `archivedAt` so audit ordering and "recently archived"
  views stay correct.
- **Folder-orthogonal.** `archivedAt` lives next to `folderId`, not
  inside it. A folder can have archived + unarchived members
  concurrently.
- **Single-fetch client.** The sidebar already had to fetch all worklogs
  for filter chips and counts. Archive shouldn't double the network
  cost; the client filters one cached list into two buckets.
- **TDD-coverable contract.** Every API endpoint that touches
  `archivedAt` had to be re-verifiable from tests alone. Per ADR-0018,
  Phase 2.5 of the pipeline is non-negotiable for `src/lib`,
  `src/app/api`, and `src/data`.

## Considered Options

- **Option A — Soft-delete repurposed as archive.** Use the existing
  `deletedAt` field. Surface a "Trash → Restore" UI.
- **Option B — A new top-level `archivedAt` field next to `folderId`,
  Gmail-style.** Single boolean intent on the wire; server clamps
  timestamp. Sidebar gets a dedicated Archived row that toggles a
  bucket filter on top of the existing folder/filter system.
- **Option C — A reserved system folder named "Archive".** Notes are
  *moved* into and out of it.

## Decision Outcome

**Chosen option: "Option B"**, because it cleanly separates
"organization within the active workspace" (folders) from
"this is no longer active" (archive bucket), and because the server
remains the authority on the archive timestamp.

### Positive Consequences

- **Truly reversible UX.** No confirm dialog on archive (vs. delete's
  `confirm("Delete this note?")` which is also blocked in Next 16
  dev anyway — see user memory notes).
- **Folder integrity preserved.** Archiving doesn't move the note; the
  folder relationship is untouched.
- **Single source of truth for the bucket.** `archivedAt IS NULL` vs
  `archivedAt IS NOT NULL` is a SQL-friendly partition; no ad-hoc
  string-folder reasoning.
- **Cheap on the wire.** The archive flag is a `boolean` on PUT and a
  `?archived=only|all` query param on GET — no schema sprawl.
- **TDD-safe.** All four new server behaviors (PUT toggle, bulk
  action, list filter, search predicate) are covered by 20 new tests
  added across Units 2 and 3.

### Negative Consequences

- **Two new "where do my notes live?" mental models** for users to
  internalize: (a) the folder tree and (b) the bucket toggle. We
  mitigated this by making "All notes" the default view that *hides*
  archived notes (matches Gmail's default Inbox view) and by giving
  Archived a distinct sidebar row, not a checkbox or modifier key.
- **Slight client memory bump.** The single-fetch list now always
  includes archived rows. Acceptable at current dataset sizes; if
  this becomes a perf issue we can switch to lazy-fetching the
  archived bucket on demand.
- **Right-click context menu integration deferred.** The current row
  context menu still routes to Move-to-Folder; per-row archive
  shortcut is parked. Multi-select-of-1 + bulk-bar archive button
  works as a workaround.

## Locked Contract

### Schema (Prisma)

```prisma
model WorkLog {
  // ...
  archivedAt DateTime?
  // ...
  @@index([userId, archivedAt])
}
```

Migration: `prisma/migrations/20260611120000_add_worklog_archived_at`.

### Wire Format

| Endpoint | Input | Server behavior |
|---|---|---|
| `PUT /api/work-logs/[id]` | `{ archived: true }` | `archivedAt = new Date()`. |
| `PUT /api/work-logs/[id]` | `{ archived: false }` | `archivedAt = null`. |
| `PUT /api/work-logs/[id]` | `archived` absent | `archivedAt` untouched. |
| `PUT /api/work-logs/[id]` | `archived` non-boolean | `400 Bad Request`. |
| `POST /api/work-logs/bulk` | `{ action: "archive", ids }` | `updateMany({ archivedAt: now })`. |
| `POST /api/work-logs/bulk` | `{ action: "unarchive", ids }` | `updateMany({ archivedAt: null })`. |
| `GET /api/work-logs?archived=only` | — | `archivedAt IS NOT NULL`. |
| `GET /api/work-logs?archived=all` | — | no archive predicate. |
| `GET /api/work-logs` (default) | — | `archivedAt IS NULL`. |
| `GET /api/work-logs/search` | `?archived=only\|all\|<absent>` | same predicate as list. |

### Client Architecture

- `useWorklogData` fetches `?archived=all` once.
- `useWorklogVisibleLogs` does the bucket partition client-side:
  - `kind: "archived"` → keep rows where `archivedAt != null`.
  - any other folder selection → keep rows where `archivedAt == null`.
- Optimistic update in `saveLog.onMutate` translates the boolean
  `archived` flag into a synthetic `archivedAt` (now or null) so the
  row visibly flips buckets immediately. Server response replaces it
  with the authoritative timestamp.
- The sidebar fetch (in `worklog-nav-sidebar.tsx`) also uses
  `?archived=all` so its inboxCount + archivedCount badges stay in
  sync with the in-page list.

### Action Surfaces (Unit 5)

1. **Reader header** — single Archive / ArchiveRestore icon button next
   to Delete. No confirm. `aria-pressed` reflects the current state.
2. **In-page bulk bar** (`WorklogNotesBulkBar`) — Archive / Unarchive
   button between Move and Delete. Organize mode only (Send/Export flow
   doesn't bucket-shift).
3. **Floating bulk bar** (`WorklogBulkActionBar` on `/worklog`) — same
   pattern; deselects current note if it was archived OFF the active
   view.
4. **Right-click row context menu** — DEFERRED. Currently routes to
   Move-to-Folder dialog only. Multi-select-of-1 + bulk bar is the
   workaround.

## Pros and Cons of the Options

### Option A — soft-delete-as-archive

- ✅ No new field; reuses existing infra.
- ❌ Conflates "I want this gone forever" with "I'm done with this for
  now." Two materially different intents collapsed into one column.
- ❌ Soft-delete already has its own UX (Trash, restore window) — would
  require either re-skinning or keeping two confusing concepts.

### Option B — new `archivedAt` field (chosen)

- ✅ Crystal-clear schema-level intent.
- ✅ SQL-friendly partition for filters and counts.
- ✅ Folder-orthogonal — archive is independent of folder placement.
- ❌ Adds a column + an index + a small set of branch points across
  the API surface.

### Option C — reserved "Archive" folder

- ✅ No schema change.
- ❌ Notes in folders would lose their folder when archived (would have
  to be either *moved* or *dual-placed*).
- ❌ Folder tree starts encoding workflow state — exactly the
  anti-pattern we wanted to avoid.

## References

- Ship breakdown: 6 E.T.C. units (`96d7b2a` → `30cebcf` → `eaa8458` →
  `e20e0f2` → `61934ec` → this commit).
- Test additions: Units 2 and 3 added 20 vitest tests across PUT, bulk,
  list, and search routes.
- Related: ADR-0007 (worklog three-pane redesign), ADR-0011
  (postgres tsvector worklog search), ADR-0018 (TDD as first-class
  skill).
- `.Manual/worklog-archive.md` for the user-facing manual entry.
