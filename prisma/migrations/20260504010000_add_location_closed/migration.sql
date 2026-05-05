-- AlterTable
ALTER TABLE "WorkHistory" ADD COLUMN "locationClosed" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkHistoryLocation" ADD COLUMN "closed" BOOLEAN NOT NULL DEFAULT false;
