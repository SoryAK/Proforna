# Note-to-Note Linking + Backlinks Panel

- **Status:** Accepted (2026-06-09)
- **Date:** 2026-06-07
- **Deciders:** Sory
- **Tags:** worklog, editor, schema, search
- **Related:** [ADR-0010](./0010-tiptap-yjs-worklog-editor.md), [ADR-0011](./0011-postgres-tsvector-worklog-search.md), [ADR-0012](./0012-asset-library-knowledge-backbone.md), [ADR-0015](./0015-worklog-notes-document-manager.md), [ADR-0018](./0018-tdd-as-first-class-skill.md)

## Context and Problem Statement

Worklog notes already support typed `@mention` references to four entity kinds: Asset, Skill, Company, Contact. The Tiptap editor stores them as inline atom nodes in `WorkLog.contentJson`; on save, `extractMentionAssetIds` walks the doc and denormalizes `WorkLog.assetIds[]` into a Postgres `String[]` column with a GIN index. Querying "all notes that mention asset X" is a single indexed `WHERE 'X' = ANY(assetIds)`.

What is **missing** is the most basic Obsidian-style operation: linking one note to another note, and seeing inbound links (backlinks) on the target. The user explicitly asked: "are notes able to connect like Obsidian?" The answer today is "to data — yes; to other notes — no." This ADR proposes closing that gap.

This is a feature spec, not yet a build commitment. Status remains **Proposed** until prioritized against other sprint work. Ship the four entity types' linking story first; this ADR is the staged proposal for the fifth.

## Decision Drivers

- **Pattern consistency** — the four existing entity types already established the linking shape (Tiptap atom node + denormalized `String[]` column + GIN index + mention-search API). The fifth entity should not invent a different shape.
- **Single source of truth** — links live inside `contentJson` (the editor doc); denormalized columns are a *projection* maintained on save, not the canonical store. This avoids two-writer drift.
- **Backlinks must be cheap to render** — the drawer ([ADR-0015](./0015-worklog-notes-document-manager.md)) and full-screen reader both want a "Linked from N notes" panel. A query that costs more than the note body itself is a non-starter.
- **Orphan tolerance** — Obsidian-style: deleting a target note does not rewrite history. Inbound mentions render as broken chips, identical to how `MentionNodeView` already handles vanished assets.
- **Don't fork the search story** — full-text search ([ADR-0011](./0011-postgres-tsvector-worklog-search.md)) already indexes title + content + tags. Linked-note labels live in the chip's `label` attr, which is captured at insertion time and survives in the plain-text projection. No new tsvector work needed.

## The Griller — questions answered upfront

1. **What happens when a linked note is deleted?**
   Same behavior as deleted assets today: chip renders with broken styling (`MentionNodeView` already implements this), backlinks query naturally drops the row. No history rewriting, no cascade, no "fix broken links" wizard. Obsidian-aligned.
2. **Is the backlinks panel realtime?**
   No. Backlinks are a query against the denormalized `linkedNoteIds[]` column, populated on save. Time-to-show is one save cycle (~1s). Worth the simplicity tax over a live ProseMirror cross-doc index.
3. **Does this open the door to bidirectional editing (edit one note from another)?**
   No. Mention chips are read-only references. Clicking a chip opens the target — same UX as the existing four entity types. The drawer ([ADR-0015](./0015-worklog-notes-document-manager.md)) is the right preview surface; clicking a backlink chip in the drawer would re-target the drawer.

## Considered Options

### Option A — Extend `MentionEntityType` to include `"worklog"`

Add a fifth entity to the existing mention machinery: prefix `@n:` (note), search via `/api/work-logs/mention-search?type=worklog`. Add `WorkLog.linkedNoteIds: String[]` mirroring the `assetIds` pattern; extend `extractMentionAssetIds` to a generic `extractMentionEntityIds(doc, entityType)`. Add a GIN index. Backlinks panel is one Prisma query: `findMany({ where: { linkedNoteIds: { has: log.id } } })`.

### Option B — Dedicated `WorkLogLink` join table

New model `WorkLogLink { fromId, toId, position, context }`. Editor save writes rows; backlinks query is `findMany({ where: { toId: log.id } })`. Richer schema (could store *where in the source doc* the link appears, surrounding context for the backlink card preview).

