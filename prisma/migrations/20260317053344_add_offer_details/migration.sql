-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN "offer401kMatch" REAL;
ALTER TABLE "JobApplication" ADD COLUMN "offerAnnualBonus" INTEGER;
ALTER TABLE "JobApplication" ADD COLUMN "offerEquity" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN "offerHealthCost" REAL;
ALTER TABLE "JobApplication" ADD COLUMN "offerHoursPerWeek" REAL;
ALTER TABLE "JobApplication" ADD COLUMN "offerNotes" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN "offerOtHours" REAL;
ALTER TABLE "JobApplication" ADD COLUMN "offerOtRate" REAL DEFAULT 1.5;
ALTER TABLE "JobApplication" ADD COLUMN "offerPayFrequency" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN "offerPayRate" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN "offerPayType" TEXT;
ALTER TABLE "JobApplication" ADD COLUMN "offerPtoDays" INTEGER;
ALTER TABLE "JobApplication" ADD COLUMN "offerSalary" INTEGER;
ALTER TABLE "JobApplication" ADD COLUMN "offerSigningBonus" INTEGER;
ALTER TABLE "JobApplication" ADD COLUMN "offerStartDate" DATETIME;
