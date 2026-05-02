-- AlterTable
ALTER TABLE "GalleryPhoto" ADD COLUMN     "annotationsPublic" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "MediaAnnotation" (
    "id" TEXT NOT NULL,
    "photoId" TEXT,
    "kind" TEXT NOT NULL,
    "geometry" TEXT NOT NULL,
    "title" TEXT,
    "body" TEXT,
    "color" TEXT NOT NULL DEFAULT '#ef4444',
    "tags" TEXT,
    "sortOrder" INTEGER,
    "videoTimestamp" DOUBLE PRECISION,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaAnnotation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaAnnotation_photoId_idx" ON "MediaAnnotation"("photoId");

-- CreateIndex
CREATE INDEX "MediaAnnotation_photoId_sortOrder_idx" ON "MediaAnnotation"("photoId", "sortOrder");

-- AddForeignKey
ALTER TABLE "MediaAnnotation" ADD CONSTRAINT "MediaAnnotation_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "GalleryPhoto"("id") ON DELETE CASCADE ON UPDATE CASCADE;
