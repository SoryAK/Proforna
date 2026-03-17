-- AlterTable
ALTER TABLE "Interview" ADD COLUMN "prepNotes" TEXT;
ALTER TABLE "Interview" ADD COLUMN "questions" TEXT;
ALTER TABLE "Interview" ADD COLUMN "reflection" TEXT;
ALTER TABLE "Interview" ADD COLUMN "reflectionRating" INTEGER;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Email" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "accountId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "subject" TEXT,
    "sender" TEXT NOT NULL,
    "recipient" TEXT,
    "date" DATETIME NOT NULL,
    "snippet" TEXT,
    "body" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "labels" TEXT,
    "applicationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Email_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "EmailAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Email_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "JobApplication" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Email" ("accountId", "body", "createdAt", "date", "id", "isRead", "labels", "messageId", "recipient", "sender", "snippet", "subject") SELECT "accountId", "body", "createdAt", "date", "id", "isRead", "labels", "messageId", "recipient", "sender", "snippet", "subject" FROM "Email";
DROP TABLE "Email";
ALTER TABLE "new_Email" RENAME TO "Email";
CREATE UNIQUE INDEX "Email_accountId_messageId_key" ON "Email"("accountId", "messageId");
CREATE TABLE "new_JobApplication" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "url" TEXT,
    "location" TEXT,
    "type" TEXT NOT NULL DEFAULT 'remote',
    "status" TEXT NOT NULL DEFAULT 'wishlist',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "appliedDate" DATETIME,
    "notes" TEXT,
    "offerPayType" TEXT,
    "offerPayRate" TEXT,
    "offerSalary" INTEGER,
    "offerPayFrequency" TEXT,
    "offerHoursPerWeek" REAL,
    "offerOtHours" REAL,
    "offerOtRate" REAL DEFAULT 1.5,
    "offerSigningBonus" INTEGER,
    "offerAnnualBonus" INTEGER,
    "offerEquity" TEXT,
    "offer401kMatch" REAL,
    "offerPtoDays" INTEGER,
    "offerHealthCost" REAL,
    "offerStartDate" DATETIME,
    "offerNotes" TEXT,
    "resumeVersionId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "JobApplication_resumeVersionId_fkey" FOREIGN KEY ("resumeVersionId") REFERENCES "ResumeVersion" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_JobApplication" ("appliedDate", "company", "createdAt", "currency", "id", "location", "notes", "offer401kMatch", "offerAnnualBonus", "offerEquity", "offerHealthCost", "offerHoursPerWeek", "offerNotes", "offerOtHours", "offerOtRate", "offerPayFrequency", "offerPayRate", "offerPayType", "offerPtoDays", "offerSalary", "offerSigningBonus", "offerStartDate", "role", "salaryMax", "salaryMin", "status", "type", "updatedAt", "url") SELECT "appliedDate", "company", "createdAt", "currency", "id", "location", "notes", "offer401kMatch", "offerAnnualBonus", "offerEquity", "offerHealthCost", "offerHoursPerWeek", "offerNotes", "offerOtHours", "offerOtRate", "offerPayFrequency", "offerPayRate", "offerPayType", "offerPtoDays", "offerSalary", "offerSigningBonus", "offerStartDate", "role", "salaryMax", "salaryMin", "status", "type", "updatedAt", "url" FROM "JobApplication";
DROP TABLE "JobApplication";
ALTER TABLE "new_JobApplication" RENAME TO "JobApplication";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
