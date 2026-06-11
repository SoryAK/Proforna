-- ADR-0026 — Gmail-style archive bucket for WorkLog notes.
-- NULL = active (default surface). Non-null = archived (hidden from list,
-- search, All Notes; visible only via the dedicated `?archived=1` filter).

-- AlterTable
ALTER TABLE "WorkLog" ADD COLUMN "archivedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "WorkLog_userId_archivedAt_idx" ON "WorkLog"("userId", "archivedAt");
