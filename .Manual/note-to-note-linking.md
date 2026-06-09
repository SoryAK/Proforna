# Note-to-Note Linking and Backlinks

**Status:** Shipped
**Owner:** Sory
**Related ADR(s):** [0016](../docs/adr/0016-note-to-note-linking-and-backlinks.md), [0015](../docs/adr/0015-worklog-notes-document-manager.md)
**Source files:**
- `src/lib/worklog/tiptap/mention-node.ts`
- `src/lib/worklog/prosemirror-to-text.ts`
- `src/lib/array-set-equal.ts`
- `src/app/api/work-logs/[id]/route.ts`
- `src/app/api/work-logs/[id]/backlinks/route.ts`
- `src/app/api/work-logs/mention-search/route.ts`
- `src/components/worklog/mention-node-view.tsx`
- `src/components/worklog/mention-suggestion-popup.tsx`
- `src/components/worklog/worklog-note-view.tsx`
- `src/components/worklog/worklog-backlinks-panel.tsx`
- `prisma/migrations/20260609173810_add_worklog_linked_note_ids/migration.sql`

---

## 1. Functional Description

Inside any worklog note, the user can type `@n:` to start linking another worklog note. A picker pops up with up to eight matching notes, ranked by recency. Confirming inserts an inline indigo `N` chip showing the linked note's title. The chip is **clickable in both edit and read modes** — clicking pivots the page to the linked note via the existing focus contract (`?focus=<id>`), without polluting the browser back-stack.

When a note is open in either the reader drawer or the standalone read view, a compact **Backlinks** panel appears under the body, listing every other note in the user's account that links to this one. The list is empty when no notes link in, and updates whenever the user saves a note that adds or removes an `@n:` reference.

**Example user story:** *"While writing today's note, I want to reference yesterday's note about the same conveyor incident. I type `@n: conveyor`, pick the note from the popup, keep typing. Tomorrow when I open yesterday's note, today's note shows up in its Backlinks list — and clicking it jumps me there."*

## 2. Internal Workflow

### Inserting a link

1. User types `@n:` in the editor (Tiptap with the `MentionNode` extension).
2. The `@tiptap/suggestion` plugin opens `MentionSuggestionPopup` (`src/components/worklog/mention-suggestion-popup.tsx`), which fetches `GET /api/work-logs/mention-search?type=worklog&q=<query>&excludeId=<currentLogId>`.
3. The route handler in `src/app/api/work-logs/mention-search/route.ts` runs `prisma.workLog.findMany` scoped to the signed-in `userId`, excluding `currentLogId`, and returns `[ { id, label, meta } ]`. The search clause is `OR: [{ title: contains q }, { content: contains q }]` (case-insensitive). The label is derived by the shared helper `src/lib/worklog/derive-worklog-label.ts` with the fallback chain `WorkLog.title (trimmed) → first non-empty plain-text line of contentJson → workday ISO date`, all truncated to 80 chars. `meta` is the workday date (`YYYY-MM-DD`).
4. User confirms a result. Tiptap inserts a `mention` inline atom node with attrs `{ entityType: "worklog", entityId, label }`.

### Saving the note

5. The note's autosave PUT (`src/app/api/work-logs/[id]/route.ts`) walks the `contentJson` via `extractMentionEntityIds(doc, "worklog")` (`src/lib/worklog/prosemirror-to-text.ts`).
6. The current note's own id is filtered from the result list (write-time self-loop guard).
7. The result is compared to the existing `WorkLog.linkedNoteIds` via `arraysEqualAsSets` (`src/lib/array-set-equal.ts`). When the two sets match, the column is **not** rewritten — saving the GIN index a write on every keystroke autosave that didn't touch mentions.
8. When they differ, `WorkLog.linkedNoteIds` is replaced wholesale (replacement semantic — removing a chip from the doc removes the link). Postgres updates the `WorkLog_linkedNoteIds_idx` GIN index.

### Rendering backlinks

9. The reader drawer (`worklog-note-reader.tsx`) and standalone read view (`worklog-note-read-view.tsx`) mount `WorklogBacklinksPanel` for the current note id.
10. The panel calls `GET /api/work-logs/{id}/backlinks` (`src/app/api/work-logs/[id]/backlinks/route.ts`).
11. The handler runs `prisma.workLog.findMany({ where: { userId, linkedNoteIds: { has: id }, NOT: { id } } })` — owner-scoped, with the target note filtered out.
12. The panel renders a clickable list. Clicking a row calls `router.replace(${pathname}?focus=${row.id})`, which pivots the page to the linked note (ADR-0015 contract).

## 3. Configuration / Params

| Name | Location | Default | Purpose |
|------|----------|---------|---------|
| `MAX_RESULTS` | `src/app/api/work-logs/mention-search/route.ts` | `8` | Max picker results per query |
| Backlinks `staleTime` | `src/components/worklog/worklog-backlinks-panel.tsx` | `30000` ms | TanStack Query freshness window for backlinks |
| Mention exists `staleTime` | `src/components/worklog/mention-node-view.tsx` | `300000` ms | Orphan-detection cache window |
| `linkedNoteIds` index | `prisma/schema.prisma` (WorkLog) | GIN | Indexed for `{ has: id }` lookups |

## 4. Known Constraints

- Does not warn before deleting an inbound link by chip-removal — the replacement semantic is intentional but silent. Backlinks recompute on the next paint of the source note's reader.
- Does not provide a graph view of links — the Backlinks panel is a flat list. A graph view is parked.
- Picker search runs against `title OR content` only — does not index `contentJson` rich-text marks/headings/etc. directly. Sufficient because the legacy plain-text `content` column already mirrors the rich-text body for full-text purposes.
- Chip labels are captured at insertion time. If the linked note's title is later renamed, existing chips will display the stale label until they are reinserted (or a backfill task runs `rewriteWorklogMentionLabels` against the user's notes — see `scripts/migrations/2026-06-09-fix-worklog-mention-labels.ts` for the canonical pattern).
- Does not link other entity types to each other — the panel only lists worklog→worklog backlinks. Asset/skill/company/contact mentions remain one-way projections into their respective `*Ids` columns (and only `assetIds` exists today; see ADR-0016 §Q1).
- Does not promote `linkedNoteIds` to a relation table (Option B in ADR-0016) — kept as `String[]` for symmetry with `assetIds` until two of three trigger conditions fire.

## 5. Future / Deferred

- **Graph view** — visual linkage map across notes. Useful for retrospectives. Deferred until backlink density exceeds ~10 average per note.
- **Cross-entity backlinks** (e.g. "show all notes that mention this asset") — already trivially queryable via `WorkLog.assetIds: { has: id }`, but no UI surface exists yet. Coordinate with the asset library work in ADR-0012.
