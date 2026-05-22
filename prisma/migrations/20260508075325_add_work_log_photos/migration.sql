-- Add WorkLogPhoto table for per-log photo evidence attachments.
-- This file restores a missing migration artifact so Prisma migration chain remains valid.
-- SQL is written to be safe if table/index/constraint already exists.

CREATE TABLE IF NOT EXISTS "WorkLogPhoto" (
    "id" TEXT NOT NULL,
    "workLogId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkLogPhoto_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "WorkLogPhoto_workLogId_idx" ON "WorkLogPhoto"("workLogId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'WorkLogPhoto_workLogId_fkey'
  ) THEN
    ALTER TABLE "WorkLogPhoto"
      ADD CONSTRAINT "WorkLogPhoto_workLogId_fkey"
      FOREIGN KEY ("workLogId") REFERENCES "WorkLog"("id")
      ON DELETE CASCADE
      ON UPDATE CASCADE;
  END IF;
END
$$;
