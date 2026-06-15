-- ADR-0027 — Worklog Events via CareerEvent extension.
-- Three structural changes:
--   1. workHistoryId becomes nullable (free-floating events).
--   2. contentJson added (TipTap rich document; ADR-0010 pattern).
--   3. search_vector GENERATED tsvector + GIN index (mirrors ADR-0011 W1.2).
-- A partial index on (userId, startDate) WHERE startDate IS NOT NULL
-- supports the timeline query without bloating the index for events
-- without a fixed start.
--
-- The `ALTER TABLE "WorkLog" ALTER COLUMN "search_vector" DROP DEFAULT`
-- line that Prisma auto-generates for the shadow DB diff has been
-- removed: WorkLog.search_vector is a GENERATED column (no DEFAULT to
-- drop), and Postgres errors with "Use DROP EXPRESSION instead". The
-- Prisma quirk surfaces because the schema declares the field as
-- Unsupported("tsvector"), which loses the expression metadata.

-- AlterTable: nullable workHistoryId + contentJson
ALTER TABLE "CareerEvent"
  ADD COLUMN "contentJson" JSONB,
  ALTER COLUMN "workHistoryId" DROP NOT NULL;

-- AlterTable: GENERATED tsvector (Postgres 12+, ADR-0011 pattern)
ALTER TABLE "CareerEvent"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce("title", '')), 'A') ||
    setweight(to_tsvector('english', coalesce("description", '')), 'B') ||
    setweight(to_tsvector('english', coalesce("location", '')), 'C')
  ) STORED;

-- CreateIndex: GIN over the generated tsvector
CREATE INDEX "CareerEvent_search_vector_idx" ON "CareerEvent" USING GIN ("search_vector");

-- CreateIndex: partial index for timeline queries (anchored events only)
CREATE INDEX "CareerEvent_userId_startDate_idx" ON "CareerEvent"("userId", "startDate")
  WHERE "startDate" IS NOT NULL;
