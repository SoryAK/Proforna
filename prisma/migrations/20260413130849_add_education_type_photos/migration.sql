-- AlterTable
ALTER TABLE "WorkHistory" ADD COLUMN     "degree" TEXT,
ADD COLUMN     "gpa" DOUBLE PRECISION,
ADD COLUMN     "major" TEXT,
ADD COLUMN     "type" TEXT NOT NULL DEFAULT 'job';

-- AlterTable
ALTER TABLE "WorkHistoryLocation" ADD COLUMN     "photos" TEXT;
