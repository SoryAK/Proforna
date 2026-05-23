# 11. Worklog user-defined folder tree

Date: 2026-05-23

## Status

Proposed

## Context

WorkLog notes already carry a fixed `category` enum (`task`, `accomplishment`,
`issue`, `idea`, `learning`, …). Users asked for **personal organisation** that
is orthogonal to category — "I want a `2026 Q2 / Customer Escalations / Acme`
folder I can drop a learning note and an accomplishment into without losing
their category."

The request was explicit: a **directory tree**, not just another flat label
axis. Bear-/Notion-style nested folders with rename, move, and cascade-delete
were called out.

Options considered:

| Storage model | Pros | Cons |
|---|---|---|
| **Adjacency list** (`parentId` self-ref) — *chosen* | Trivial schema; rename and move are O(1); cycle-prevention via authoritative ancestor walk at write-time | Descendant queries are O(depth × fan-out); deep moves require a walk |
| Materialised path (`"/root/sub/leaf"`) | Subtree queries are a single `LIKE` | Every rename rewrites N rows; storing path duplicates ancestor names |
| Closure table | O(1) ancestor and descendant queries | Doubles the row count on every insert; over-engineered for ≤ a few hundred folders per user |

Personal folder trees are shallow (clamped to **8 levels**) and small
(realistically ≤ 200 folders per user), so adjacency-list math is cheap
client-side. We pay the cost where it lives: a one-shot `collectDescendantIds`
walk when filtering the notes list.

Other decisions baked into the design:

- **Folder is orthogonal to category.** A note's `category` keeps its semantic
  meaning ("this is a learning"); `folderId` is a user-defined home. Both can
  filter the list independently.
- **"Unfiled" is a smart folder, not a row.** `folderId = null` is the
  canonical unfiled state; we render a virtual `Unfiled` node above the user
  tree.
- **Delete is two-mode and explicit.**
  - `mode=orphan` (default) — folder removed, notes' `folderId` becomes null,
    descendant folders are re-rooted to the deleted folder's parent.
  - `mode=delete` (hard cascade) — descendant folders **and** their notes are
    removed. Requires the client to echo the folder name in an
    `x-folder-name-confirm` header so accidental dropdown clicks cannot
    nuke a subtree.
- **Cycle prevention is server-authoritative.** Even though the client tree
  hides illegal targets in the Move dialog, the PATCH route re-walks ancestors
  before applying a `parentId` change.

## Decision

Implement a single `WorkLogFolder` table, scoped by `userId`, with a nullable
self-referencing `parentId`. `WorkLog` gains a nullable `folderId` (FK
`ON DELETE SET NULL`). Tree manipulation and rendering happen client-side over
the flat list returned by `GET /api/work-logs/folders`.

## Consequences

Pros

- One small table, two foreign keys — fits the existing Prisma + Postgres
  shape with no extras.
- All tree mutations are single-row writes; rename and move stay O(1).
- The notes list query can keep using `folderId IN (…descendants)` because
  the descendant set is tiny and computed client-side.
- Smart "Unfiled" + virtual roots keep the UI honest without polluting the
  schema with magic rows.

Cons / Trade-offs

- Deep trees would degrade: each move re-walks ancestors, and the descendant
  set has to be enumerated client-side for filtering. Mitigated by the
  hard cap (`FOLDER_MAX_DEPTH = 8`) and the modest scale of personal trees.
- No native subtree queries — if we ever need cross-user search "all notes
  under any 'Customer Escalations' folder" we will revisit closure tables.
- Delete UX has two paths; the hard-delete name-confirm step is friction by
  design, but it does require the client to render an exact-name typed
  confirmation field (handled by `WorklogFolderDeleteDialog`).
