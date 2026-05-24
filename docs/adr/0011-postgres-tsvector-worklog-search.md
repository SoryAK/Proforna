# Postgres tsvector for Worklog Full-Text Search

- **Status:** Proposed
- **Date:** 2026-05-23
- **Deciders:** Sory
- **Tags:** data, search, performance

## Context and Problem Statement

The worklog notes UI shipped a client-side `String.includes()` filter that
only matches within the currently visible list. As note volume grew the
need for a fast, scoped, global search (W1.2 in the worklog roadmap) became
explicit: "find that note about X" without remembering which folder it lives
in.

The dataset is already in Postgres (`WorkLog.title` + `WorkLog.content` +
`WorkLog.tags`). Notes are short-to-medium text, single-tenant per row, and
the dominant read pattern is "filter by user + match terms".

## Decision Drivers

- Latency budget: under 100ms server-side for typical query sizes.
- Zero new infrastructure — we already pay for Postgres.
- Snippet highlighting required for usability.
- No new background sync job to keep an index consistent with rows.
- Tenant isolation must be enforced at the data layer, not assumed.

## Considered Options

- **Option A** — Postgres `tsvector` + GIN, as a GENERATED STORED column.
- **Option B** — Application-side maintained `tsvector` (trigger on save).
- **Option C** — External search service (Meilisearch / Typesense / Elastic).
- **Option D** — Keep client-side `includes()` and fetch all rows.

## Decision Outcome

**Chosen option: "Postgres tsvector + GIN as GENERATED STORED column."**

The dataset never leaves Postgres, the projection is maintained by the
database (no forgotten save paths), and `ts_rank_cd` + `ts_headline`
deliver ranking and snippets out of the box.

### Positive Consequences

- Sub-millisecond GIN lookups at our scale; query latency dominated by
  `ts_headline` cost on the (≤20) returned rows.
- No new infrastructure, no new sync job, no eventual-consistency window.
- Schema migration is additive and reversible.
- The `userId` predicate is enforced in the same query as the rank — no
  way for app code to omit it accidentally.

### Negative Consequences

- Row width grows by roughly 2× the indexed text length per row.
- English-only stemming committed in SQL; switching dictionaries requires
  a migration.
- `plainto_tsquery` does not support phrase / boolean operators — future
  feature would require swapping to `websearch_to_tsquery`.
- The migration adds a GIN index non-concurrently (Prisma migrate runs
  inside a transaction). Acceptable while user count is small.

## Pros and Cons of the Options

### Option A — Postgres tsvector + GIN, GENERATED STORED

- ✅ No new service; zero ops cost.
- ✅ DB-maintained projection — immune to forgotten write paths.
- ✅ `ts_headline` produces snippets without a second round-trip.
- ✅ `Prisma.sql` + `plainto_tsquery` makes injection / parse errors
  structurally impossible.
- ❌ Row bloat (~2× text size).
- ❌ Language is baked into the column definition.

### Option B — Application-maintained tsvector via trigger or save hook

- ✅ Lets the app derive richer text (e.g. flatten ProseMirror JSON itself).
- ❌ A new save path that forgets to update the column silently breaks search.
- ❌ Migration / backfill burden lives in app code.

### Option C — External search service (Meilisearch / Typesense / Elastic)

- ✅ Best-in-class ranking, typo tolerance, faceting.
- ❌ New service to host, monitor, and authenticate.
- ❌ Sync pipeline + eventual consistency window.
- ❌ Vastly overbuilt for the current scale.

### Option D — Client-side `includes()` over a full fetch

- ✅ Simplest possible.
- ❌ Linear scan on the client; breaks at a few hundred notes.
- ❌ No ranking, no snippets, no scoping efficiency.
- ❌ Forces every search to download every note.

## Links / References

- Migration: `prisma/migrations/20260523220000_add_worklog_search_vector/`
- Route: `src/app/api/work-logs/search/route.ts`
- Roadmap entry: `docs/plans/worklog-w1-w2-roadmap.md` (W1.2)
- Manual: `.Manual/worklog-search.md`
