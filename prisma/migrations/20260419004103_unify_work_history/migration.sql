/*
  Unify CurrentPosition into WorkHistory.
  - Adds payroll/employer fields to WorkHistory
  - Migrates all CP data into WH rows (linked + unlinked)
  - Re-points child tables (Equipment, WorkLog, etc.) to WH ids
  - Drops CurrentPosition table
*/

-- DropForeignKey
ALTER TABLE "Benefit" DROP CONSTRAINT "Benefit_positionId_fkey";
ALTER TABLE "CompensationEvent" DROP CONSTRAINT "CompensationEvent_positionId_fkey";
ALTER TABLE "CurrentPosition" DROP CONSTRAINT "CurrentPosition_userId_fkey";
ALTER TABLE "Equipment" DROP CONSTRAINT "Equipment_positionId_fkey";
ALTER TABLE "PaycheckRecord" DROP CONSTRAINT "PaycheckRecord_positionId_fkey";
ALTER TABLE "TimeOffBalance" DROP CONSTRAINT "TimeOffBalance_positionId_fkey";
ALTER TABLE "WorkHistory" DROP CONSTRAINT "WorkHistory_linkedPositionId_fkey";
ALTER TABLE "WorkLog" DROP CONSTRAINT "WorkLog_positionId_fkey";

-- AlterTable: Add new columns (keep linkedPositionId for data migration)
ALTER TABLE "WorkHistory"
ADD COLUMN     "annualRaiseMax" DOUBLE PRECISION,
ADD COLUMN     "annualRaiseMin" DOUBLE PRECISION,
ADD COLUMN     "companySynopsis" TEXT,
ADD COLUMN     "coverImage" TEXT,
ADD COLUMN     "description" TEXT,
ADD COLUMN     "differentials" TEXT,
ADD COLUMN     "ein" TEXT,
ADD COLUMN     "estimatorSettings" TEXT,
ADD COLUMN     "focus" TEXT,
ADD COLUMN     "industry" TEXT,
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "legalName" TEXT,
ADD COLUMN     "location" TEXT,
ADD COLUMN     "otHoursA" DOUBLE PRECISION,
ADD COLUMN     "otHoursB" DOUBLE PRECISION,
ADD COLUMN     "otRate" DOUBLE PRECISION DEFAULT 1.5,
ADD COLUMN     "payFrequency" TEXT DEFAULT 'biweekly',
ADD COLUMN     "payRate" TEXT,
ADD COLUMN     "payType" TEXT DEFAULT 'salary',
ADD COLUMN     "responsibilities" TEXT,
ADD COLUMN     "rotatingSchedule" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "schedule" TEXT,
ADD COLUMN     "scheduleBHours" DOUBLE PRECISION,
ADD COLUMN     "techStack" TEXT,
ADD COLUMN     "website" TEXT;

-- ═══════════════════════════════════════════════════════════════
-- DATA MIGRATION
-- ═══════════════════════════════════════════════════════════════

-- 1) LINKED CPs: copy payroll & employer fields from CP into linked WH row
UPDATE "WorkHistory" wh
SET
  "location"         = cp."location",
  "description"      = COALESCE(wh."description", cp."description"),
  "responsibilities" = COALESCE(wh."responsibilities", cp."responsibilities"),
  "techStack"        = COALESCE(wh."techStack", cp."techStack"),
  "isActive"         = cp."isActive",
  "ein"              = cp."ein",
  "legalName"        = cp."legalName",
  "companySynopsis"  = cp."companySynopsis",
  "industry"         = cp."industry",
  "website"          = cp."website",
  "focus"            = cp."focus",
  "schedule"         = cp."schedule",
  "payRate"          = cp."payRate",
  "payType"          = cp."payType",
  "differentials"    = cp."differentials",
  "payFrequency"     = cp."payFrequency",
  "rotatingSchedule" = cp."rotatingSchedule",
  "scheduleBHours"   = cp."scheduleBHours",
  "otHoursA"         = cp."otHoursA",
  "otHoursB"         = cp."otHoursB",
  "otRate"           = cp."otRate",
  "annualRaiseMin"   = cp."annualRaiseMin",
  "annualRaiseMax"   = cp."annualRaiseMax",
  "estimatorSettings"= cp."estimatorSettings",
  "coverImage"       = cp."coverImage",
  "title"            = COALESCE(wh."title", cp."role"),
  "salaryAmount"     = COALESCE(wh."salaryAmount", cp."salary"),
  "salaryCurrency"   = COALESCE(wh."salaryCurrency", cp."currency"),
  "workMode"         = COALESCE(wh."workMode", cp."type"),
  "hoursPerWeek"     = COALESCE(wh."hoursPerWeek", cp."hoursPerWeek"),
  "department"       = COALESCE(wh."department", cp."department"),
  "managerName"      = COALESCE(wh."managerName", cp."managerName")
