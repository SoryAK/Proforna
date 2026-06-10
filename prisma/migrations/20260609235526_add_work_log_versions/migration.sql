-- ADR-0017 — WorkLogVersion table for note version history + visual diff.
-- (Prisma also generated a spurious `ALTER TABLE "WorkLog" ALTER COLUMN
-- "search_vector" DROP DEFAULT;` line because it cannot introspect the
-- GENERATED tsvector column from migration 20260523220000. Removed by hand —
-- generated columns have no DEFAULT to drop.)

-- CreateTable
CREATE TABLE "WorkLogVersion" (
    "id" TEXT NOT NULL,
    "workLogId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "plainText" TEXT,
    "label" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkLogVersion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkLogVersion_workLogId_createdAt_idx" ON "WorkLogVersion"("workLogId", "createdAt");

-- CreateIndex
CREATE INDEX "WorkLogVersion_userId_idx" ON "WorkLogVersion"("userId");

-- AddForeignKey
ALTER TABLE "WorkLogVersion" ADD CONSTRAINT "WorkLogVersion_workLogId_fkey" FOREIGN KEY ("workLogId") REFERENCES "WorkLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLogVersion" ADD CONSTRAINT "WorkLogVersion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
