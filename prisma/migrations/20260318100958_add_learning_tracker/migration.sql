-- CreateTable
CREATE TABLE "LearningItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "provider" TEXT,
    "type" TEXT NOT NULL DEFAULT 'course',
    "status" TEXT NOT NULL DEFAULT 'not_started',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "url" TEXT,
    "hoursSpent" REAL NOT NULL DEFAULT 0,
    "cost" REAL NOT NULL DEFAULT 0,
    "completedAt" DATETIME,
    "skills" TEXT,
    "notes" TEXT,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