### Option C — Compute backlinks at query time

No denormalization. Backlinks query scans `contentJson` JSONB for `mention` nodes with `entityType === "worklog"` and `entityId === target.id`. Postgres `jsonb_path_query` or a function-based GIN index on the JSONB.

## Decision Outcome

**Accepted (2026-06-09): Option A — minimal scope.**

Phase-0 audit revealed the implementation sketch's "four `*Ids` columns" framing was inaccurate: only `assetIds` is denormalized today. Skills, companies, and contacts have no per-WorkLog `*Ids` projection. Two sub-options surfaced:

- **A.1 — Minimal:** add only `WorkLog.linkedNoteIds` + GIN index. Generalize the extractor signature so a future entity column is a one-line addition.
- **A.2 — Symmetric:** add `linkedNoteIds` + retroactively add `skillIds`, `companyIds`, `contactIds` + backfill all existing notes via the new extractor.

**Picked A.1.** Rationale: A.2 would build three indexed columns + a one-time backfill in service of features no one has scoped (e.g. "find notes mentioning skill X"). Each future feature can add its column and backfill at the time it's actually built. The pattern we *do* have today is "one column, GIN-indexed, populated on save" — extending it by one slot, not generalizing across four.

Other terms locked at acceptance:

- **Backlink-click navigation:** stays on ADR-0015's `router.replace(?focus=<id>)` contract — single drawer slot, browser back-button escapes the preview model. Self/circular pointers are filtered out of the panel itself for UX (a note never lists itself in its own backlinks).
- **Self-loop write-time guard:** the extractor / PUT route filters `entityId === currentLogId` from `linkedNoteIds` even if a paste introduces one — defense-in-depth beyond picker `?excludeId=`.
- **Skip-if-equal write guard:** the PUT route compares the new and existing `assetIds` / `linkedNoteIds` arrays as sets and omits the column from the Prisma `data` payload when they're equal. Avoids unnecessary GIN index churn on autosave (~3s debounce).

Why this still earns the "Accepted" label:

- Reuses every piece of infrastructure already built for assets/skills/companies/contacts. The PR is small (~1 type union extension, ~1 helper generalization, ~1 schema column, ~1 GIN index, ~1 backlinks component).
- Keeps the mental model simple: existing entity kinds + worklog notes, all linked the same way, all queried the same way.
- Backlinks panel is a 4-line Prisma query, indexed.
- Migration is additive (no data backfill; `linkedNoteIds` defaults to `[]`).

### Positive Consequences

- Note-to-note links inherit free: hover preview, broken-chip styling, label persistence, mention-search debouncing, type-picker UX.
- Backlinks panel is cheap (GIN-indexed `ANY()` query) and trivially memoized.
- The editor's plain-text projection (used for FTS) already includes mention labels — search "the note that mentions [X]" works without new code.
- Sets a reusable template for future entity kinds (e.g. `@t:` for Templates, `@e:` for CareerEvents).

### Negative Consequences

- `String[]` columns stay simple-array (no per-link metadata like position/context). If we later want "show me the *paragraph* where this note links to that one," we'd need Option B's join-table refactor.
- Self-referential mention search adds a small recursion concern in the popup ("don't suggest the current note") — solvable with a `?excludeId=` param but worth flagging.
- One more denormalized array to keep in sync; if `extractMentionEntityIds` ever drops a kind, links silently rot. Mitigation: snapshot test the extractor against a multi-mention fixture.

## Pros and Cons of the Options

### Option A — Extend `MentionEntityType` (analysis)

- ✅ Reuses 100% of the existing mention pipeline (UI, API, NodeView, popup, orphan styling).
- ✅ One denormalized column, one GIN index, one Prisma query for backlinks.
- ✅ Migration is additive; no backfill.
- ✅ Schema stays "wide and flat" — easy to grep, easy to reason about.
- ❌ No room for per-link metadata (where in the doc, surrounding context).
- ❌ Self-link suggestions need a guard.

### Option B — Dedicated `WorkLogLink` join table (analysis)

