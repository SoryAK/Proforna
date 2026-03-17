-- CreateTable
CREATE TABLE "UserProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "availability" TEXT NOT NULL DEFAULT 'open_to_work',
    "bio" TEXT,
    "preferredRoles" TEXT,
    "targetSalaryMin" INTEGER,
    "targetSalaryMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "locationPreference" TEXT,
    "showSkills" BOOLEAN NOT NULL DEFAULT true,
    "showResume" BOOLEAN NOT NULL DEFAULT true,
    "showCertifications" BOOLEAN NOT NULL DEFAULT true,
    "showCurrentRole" BOOLEAN NOT NULL DEFAULT true,
    "portalSlug" TEXT NOT NULL DEFAULT 'portal',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CurrentPosition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "type" TEXT NOT NULL DEFAULT 'remote',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME,
    "salary" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "description" TEXT,
    "responsibilities" TEXT,
    "techStack" TEXT,
    "managerName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RecruiterSubmission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recruiterName" TEXT NOT NULL,
    "recruiterEmail" TEXT NOT NULL,
    "company" TEXT,
    "linkedinUrl" TEXT,
    "jobTitle" TEXT NOT NULL,
    "jobDescription" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "location" TEXT,
    "jobType" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'new',
    "contactId" TEXT,
    "applicationId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CompensationEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "effectiveDate" DATETIME NOT NULL,
    "recurring" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CompensationEvent_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Benefit" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "provider" TEXT,
    "coverage" TEXT,
    "employerCost" INTEGER,
    "employeeCost" INTEGER,
    "notes" TEXT,
    "enrolledAt" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Benefit_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeOffBalance" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "totalDays" REAL NOT NULL,
    "usedDays" REAL NOT NULL DEFAULT 0,
    "year" INTEGER NOT NULL,
    "accrual" TEXT NOT NULL DEFAULT 'annual',
    "carryOver" REAL NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeOffBalance_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TimeOffEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "balanceId" TEXT NOT NULL,
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "days" REAL NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'approved',
    "reason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeOffEntry_balanceId_fkey" FOREIGN KEY ("balanceId") REFERENCES "TimeOffBalance" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "UserProfile_portalSlug_key" ON "UserProfile"("portalSlug");
