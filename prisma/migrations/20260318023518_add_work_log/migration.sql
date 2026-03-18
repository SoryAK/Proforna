-- CreateTable
CREATE TABLE "WorkLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "date" DATETIME NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT,
    "category" TEXT NOT NULL DEFAULT 'task',
    "hours" REAL,
    "tags" TEXT,
    "accomplishment" BOOLEAN NOT NULL DEFAULT false,
    "impact" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkLog_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
