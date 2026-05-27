-- Asset Library Sprint 1 — manual migration (ADR-0012)
-- Creates: AssetType, AssetDocument, AssetLink tables + FK constraints + indexes

CREATE TABLE IF NOT EXISTS "AssetType" (
  "id"           TEXT NOT NULL,
  "userId"       TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "category"     TEXT NOT NULL DEFAULT 'machine',
  "description"  TEXT,
  "manufacturer" TEXT,
  "tags"         TEXT[] NOT NULL DEFAULT '{}',
  "isPublic"     BOOLEAN NOT NULL DEFAULT false,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetType_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssetDocument" (
  "id"          TEXT NOT NULL,
  "assetTypeId" TEXT,
  "assetId"     TEXT,
  "docType"     TEXT NOT NULL DEFAULT 'manual',
  "title"       TEXT NOT NULL,
  "filePath"    TEXT,
  "url"         TEXT,
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetDocument_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "AssetLink" (
  "id"          TEXT NOT NULL,
  "assetTypeId" TEXT,
  "assetId"     TEXT,
  "url"         TEXT NOT NULL,
  "title"       TEXT NOT NULL,
  "linkType"    TEXT NOT NULL DEFAULT 'other',
  "notes"       TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetLink_pkey" PRIMARY KEY ("id")
);

-- FK: AssetType → User
ALTER TABLE "AssetType"
  ADD CONSTRAINT "AssetType_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: JobAsset → AssetType
ALTER TABLE "JobAsset"
  ADD CONSTRAINT "JobAsset_assetTypeId_fkey"
  FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- FK: AssetDocument → AssetType
ALTER TABLE "AssetDocument"
  ADD CONSTRAINT "AssetDocument_assetTypeId_fkey"
  FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: AssetDocument → JobAsset
ALTER TABLE "AssetDocument"
  ADD CONSTRAINT "AssetDocument_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "JobAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: AssetLink → AssetType
ALTER TABLE "AssetLink"
  ADD CONSTRAINT "AssetLink_assetTypeId_fkey"
  FOREIGN KEY ("assetTypeId") REFERENCES "AssetType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- FK: AssetLink → JobAsset
ALTER TABLE "AssetLink"
  ADD CONSTRAINT "AssetLink_assetId_fkey"
  FOREIGN KEY ("assetId") REFERENCES "JobAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Indexes
CREATE INDEX IF NOT EXISTS "AssetType_userId_idx" ON "AssetType"("userId");
CREATE INDEX IF NOT EXISTS "AssetDocument_assetTypeId_idx" ON "AssetDocument"("assetTypeId");
CREATE INDEX IF NOT EXISTS "AssetDocument_assetId_idx" ON "AssetDocument"("assetId");
CREATE INDEX IF NOT EXISTS "AssetLink_assetTypeId_idx" ON "AssetLink"("assetTypeId");
CREATE INDEX IF NOT EXISTS "AssetLink_assetId_idx" ON "AssetLink"("assetId");
CREATE INDEX IF NOT EXISTS "JobAsset_assetTypeId_idx" ON "JobAsset"("assetTypeId");
