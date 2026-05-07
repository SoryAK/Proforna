-- Banner slideshow plumbing: per-photo flag, global setting, per-job override,
-- and per sub-location cover image (with fallback to parent WorkHistory cover).

-- AlterTable
ALTER TABLE "GalleryPhoto" ADD COLUMN "isBanner" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN "bannerSlideshowEnabled" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "WorkHistory" ADD COLUMN "bannerSlideshowOverride" BOOLEAN;

-- AlterTable
ALTER TABLE "WorkHistoryLocation" ADD COLUMN "coverImage" TEXT;
ALTER TABLE "WorkHistoryLocation" ADD COLUMN "coverImageY" DOUBLE PRECISION DEFAULT 50;
