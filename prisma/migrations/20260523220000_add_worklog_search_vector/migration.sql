-- W1.2 — Postgres full-text search on WorkLog.
-- Adds a GENERATED tsvector projection of title (weight A), content (B), tags (C)
-- and a GIN index for sub-millisecond `@@` lookups.
--
-- We use a STORED generated column (Postgres 12+) so the projection is
-- maintained by the database; no app-side trigger or save-path hook required.
-- Trade-off: rows grow by ~2x the indexed text length, accepted because
-- search is the dominant read pattern on this table.

ALTER TABLE "WorkLog"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("content", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("tags", '')), 'C')
  ) STORED;

CREATE INDEX "WorkLog_search_vector_idx" ON "WorkLog" USING GIN ("search_vector");
