-- =============================================================================
-- Baseline drift capture (2026-06-09)
-- =============================================================================
-- This migration captures schema changes that were applied to the live dev DB
-- via `prisma db execute` or manual SQL, but never recorded as proper
-- migration files. Without this file, a fresh-clone `prisma migrate deploy`
-- would produce a DB that no longer matches `schema.prisma`.
--
-- Sources of drift consolidated here:
--   1. Asset Knowledge Backbone (ADR-0012, Phase 1)
--      - new tables: AssetType, AssetDocument, AssetLink
--      - JobAsset.assetType (enum-as-string) renamed to JobAsset.assetTypeId
--        (FK to AssetType.id)
--   2. Worklog Voice Dictation v1 (ADR-0020, Sprint 6C)
--      - WorkLogPreference.voiceDictationConsentedAt (DateTime?)
--   3. Worklog index hygiene
--      - DROP INDEX WorkLog_shiftId_idx (no longer needed; covered by other
--        composite indexes per current schema)
--
-- Deliberately NOT included:
--   - `ALTER TABLE "WorkLog" ALTER COLUMN "search_vector" DROP DEFAULT`
--     Prisma reports this as drift because `Unsupported("tsvector")?` in
--     schema.prisma cannot express the Postgres GENERATED expression set up
--     in 20260523220000_add_worklog_search_vector. Including the line would
--     break a fresh deploy (Postgres rejects DROP DEFAULT on a GENERATED
--     column — needs DROP EXPRESSION, which we do NOT want). The tsvector
--     column is already correctly generated; leave it alone.
--
-- After this lands: NEVER use `prisma db execute` to add or change columns.
-- Always author a real, dated migration file so the history stays truthful.
-- =============================================================================

-- DropIndex
DROP INDEX "WorkLog_shiftId_idx";

-- AlterTable
ALTER TABLE "JobAsset" DROP COLUMN "assetType",
ADD COLUMN     "assetTypeId" TEXT;

-- AlterTable
ALTER TABLE "WorkLogPreference" ADD COLUMN     "voiceDictationConsentedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AssetType" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'machine',
    "description" TEXT,
    "manufacturer" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AssetType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetDocument" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT,
    "assetId" TEXT,
    "docType" TEXT NOT NULL DEFAULT 'manual',
    "title" TEXT NOT NULL,
    "filePath" TEXT,
    "url" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssetLink" (
    "id" TEXT NOT NULL,
    "assetTypeId" TEXT,
    "assetId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "linkType" TEXT NOT NULL DEFAULT 'other',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssetLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AssetType_userId_idx" ON "AssetType"("userId");

-- CreateIndex
CREATE INDEX "AssetDocument_assetTypeId_idx" ON "AssetDocument"("assetTypeId");

-- CreateIndex
CREATE INDEX "AssetDocument_assetId_idx" ON "AssetDocument"("assetId");

-- CreateIndex
CREATE INDEX "AssetLink_assetTypeId_idx" ON "AssetLink"("assetTypeId");

-- CreateIndex
CREATE INDEX "AssetLink_assetId_idx" ON "AssetLink"("assetId");

-- CreateIndex
CREATE INDEX "JobAsset_assetTypeId_idx" ON "JobAsset"("assetTypeId");

-- AddForeignKey
ALTER TABLE "JobAsset" ADD CONSTRAINT "JobAsset_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetType" ADD CONSTRAINT "AssetType_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDocument" ADD CONSTRAINT "AssetDocument_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetDocument" ADD CONSTRAINT "AssetDocument_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "JobAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetLink" ADD CONSTRAINT "AssetLink_assetTypeId_fkey" FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssetLink" ADD CONSTRAINT "AssetLink_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "JobAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
