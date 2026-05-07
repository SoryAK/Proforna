-- AlterTable
ALTER TABLE "GalleryVideo" ADD COLUMN     "embedProvider" TEXT,
ADD COLUMN     "isEmbed" BOOLEAN NOT NULL DEFAULT false;
