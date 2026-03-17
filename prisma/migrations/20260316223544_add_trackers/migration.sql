/*
  Warnings:

  - You are about to drop the column `updatedAt` on the `Benefit` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `CompensationEvent` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TimeOffBalance` table. All the data in the column will be lost.
  - You are about to drop the column `updatedAt` on the `TimeOffEntry` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Benefit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'health',
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "coverage" TEXT,
    "employerCost" INTEGER,
    "employeeCost" INTEGER,
    "notes" TEXT,
    "enrolledAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Benefit_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Benefit" ("category", "coverage", "createdAt", "employeeCost", "employerCost", "enrolledAt", "expiresAt", "id", "name", "notes", "positionId", "provider") SELECT "category", "coverage", "createdAt", "employeeCost", "employerCost", "enrolledAt", "expiresAt", "id", "name", "notes", "positionId", "provider" FROM "Benefit";
DROP TABLE "Benefit";
ALTER TABLE "new_Benefit" RENAME TO "Benefit";
CREATE TABLE "new_CompensationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'base_salary',
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveDate" DATETIME NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CompensationEvent_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CompensationEvent" ("amount", "createdAt", "currency", "effectiveDate", "id", "notes", "positionId", "recurring", "title", "type") SELECT "amount", "createdAt", "currency", "effectiveDate", "id", "notes", "positionId", "recurring", "title", "type" FROM "CompensationEvent";
DROP TABLE "CompensationEvent";
ALTER TABLE "new_CompensationEvent" RENAME TO "CompensationEvent";
CREATE TABLE "new_TimeOffBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'pto',
    "totalDays" REAL NOT NULL DEFAULT 0,
    "usedDays" REAL NOT NULL DEFAULT 0,
    "year" INTEGER NOT NULL,
    "accrual" TEXT NOT NULL DEFAULT 'annual',
    "carryOver" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeOffBalance_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimeOffBalance" ("accrual", "carryOver", "category", "createdAt", "id", "notes", "positionId", "totalDays", "usedDays", "year") SELECT "accrual", "carryOver", "category", "createdAt", "id", "notes", "positionId", "totalDays", "usedDays", "year" FROM "TimeOffBalance";
DROP TABLE "TimeOffBalance";
ALTER TABLE "new_TimeOffBalance" RENAME TO "TimeOffBalance";
CREATE TABLE "new_TimeOffEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "balanceId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "days" REAL NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL DEFAULT 'planned',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeOffEntry_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "TimeOffBalance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_TimeOffEntry" ("balanceId", "createdAt", "days", "endDate", "id", "reason", "startDate", "status") SELECT "balanceId", "createdAt", "days", "endDate", "id", "reason", "startDate", "status" FROM "TimeOffEntry";
DROP TABLE "TimeOffEntry";
ALTER TABLE "new_TimeOffEntry" RENAME TO "TimeOffEntry";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
