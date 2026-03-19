-- AlterTable
ALTER TABLE "CurrentPosition" ADD COLUMN "ein" TEXT;

-- AlterTable
ALTER TABLE "JobApplication" ADD COLUMN "ein" TEXT;

-- CreateTable
CREATE TABLE "CompanyProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ein" TEXT NOT NULL,
    "name" TEXT,
    "address" TEXT,
    "state" TEXT,
    "industry" TEXT,
    "naicsCode" TEXT,
    "website" TEXT,
    "employeeCount" INTEGER,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "secCIK" TEXT,
    "form5500Data" TEXT,
    "oshaData" TEXT,
    "secData" TEXT,
    "sosData" TEXT,
    "lastFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "CompanyProfile_ein_key" ON "CompanyProfile"("ein");