FROM "CurrentPosition" cp
WHERE wh."linkedPositionId" = cp."id";

-- 2) Re-point child tables from CP.id → WH.id for linked positions
UPDATE "Equipment"         e  SET "positionId" = wh."id" FROM "WorkHistory" wh WHERE e."positionId" = wh."linkedPositionId";
UPDATE "WorkLog"           wl SET "positionId" = wh."id" FROM "WorkHistory" wh WHERE wl."positionId" = wh."linkedPositionId";
UPDATE "CompensationEvent" ce SET "positionId" = wh."id" FROM "WorkHistory" wh WHERE ce."positionId" = wh."linkedPositionId";
UPDATE "Benefit"           b  SET "positionId" = wh."id" FROM "WorkHistory" wh WHERE b."positionId" = wh."linkedPositionId";
UPDATE "TimeOffBalance"    tb SET "positionId" = wh."id" FROM "WorkHistory" wh WHERE tb."positionId" = wh."linkedPositionId";
UPDATE "PaycheckRecord"    pr SET "positionId" = wh."id" FROM "WorkHistory" wh WHERE pr."positionId" = wh."linkedPositionId";

-- 3) UNLINKED CPs: insert new WH rows reusing CP.id (child FKs stay valid)
INSERT INTO "WorkHistory" (
  "id", "userId", "company", "title", "workMode",
  "salaryAmount", "salaryCurrency", "hoursPerWeek",
  "department", "managerName", "startDate", "endDate",
  "location", "description", "responsibilities", "techStack",
  "isActive", "ein", "legalName", "companySynopsis", "industry",
  "website", "focus", "schedule", "payRate", "payType",
  "differentials", "payFrequency", "rotatingSchedule",
  "scheduleBHours", "otHoursA", "otHoursB", "otRate",
  "annualRaiseMin", "annualRaiseMax", "estimatorSettings",
  "coverImage", "createdAt", "updatedAt"
)
SELECT
  cp."id", cp."userId", cp."company", cp."role", cp."type",
  cp."salary", cp."currency", cp."hoursPerWeek",
  cp."department", cp."managerName",
  to_char(cp."startDate", 'YYYY-MM'),
  CASE WHEN cp."endDate" IS NOT NULL THEN to_char(cp."endDate", 'YYYY-MM') ELSE NULL END,
  cp."location", cp."description", cp."responsibilities", cp."techStack",
  cp."isActive", cp."ein", cp."legalName", cp."companySynopsis", cp."industry",
  cp."website", cp."focus", cp."schedule", cp."payRate", cp."payType",
  cp."differentials", cp."payFrequency", cp."rotatingSchedule",
  cp."scheduleBHours", cp."otHoursA", cp."otHoursB", cp."otRate",
  cp."annualRaiseMin", cp."annualRaiseMax", cp."estimatorSettings",
  cp."coverImage", cp."createdAt", cp."updatedAt"
FROM "CurrentPosition" cp
WHERE cp."id" NOT IN (
  SELECT "linkedPositionId" FROM "WorkHistory" WHERE "linkedPositionId" IS NOT NULL
);

-- 4) Mark jobs with no endDate as active
UPDATE "WorkHistory" SET "isActive" = true WHERE "endDate" IS NULL OR "endDate" = '';

-- ═══════════════════════════════════════════════════════════════
-- CLEANUP
-- ═══════════════════════════════════════════════════════════════

-- Drop link column
ALTER TABLE "WorkHistory" DROP COLUMN "linkedPositionId";

-- Drop old table
DROP TABLE "CurrentPosition";

-- AddForeignKey (child tables now reference WorkHistory)
ALTER TABLE "Equipment" ADD CONSTRAINT "Equipment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkLog" ADD CONSTRAINT "WorkLog_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CompensationEvent" ADD CONSTRAINT "CompensationEvent_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Benefit" ADD CONSTRAINT "Benefit_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TimeOffBalance" ADD CONSTRAINT "TimeOffBalance_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "PaycheckRecord" ADD CONSTRAINT "PaycheckRecord_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