- ✅ Per-link metadata (position, context) enables richer backlink cards ("…mentioned in paragraph 3 of 'Foo'").
- ✅ Cleaner separation between "doc content" and "link graph."
- ❌ Forks the linking machinery — assets/skills/companies/contacts use one shape, notes use another. Two patterns to maintain.
- ❌ Save-time write path becomes more complex: derive links from doc → diff against existing rows → upsert/delete.
- ❌ Migration is non-trivial (new model, FK constraints, cascade rules).

### Option C — JSONB scan (analysis)

- ✅ Zero denormalization, single source of truth (the doc JSON).
- ❌ Performance is unverified at scale; JSONB path queries on every backlink panel render.
- ❌ Diverges from the existing `assetIds`-style pattern — special-cases note links.
- ❌ Harder to combine with `tsvector` search ranking.

## Implementation Sketch (as built)

1. **Schema:** add `WorkLog.linkedNoteIds String[] @default([])` + `@@index([linkedNoteIds], type: Gin)`. New additive migration.
2. **Tiptap:** extend `MentionEntityType` union with `"worklog"`; add `n` to `PREFIX_MAP`; add `worklog` row to `ENTITY_TYPE_CONFIG` (badge `N`, indigo).
3. **API:** extend `/api/work-logs/mention-search` to handle `type=worklog` (queries `WorkLog.findMany` with `userId` scope, fuzzy on first non-empty plain-text line of `contentJson`; honors `?excludeId=` to filter out the current note from suggestions). `excludeId` is honored for *all* types — cheap, safer.
4. **Extractor:** generalize `extractMentionAssetIds` → `extractMentionEntityIds(doc, entityType)`. Existing `extractMentionAssetIds` becomes a thin wrapper for callsite compatibility. Tests snapshot a multi-mention fixture (asset + skill + company + contact + worklog, mixed top-level/nested) so a future kind drop is caught.
5. **PUT route hardening:** skip-if-equal guard via `arraysEqualAsSets` for both `assetIds` and `linkedNoteIds` — omit the column from `update.data` when extracted set matches existing column. Self-loop guard at write time filters `id === currentLogId` from `linkedNoteIds`.
6. **NodeView:** existing `MentionNodeView` already routes by `entityType` — add the worklog case (click → `router.replace(?focus=<id>)` per ADR-0015).
7. **Backlinks panel:** new component `<WorklogBacklinksPanel logId>`; one TanStack Query → `/api/work-logs/[id]/backlinks` → Prisma `findMany({ where: { linkedNoteIds: { has: id }, userId, NOT: { id } } })` (filters self even if the write guard ever fails). Slot into both the drawer ([ADR-0015](./0015-worklog-notes-document-manager.md)) and full-screen reader.
8. **Tests (Phase 2.5 / ADR-0018):** RED → GREEN for the generalized extractor, the `arraysEqualAsSets` helper, the mention-search worklog branch, the backlinks route, and the PUT-route skip-if-equal + self-loop guards.

**Out of scope for this ADR (separate proposals if pursued):**

- Visual graph view (D3/Cytoscape canvas) — earns its own ADR.
- `[[wikilink]]` text-shorthand syntax — current `@n:` UX is consistent with the four existing entity types; adding wiki-link grammar fragments the input model.
- Cross-user note linking — privacy boundary, separate threat model.

## Links / References

- [ADR-0010 — Tiptap + Y.js worklog editor](./0010-tiptap-yjs-worklog-editor.md) — establishes `contentJson` as source of truth.
- [ADR-0011 — Postgres tsvector search](./0011-postgres-tsvector-worklog-search.md) — the search pipeline backlinks live alongside.
- [ADR-0012 — Asset library knowledge backbone](./0012-asset-library-knowledge-backbone.md) — established the typed-mention pattern reused here.
- [ADR-0015 — Worklog notes document manager + drawer reader](./0015-worklog-notes-document-manager.md) — drawer is the natural backlink-click destination.
- [src/lib/worklog/tiptap/mention-node.ts](../../src/lib/worklog/tiptap/mention-node.ts) — where Option A's union extension lands.
- [src/lib/worklog/prosemirror-to-text.ts](../../src/lib/worklog/prosemirror-to-text.ts) — `extractMentionAssetIds` to generalize.
