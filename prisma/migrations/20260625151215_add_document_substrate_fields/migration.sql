-- ADR-0051 sprint α' commit 1 — Document substrate fields + AssetDocument link.
--
-- Adds eight new fields to Document (filePath, contentHash, pageCount,
-- processingStatus, processedAt, extractionError, markdownContent,
-- search_vector) plus two indexes; makes `data` nullable so disk-backed rows
-- can omit it. Adds `documentId` FK + index on AssetDocument so manuals stored
-- via /docs can be linked to JobAssets without duplicating bytes.
--
-- The `search_vector` column was emitted by `prisma migrate dev` as a plain
-- tsvector — replaced below with `GENERATED ALWAYS AS (...) STORED` so the
-- projection is maintained by Postgres. Same pattern as
-- 20260523220000_add_worklog_search_vector. Also adds the GIN index for
-- sub-millisecond `@@` lookups once extraction populates markdownContent.
--
-- The `ALTER COLUMN "search_vector" DROP DEFAULT` lines that prisma migrate
-- dev auto-generated for CareerEvent and WorkLog were intentionally dropped.
-- Those columns are GENERATED ALWAYS tsvector projections; Postgres rejects
-- DROP DEFAULT on generated columns. This is the same intrinsic Prisma
-- false-positive flagged in docs/workflows/recover-from-prisma-drift.md.

-- AlterTable
ALTER TABLE "AssetDocument" ADD COLUMN     "documentId" TEXT;

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "contentHash" TEXT,
ADD COLUMN     "extractionError" TEXT,
ADD COLUMN     "filePath" TEXT,
ADD COLUMN     "markdownContent" TEXT,
ADD COLUMN     "pageCount" INTEGER,
ADD COLUMN     "processedAt" TIMESTAMP(3),
ADD COLUMN     "processingStatus" TEXT NOT NULL DEFAULT 'pending',
ALTER COLUMN "data" DROP NOT NULL;

-- Add the GENERATED STORED tsvector column for full-text search over
-- markdownContent. Stays empty until ADR-0050's extraction pipeline populates
-- markdownContent. Same shape as WorkLog.search_vector.
ALTER TABLE "Document"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce("markdownContent", ''))
  ) STORED;

-- CreateIndex
CREATE INDEX "AssetDocument_documentId_idx" ON "AssetDocument"("documentId");

-- CreateIndex
CREATE INDEX "Document_userId_processingStatus_idx" ON "Document"("userId", "processingStatus");

-- CreateIndex
CREATE INDEX "Document_contentHash_idx" ON "Document"("contentHash");

-- CreateIndex (GIN over the generated tsvector)
CREATE INDEX "Document_search_vector_idx" ON "Document" USING GIN ("search_vector");

-- AddForeignKey
ALTER TABLE "AssetDocument" ADD CONSTRAINT "AssetDocument_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE SET NULL ON UPDATE CASCADE;

