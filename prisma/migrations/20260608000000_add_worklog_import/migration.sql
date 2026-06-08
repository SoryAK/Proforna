-- Add WorkLogImport audit + dedupe table for the worklog note-import pipeline.
-- See ADR (forthcoming) and prisma/schema.prisma `model WorkLogImport`.
--
-- Additive migration: no existing rows touched. Safe to apply via
-- `npx prisma migrate deploy`.

-- CreateTable
CREATE TABLE "WorkLogImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourceType" TEXT NOT NULL,
    "sourceFingerprint" TEXT NOT NULL,
    "sourceFilename" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "droppedBlocks" JSONB,
    "workLogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "WorkLogImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: enforces "one import row -> at most one WorkLog"
CREATE UNIQUE INDEX "WorkLogImport_workLogId_key" ON "WorkLogImport"("workLogId");

-- CreateIndex: dedupe key — rejects "user uploaded the same file twice" at the DB layer
CREATE UNIQUE INDEX "WorkLogImport_dedupe" ON "WorkLogImport"("userId", "sourceType", "sourceFingerprint");

-- CreateIndex: list-by-user-recent (history UI)
CREATE INDEX "WorkLogImport_userId_createdAt_idx" ON "WorkLogImport"("userId", "createdAt");

-- CreateIndex: filter-by-status (e.g. show failed imports)
CREATE INDEX "WorkLogImport_userId_status_idx" ON "WorkLogImport"("userId", "status");

-- AddForeignKey
ALTER TABLE "WorkLogImport"
  ADD CONSTRAINT "WorkLogImport_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: SetNull so import rows survive a WorkLog deletion (history value)
ALTER TABLE "WorkLogImport"
  ADD CONSTRAINT "WorkLogImport_workLogId_fkey"
  FOREIGN KEY ("workLogId") REFERENCES "WorkLog"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
