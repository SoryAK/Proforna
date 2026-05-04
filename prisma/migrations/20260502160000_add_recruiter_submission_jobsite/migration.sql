-- AlterTable
ALTER TABLE "RecruiterSubmission"
  ADD COLUMN "jobLat" DOUBLE PRECISION,
  ADD COLUMN "jobLng" DOUBLE PRECISION,
  ADD COLUMN "commuteMiles" DOUBLE PRECISION,
  ADD COLUMN "commuteMinutes" INTEGER,
  ADD COLUMN "withinRange" BOOLEAN;
