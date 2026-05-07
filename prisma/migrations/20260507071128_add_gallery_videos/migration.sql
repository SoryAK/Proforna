-- AlterTable
ALTER TABLE "MediaAnnotation" ADD COLUMN     "videoId" TEXT;

-- CreateTable
CREATE TABLE "GalleryVideo" (
    "id" TEXT NOT NULL,
    "workHistoryId" TEXT NOT NULL,
    "albumId" TEXT,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "posterPath" TEXT,
    "durationSec" DOUBLE PRECISION,
    "width" INTEGER,
    "height" INTEGER,
    "caption" TEXT,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "isFavorite" BOOLEAN NOT NULL DEFAULT false,
    "isPrivate" BOOLEAN NOT NULL DEFAULT false,
    "annotationsPublic" BOOLEAN NOT NULL DEFAULT true,
    "tags" TEXT,
    "dateTaken" TIMESTAMP(3),
    "sortOrder" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GalleryVideo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GalleryVideo_workHistoryId_idx" ON "GalleryVideo"("workHistoryId");

-- CreateIndex
CREATE INDEX "GalleryVideo_albumId_idx" ON "GalleryVideo"("albumId");

-- CreateIndex
CREATE INDEX "MediaAnnotation_videoId_idx" ON "MediaAnnotation"("videoId");

-- CreateIndex
CREATE INDEX "MediaAnnotation_videoId_sortOrder_idx" ON "MediaAnnotation"("videoId", "sortOrder");

-- AddForeignKey
ALTER TABLE "GalleryVideo" ADD CONSTRAINT "GalleryVideo_workHistoryId_fkey" FOREIGN KEY ("workHistoryId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GalleryVideo" ADD CONSTRAINT "GalleryVideo_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "GalleryAlbum"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAnnotation" ADD CONSTRAINT "MediaAnnotation_videoId_fkey" FOREIGN KEY ("videoId") REFERENCES "GalleryVideo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
