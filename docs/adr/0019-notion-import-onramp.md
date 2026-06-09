# ADR-0019 — Notion Page Import On-Ramp

**Status:** Proposed
**Date:** 2026-06-08
**Supersedes:** None

## Context

Sprint 6A wired a Notion OAuth integration end-to-end: a user can connect a
Notion workspace, the access token is encrypted at rest, and an
`IntegrationConnection` row is created with `provider: "notion"`. The
connection is "live" but the **Sync** button on the Notion row currently
renders a "Page import — coming in next release" placeholder.

The user describes their actual usage pattern as:

> "I was journaling in Notion because the worklog wasn't built out. We want
> the user to use the worklog more than other notes apps when it comes to
> work, but having a way to import their notes from third-party sites would
> give them something to build off of."

This is a **migration on-ramp**, not a continuous sync. Notion was the
temporary home for journaling; Worklog is the long-term destination. After
import, Worklog is the source of truth and Notion is no longer a dependency.

The Griller surfaced and the user answered three scope-locking questions:

1. **Page hierarchies** — flatten v1: top-level granted pages only, ignore
   children. Children can be imported individually if granted.
2. **Non-text blocks** — render callouts as blockquotes, toggles as
   collapsed details, dump tables as plain-text markdown table syntax, skip
   embeds with `[unsupported block]` placeholder.
3. **Re-import policy** — Skip. If a page is already imported, the user's
   local edits are preserved; the import is a no-op.

## Decision

Build **Sprint 6B v1: Notion Import On-Ramp** as a one-time migration tool,
not a continuous sync pipeline. Defer write-back, delta sync, and AI
extraction to later sprints (or skip entirely if unused).

### Architecture

| Layer | Choice | Rationale |
|---|---|---|
| Notion client | `@notionhq/client` SDK | Official, typed, handles pagination + retries. ~50 KB. Boring tool. |
| Block → ProseMirror conversion | Hand-rolled minimal subset | Worklog uses ~8 block types. Notion has ~30. Hand-rolling for the supported subset matches the existing `importMarkdown` / `importHtml` pattern in `src/lib/worklog/import/` and avoids dependency drift on `notion-to-md` style libraries. |
| Page selection UX | Flat checkbox list | Notion's `search` endpoint returns a flat list sorted by `last_edited_time`. Tree view is later. |
| Idempotency | `WorkLog.externalSource = "notion"` + `externalId = <pageId>` unique constraint | Schema already has `@@unique([userId, externalSource, externalId])`. Re-import = constraint hit = skip + return existing. Zero migration. |
| Audit trail | Reuse `WorkLogImport` table with `sourceType = "notion"` and `sourceFingerprint = pageId` | Schema comment already lists `"notion"` as a planned `sourceType`. |
| Folder placement | Auto-create `"Imported from Notion"` folder per user on first import | Siloes imported content from native notes; user can move/rename later. |
| Schema migration | **None** | All required columns already exist on `WorkLog` and `WorkLogImport`. |

### Data flow

```
Settings → Integrations → Notion row → "Browse pages" button
  ↓
GET /api/integrations/notion/pages
  → Server: decrypt token, call Notion search API,
    return { pages: [{ id, title, lastEditedTime, parent }, ...] }
  ↓
User selects N pages, clicks "Import N pages"
  ↓
POST /api/integrations/notion/import
  body: { pageIds: string[] }
  → Server: for each pageId:
    1. Check WorkLog (userId, "notion", pageId) — if exists, mark "skipped"
    2. Call Notion blocks.children.list (paginated) to fetch full block tree
    3. Pass blocks to notion-to-pm converter → ImportResult
    4. Find-or-create "Imported from Notion" folder
    5. Create WorkLog (folderId, externalSource: "notion", externalId: pageId, ...)
    6. Create WorkLogImport audit row (sourceType: "notion", sourceFingerprint: pageId, status: "succeeded")
  → Returns { results: [{ pageId, status: "imported" | "skipped" | "failed", workLogId? }, ...] }
  ↓
Toast summarizes (e.g. "Imported 5, skipped 2 already-imported, 1 failed")
  ↓
User navigates Worklog → Notes → "Imported from Notion" folder
```

### Notion → ProseMirror block mapping (v1)

| Notion block | ProseMirror equivalent | Notes |
|---|---|---|
| `paragraph` | `paragraph` | Most common path; rich-text → marks |
| `heading_1` / `heading_2` / `heading_3` | `heading` (level 1/2/3) | |
| `bulleted_list_item` | `bulletList` > `listItem` | Aggregate consecutive items |
| `numbered_list_item` | `orderedList` > `listItem` | Aggregate consecutive items |
| `to_do` | `taskList` > `taskItem` (checked attr) | Worklog editor has TaskList/TaskItem |
| `code` | `codeBlock` (language attr) | |
| `quote` | `blockquote` | |
| `callout` | `blockquote` (with optional emoji prefix in text) | v1 lossy: drops the colored background |
| `toggle` | `details` element via custom node OR collapsed-by-default heading | Tracking decision in code; v1 falls back to a header + indented body |
| `divider` | `horizontalRule` | |
| `image` | Skipped + dropped block `[image]` | v1: do NOT download/store; counted in `droppedBlocks` |
| `table` | Plain-text markdown table syntax in a paragraph | Worklog has no native table extension yet |
| `embed` / `bookmark` / `video` | `[unsupported: <type>]` text placeholder | Counted in `droppedBlocks` |
| Rich-text marks: bold, italic, strikethrough, code, link, underline | Same | |
| Rich-text marks: color, background_color | Dropped silently | v1 strips colors for parity with Worklog editor |

