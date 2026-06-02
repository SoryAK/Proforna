-- AlterTable
ALTER TABLE "WorkLog" ADD COLUMN     "assetIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "WorkLogTemplate" ADD COLUMN     "defaultAssetIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "JobAsset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "assetType" TEXT NOT NULL DEFAULT 'machine',
    "identifier" TEXT,
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "positionId" TEXT,
    "customerName" TEXT,
    "location" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "installedAt" TIMESTAMP(3),
    "commissionedAt" TIMESTAMP(3),
    "notes" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "isDraft" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobAsset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobAsset_userId_idx" ON "JobAsset"("userId");

-- CreateIndex
CREATE INDEX "JobAsset_positionId_idx" ON "JobAsset"("positionId");

-- AddForeignKey
ALTER TABLE "JobAsset" ADD CONSTRAINT "JobAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobAsset" ADD CONSTRAINT "JobAsset_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE;
