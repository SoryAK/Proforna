-- CreateTable
CREATE TABLE "CareerPath" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "targetRole" TEXT,
    "targetSalaryMin" INTEGER,
    "targetSalaryMax" INTEGER,
    "industry" TEXT,
    "level" TEXT NOT NULL DEFAULT 'mid',
    "requiredSkills" TEXT,
    "timelineYears" INTEGER,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CareerPathMilestone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pathId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "CareerPathMilestone_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "CareerPath" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CareerSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "totalSkills" INTEGER NOT NULL DEFAULT 0,
    "avgProficiency" REAL NOT NULL DEFAULT 0,
    "incomeGross" REAL,
    "incomeNet" REAL,
    "activeGoals" INTEGER NOT NULL DEFAULT 0,
    "completedGoals" INTEGER NOT NULL DEFAULT 0,
    "certCount" INTEGER NOT NULL DEFAULT 0,
    "applicationsOpen" INTEGER NOT NULL DEFAULT 0,
    "interviewsCount" INTEGER NOT NULL DEFAULT 0,
    "currentRole" TEXT,
    "currentCompany" TEXT,
    "overallScore" REAL,
    "metadata" TEXT
);

-- CreateTable
CREATE TABLE "DirectionScore" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "snapshotId" TEXT NOT NULL,
    "pathId" TEXT NOT NULL,
    "skillMatch" REAL NOT NULL DEFAULT 0,
    "incomeAlignment" REAL NOT NULL DEFAULT 0,
    "goalAlignment" REAL NOT NULL DEFAULT 0,
    "overallScore" REAL NOT NULL DEFAULT 0,
    "gaps" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DirectionScore_snapshotId_fkey" FOREIGN KEY ("snapshotId") REFERENCES "CareerSnapshot" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "DirectionScore_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "CareerPath" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "DirectionScore_snapshotId_pathId_key" ON "DirectionScore"("snapshotId", "pathId");
