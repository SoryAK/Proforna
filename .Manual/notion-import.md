# Feature: Notion Page Import On-Ramp

**Status:** Shipped
**Owner:** Sory
**Related ADR(s):** [0019](../docs/adr/0019-notion-import-onramp.md), [0017](../docs/adr/0017-...) (worklog notes), [Sprint 6A — Notion OAuth](../docs/handoffs/2026-06-08_session_handoff.md)
**Source files:**
`src/lib/worklog/import/notion-to-pm.ts`,
`src/lib/integrations/notion-client.ts`,
`src/app/api/integrations/notion/pages/route.ts`,
`src/app/api/integrations/notion/import/route.ts`,
`src/components/integrations/notion-import-dialog.tsx`,
`src/components/integrations-section.tsx`

---

## 1. Functional Description

Resumsify lets the user pull pages from a connected Notion workspace into the
worklog as native notes. After connecting Notion in **Settings → Integrations**
(see Sprint 6A — Notion OAuth), the user clicks **Browse pages**, picks any
combination of pages from a checkbox list, and Resumsify creates one worklog
note per page inside an automatically-managed folder named
**"Imported from Notion"**.

The imported note is no longer linked to the Notion page — it's a regular
worklog note, fully editable, searchable, and promotable to a profile section
like any other note. **This is a one-time migration on-ramp, not a sync.**
Re-clicking import on a page already brought in is a no-op: the picker dims
already-imported pages and the API skips them, protecting local edits.

**Example user story:** *"As a job-seeker who took years of brag-doc notes
in Notion, I can move my full history into Resumsify in five clicks without
losing the body content of any page I select."*

## 2. Internal Workflow

### Listing pages

1. User opens **Settings → Integrations** and clicks **Browse pages** on the connected Notion row.
2. `NotionImportDialog` mounts and TanStack Query fires `GET /api/integrations/notion/pages`.
3. Route handler authenticates via `getUserId()`, finds the user's `IntegrationConnection (provider: "notion", enabled: true)`.
4. `buildNotionClient(config)` decrypts `config.tokenRef.accessToken` via the AES-256-GCM helper and instantiates an `@notionhq/client` SDK client.
5. `listAccessiblePages(client)` calls Notion's `search` endpoint, paginated, sorted by `last_edited_time` desc, hard-capped at `PAGE_LIST_LIMIT = 100` results.
6. The route also runs `prisma.workLog.findMany({ where: { userId, externalSource: "notion" } })` to compute `importedPageIds`.
7. Response shape: `{ pages: NotionPageSummary[], importedPageIds: string[] }`.
8. Dialog renders a flat checkbox list. Already-imported pages are dimmed (opacity 60), display an "Imported" badge, and have their checkbox disabled. A title filter input narrows the list; "Select all visible" toggles only the visible-and-not-imported subset.

### Importing pages

1. User clicks **Import N pages**.
2. TanStack Query mutation posts `POST /api/integrations/notion/import` with `{ pageIds: string[] }`. The route caps the request at 25 page IDs.
3. The route ensures the **"Imported from Notion"** root folder exists for the user (find-or-create).
4. For each page ID **sequentially** (Notion rate-limits aggressively):
   - **Idempotency check:** `prisma.workLog.findUnique({ where: { userId_externalSource_externalId: { userId, "notion", pageId } } })`. If a row exists, push `{ status: "skipped", workLogId, externalId }` and continue.
   - Otherwise: `fetchPageContent(client, pageId)` → returns `{ title, blocks }`. Title is read from the page's title-typed property; blocks are paginated up to `MAX_BLOCKS_PER_PAGE = 1000`.
   - `importNotion({ title, blocks })` runs the pure converter (see §3) → `ImportResult { contentJson, plainText, droppedBlocks }`.
   - `validateContentJson(contentJson)` shapes the result into a Prisma-safe `InputJsonValue`.
   - One transaction creates the `WorkLog` row (with `externalSource: "notion"`, `externalId: pageId`, `folderId: <importFolderId>`) AND the audit `WorkLogImport` row.
   - **P2002 race-safe:** if a concurrent request already inserted the same `(userId, "notion", pageId)` triple, Prisma throws `P2002`. The route catches it, re-reads the winning row, and returns `{ status: "skipped" }` with that row's id.
   - Errors thrown by Notion (token revoked, page deleted, network) are routed through `redact()` which strips any `secret_*` or `ntn_*` token fragments and slices the message to 200 chars before emitting `{ status: "failed", error }`.
5. Response shape: `{ results: PerPageResult[], folderId: string }`.
6. Dialog parses results into a toast: `"Imported X · skipped Y · Z failed"`.
7. On success the dialog invalidates `["work-logs"]`, `["integrations"]`, and `["notion-pages"]` query keys so the worklog rail, integrations panel, and picker all refresh.

### Block conversion (the pure converter)

