-- Phase 2b: WorkLogPhoto.source discriminator
-- Distinguishes photos uploaded via the Photos disclosure panel ("panel")
-- from images embedded inline inside a worklog note ("body").
-- Existing rows are panel photos.

ALTER TABLE "WorkLogPhoto"
  ADD COLUMN IF NOT EXISTS "source" TEXT NOT NULL DEFAULT 'panel';

CREATE INDEX IF NOT EXISTS "WorkLogPhoto_workLogId_source_idx"
  ON "WorkLogPhoto"("workLogId", "source");
