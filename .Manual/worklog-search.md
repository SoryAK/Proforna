# Feature: Worklog Full-Text Search Palette (W1.2)

## Functional Description

A keyboard-driven command palette that searches the user's entire worklog
across every folder. Press `/` anywhere in the worklog shell to open it,
type at least 2 characters, and Postgres returns ranked matches with
highlighted snippets in under a tenth of a second.

When the user is inside a specific folder, the palette automatically
scopes the search to that folder + all of its descendants. From any
other rail selection (All notes, Notable, categories, Templates) it
searches across every note the user owns.

## Internal Workflow

1. User presses `/` (handled in `use-worklog-keyboard-nav.ts`).
2. `useWorklogKeyboardNav` calls the orchestrator's `openSearchPalette()`,
   which flips `searchPaletteOpen` state in `worklog-page.tsx`.
3. `WorklogSearchPalette` opens, autofocuses its input, debounces typing
   by 250ms.
4. A TanStack Query (`useQuery`) hits `GET /api/work-logs/search?q=…&folderId=…&limit=20`.
5. The route (`src/app/api/work-logs/search/route.ts`):
   - Validates `q.length ∈ [2, 200]` and `limit ≤ 50`.
   - Authenticates via `getUserId()`; userId is ALWAYS in the WHERE clause.
   - If `folderId` provided, expands it via `collectDescendantIds`.
   - Runs a parameterized `$queryRaw` two-stage CTE:
     - `ranked` CTE: filter by `search_vector @@ plainto_tsquery('english', q)`,
       order by `ts_rank_cd`, `LIMIT 20`.
     - Outer SELECT: compute `ts_headline` (with `<mark>…</mark>` highlights)
       only for those 20 rows.
6. The palette renders rows: title + sanitized snippet HTML + date.
7. User picks a result (Enter / click) → `onSelect(id)` sets the active
   note in the orchestrator and reveals the reader pane.

## Configuration / Params

- **Source columns & weights**: `title` (A), `content` (B), `tags` (C).
  All combined into a STORED `tsvector` column `search_vector` by Postgres
  (see migration `20260523220000_add_worklog_search_vector`).
- **Language**: `'english'` dictionary (stemming enabled).
- **Debounce**: 250ms client-side.
- **Snippet shape**: `MaxFragments=2, MaxWords=15, MinWords=5, ShortWord=3`.
- **Query type**: `plainto_tsquery` (treats input as plain text, no operator
  syntax) — eliminates injection / parse-error class.
- **Stale time**: 30 seconds (TanStack Query cache).

## Known Constraints

- English-only stemming; non-English notes match exactly but won't stem.
- The GENERATED column adds ~2× the size of `title + content + tags` per row.
- `plainto_tsquery` does not support boolean operators (no `AND/OR/NOT`,
  no quoted phrases). If the user wants phrase search later, swap to
  `websearch_to_tsquery`.
- Snippet HTML is whitelisted to `<mark>` only — any other tag in note
  content is escaped before render.
- Migration is non-concurrent index build — for very large tables it
  blocks writes briefly. Acceptable at current scale.
