-- CreateTable
CREATE TABLE "JobAssetPhoto" (
    "id" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "caption" TEXT,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "focalX" INTEGER NOT NULL DEFAULT 50,
    "focalY" INTEGER NOT NULL DEFAULT 50,
    "zoom" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "flipH" BOOLEAN NOT NULL DEFAULT false,
    "flipV" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobAssetPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobAssetPhoto_assetId_idx" ON "JobAssetPhoto"("assetId");

-- AddForeignKey
ALTER TABLE "JobAssetPhoto" ADD CONSTRAINT "JobAssetPhoto_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "JobAsset"("id") ON DELETE CASCADE ON UPDATE CASCADE;
