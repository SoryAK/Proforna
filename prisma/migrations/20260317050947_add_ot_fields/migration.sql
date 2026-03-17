-- AlterTable
ALTER TABLE "CurrentPosition" ADD COLUMN "otHoursA" REAL;
ALTER TABLE "CurrentPosition" ADD COLUMN "otHoursB" REAL;
ALTER TABLE "CurrentPosition" ADD COLUMN "otRate" REAL DEFAULT 1.5;