1. `notion-to-pm.ts` exposes `importNotion({ title, blocks })`. It is **pure** — no SDK calls, no I/O — so it tests without network or Prisma.
2. `convertBlocks(blocks)` walks the array with a `runType` state machine that aggregates **consecutive** `bulleted_list_item` / `numbered_list_item` / `to_do` blocks into one `bulletList` / `orderedList` / `taskList` ProseMirror node. A different block type closes the run.
3. Each block dispatches by `type` to a handler that emits a ProseMirror node:
4. Inline marks: `bold`, `italic`, `strikethrough → strike`, `underline`, `code`, and link annotations (`href`).
5. Unsupported blocks (image, embed, video, table, …) call `handleUnsupported(block)`: emits a `paragraph` containing literal text `[unsupported <type> block]` AND increments the count in a `dropped: Map<string, number>`.
6. Empty docs emit a single empty `paragraph` (Tiptap requires at least one node).
7. Title is trimmed; blank titles fall back to the literal string `"Untitled"`.
8. Output: `{ contentJson: ProseMirrorDoc, plainText: string, droppedBlocks: Record<string, number> }`. `plainText` is a flat newline-joined projection used for full-text search.

Block dispatch table:

| Notion block         | ProseMirror node                                              |
| -------------------- | ------------------------------------------------------------- |
| `paragraph`          | `paragraph`                                                   |
| `heading_1`/`2`/`3`  | `heading` (level 1/2/3)                                       |
| `bulleted_list_item` | `listItem` (inside `bulletList`)                              |
| `numbered_list_item` | `listItem` (inside `orderedList`)                             |
| `to_do`              | `taskItem { checked }` (inside `taskList`)                    |
| `code`               | `codeBlock { language }`                                      |
| `quote`              | `blockquote`                                                  |
| `callout`            | `paragraph` (icon emoji prefix becomes a leading text node)   |
| `divider`            | `horizontalRule`                                              |
| `toggle`             | `paragraph` (lossy — children dropped)                        |

## 3. Configuration / Params

| Name | Location | Default | Purpose |
| ---- | -------- | ------- | ------- |
| `PAGE_LIST_LIMIT` | `src/lib/integrations/notion-client.ts` | `100` | Max pages returned by GET pages route |
| `BLOCK_PAGE_SIZE` | `src/lib/integrations/notion-client.ts` | `100` | Notion children API page size |
| `MAX_BLOCKS_PER_PAGE` | `src/lib/integrations/notion-client.ts` | `1000` | Hard cap on blocks fetched per page (truncation guard) |
| `MAX_IMPORT_BATCH` | `src/app/api/integrations/notion/import/route.ts` | `25` | Max pageIds per POST (rate-limit + transaction-size guard) |
| `IMPORT_FOLDER_NAME` | `src/app/api/integrations/notion/import/route.ts` | `"Imported from Notion"` | Auto-created root folder per user |
| `INTEGRATION_TOKEN_KEY` | `.env` | *(required)* | Master key for AES-256-GCM token decrypt |
| `staleTime` | `notion-import-dialog.tsx` | `60_000` ms | Picker cache freshness window |
| `WorkLog.externalSource` | `prisma/schema.prisma` | `"notion"` for imports | Idempotency dimension (other values reserved for future providers) |
| `WorkLog.externalId` | `prisma/schema.prisma` | `<notion page UUID>` | Unique pageId from Notion |

## 4. Known Constraints

- **One-time on-ramp, not a sync.** Re-importing a page already in the worklog is a no-op (`status: "skipped"`). There is no "refresh from Notion" — local edits are sacred. v2 (`re-import refresh`) is parked.
- **Lossy conversion by design.** Images, embeds, video, files, tables, equation blocks, and synced blocks are dropped and counted in `WorkLogImport.droppedBlocks`. The note body shows `[unsupported <type> block]` markers in their place.
- **Toggle children are dropped.** Toggle blocks become a flat paragraph; nested content is lost.
- **No sub-page expansion.** A page's child pages do NOT auto-import — the user has to select them explicitly. This will become awkward at scale; revisit list at `/memories/repo/parked-ideas.md`.
- **Picker shows ≤100 pages.** Hard cap to keep the dialog snappy. Pagination beyond 100 is parked.
- **Imports are sequential** server-side (Notion rate-limits aggressively). Importing 25 pages takes ~25 × `(search + children)` round-trips.
- **No image download.** Images stay on Notion's CDN with finite-life URLs; we don't proxy them. Ties into the parked clipboard image-paste workstream.
- **No AI extraction yet.** Promoting an imported note to a profile section uses the same manual extraction flow as any other note. Future: auto-promote on import.
- **Title fallback is hard-coded English** ("Untitled"). i18n parked.
- **Picker does not expose a "Show only my own pages" filter.** It returns whatever Notion's `search` endpoint surfaces given the granted token scope.
- **Unsupported placeholder text is hard-coded English.** `[unsupported X block]` is not localized.

## 5. Future / Deferred

See `/memories/repo/parked-ideas.md` → "Notion import on-ramp v1 — revisit list (parked 2026-06-08)" for the full list (11 items). Highlights:

- Children expansion (sub-pages, toggles) — biggest quality bump.
- Image pipeline (download Notion-hosted images into our blob storage; pairs with the parked clipboard image-paste idea).
- Tables — deferred until a Tiptap table extension lands.
- Re-import refresh (v2) — opt-in "pull latest" with conflict resolution.
- Picker pagination beyond 100 pages.
- Surface `droppedBlocks` to the user post-import ("3 images, 1 table dropped — see Notion for originals").
- AI extraction integration: auto-promote imported notes to profile sections.