### Fingerprint + dedup

```typescript
// In /api/integrations/notion/import handler:
const existing = await prisma.workLog.findFirst({
  where: { userId, externalSource: "notion", externalId: pageId },
  select: { id: true },
});
if (existing) {
  results.push({ pageId, status: "skipped", workLogId: existing.id });
  continue;
}
// ... fetch blocks, convert, create WorkLog + WorkLogImport in transaction ...
```

The `WorkLogImport` row uses `sourceFingerprint = pageId` directly. This
diverges from the Markdown/HTML importers (which sha256 the source bytes)
because Notion pages don't have stable serialized "source bytes" — only the
`pageId` is stable across edits. For the "Skip" semantics, this is correct:
re-import of the same `pageId` always dedupes regardless of content changes.

### Out of scope (deferred)

- **Sprint 6B v2** — re-import / refresh policy. Would require fingerprinting
  the block tree and a UI for "page X has changed in Notion since import,
  replace? merge? skip?". Not built until user explicitly requests it.
- **Sprint 6C** — write-back / two-way sync. Conflict resolution. Not built.
- **Image download** — would require storing Notion-hosted image URLs (which
  expire after ~1 hour) or downloading + reuploading to our blob storage.
  Both are nontrivial. v1 drops images.
- **Database imports** — Notion databases (structured tables of pages) need
  property-mapping config. Defer until user has a database they want to
  import. Pages and database-rows-as-pages are technically the same Notion
  endpoint, so this can be additive later.
- **AI extraction** — feeding imported notes through the existing Worklog
  promotion AI pipeline is a natural follow-up but not in v1.

## Consequences

### Pros

1. **Zero schema migration.** All needed columns exist on `WorkLog` and
   `WorkLogImport`. Dev velocity unblocked.
2. **Reuses the proven import contract.** The `ImportResult` shape, the
   transactional insert pattern, and the `WorkLogImport` audit table are all
   already battle-tested by the Markdown/HTML importers. New code is
   confined to: (a) Notion API client, (b) `notion-to-pm.ts` converter, (c)
   two new route handlers under `/api/integrations/notion/`.
3. **Pure converter is unit-testable.** `notion-to-pm.ts` takes a fixture
   block array and returns `ImportResult` — no I/O, no DB. Same TDD pattern
   as existing importers (RED → GREEN → REFACTOR).
4. **Import is a one-time tool, not a service.** No background jobs, no
   webhooks, no rate-limit budgeting. The flow runs only when the user
   clicks Import.
5. **The user retains full control.** "Imported from Notion" folder is
   isolated, deletable, and movable. Users can take ownership of imported
   notes by moving / editing / deleting at will.
6. **Skip semantics protect user edits.** The user's local edits to an
   imported note are NEVER overwritten by an accidental second click.

### Cons / Trade-offs

1. **No re-import means stale content stays stale.** If a user imports a
   Notion page, then edits the page heavily in Notion, then comes back to
   Worklog months later — the Worklog version is whatever was imported on
   day one. Mitigation: deferred to v2 with explicit user-driven
   "refresh from Notion" action.
2. **Lossy conversion is permanent.** Dropped blocks (images, embeds,
   colors, tables-as-text) are gone. The `WorkLogImport.droppedBlocks` JSON
   captures what was lost so a future "re-import in higher fidelity" tool
   could replay; v1 just shows the count to the user.
3. **`@notionhq/client` is a runtime dependency.** Adds ~50 KB to
   server-only bundles (it's never imported into the client). Acceptable
   given the alternative (hand-rolling pagination + retry + typed responses
   against Notion's REST API) is significantly more work.
4. **One-time import is a weaker integration story than continuous sync.**
   If the product later grows toward Notion-as-source-of-truth (unlikely
   per the user's stated direction), this work doesn't accelerate that
   path. Acceptable given the explicit migration framing.
5. **Page selection UI must handle the case where Notion grant is empty.**
   If a user installs the integration but doesn't grant any pages, the
   "Browse pages" dialog must show a clear "No pages granted — open Notion
   to add Resumsify to specific pages" empty state with a deep-link.

## Implementation plan (post-acceptance)

1. **Install** `@notionhq/client` dependency.
2. **`src/lib/worklog/import/notion-to-pm.ts`** — pure converter with
   matching `ImportResult` shape. Plus `notion-to-pm.test.ts` covering each
   block type in the mapping table.
3. **`src/lib/integrations/notion-client.ts`** — thin wrapper that decrypts
   the token from `IntegrationConnection.config.tokenRef` and returns a
   ready-to-use `Client` instance.
4. **`GET /api/integrations/notion/pages`** — list granted pages.
5. **`POST /api/integrations/notion/import`** — import N pages.
6. **UI: `<NotionImportDialog />`** — dialog launched from the Notion row
   in `IntegrationsSection`. Replaces the current "Page import — coming in
   next release" placeholder.
7. **Workflow recipe** — write `docs/workflows/import-from-third-party.md`
   capturing the pattern so future imports (OneDrive, Google Drive, etc.)
   can follow it.

Implementation will follow the standard pipeline: Phase 0 → 4. Each phase
is a separate confirmation gate.
