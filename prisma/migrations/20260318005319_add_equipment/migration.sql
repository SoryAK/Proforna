-- CreateTable
CREATE TABLE "Equipment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "positionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'hardware',
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "assetTag" TEXT,
    "assignedDate" DATETIME,
    "returnedDate" DATETIME,
    "condition" TEXT NOT NULL DEFAULT 'good',
    "licenseKey" TEXT,
    "version" TEXT,
    "expiresAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Equipment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "CurrentPosition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
