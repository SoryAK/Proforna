-- W2.1 T1 — Add sortOrder to WorkLog for drag-reorder within folders.
-- Column defaults to 0; the backfill below assigns dense ranks so that
-- existing notes don't all tie at 0 after migration.

-- Step 1: Add the column (all rows land at 0).
ALTER TABLE "WorkLog" ADD COLUMN "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- Step 2: Backfill — assign a 0-based dense rank within each (userId, folderId)
-- partition, ordered by date DESC then createdAt DESC so the most recent
-- note gets the lowest rank (top of list).
-- NOTE: column names are camelCase because this project uses Prisma defaults
-- (no @map annotations) — Postgres stores them as quoted identifiers.
UPDATE "WorkLog" wl
SET "sortOrder" = sub.rn
FROM (
  SELECT id,
    (ROW_NUMBER() OVER (
      PARTITION BY COALESCE("folderId", '___unfiled___')
      ORDER BY "date" DESC, "createdAt" DESC
    ) - 1) AS rn
  FROM "WorkLog"
) sub
WHERE wl.id = sub.id;

-- Step 3: Composite index to make sorted list queries fast.
CREATE INDEX "WorkLog_userId_folderId_sortOrder_idx"
  ON "WorkLog"("userId", "folderId", "sortOrder");
