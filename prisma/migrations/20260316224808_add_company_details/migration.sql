-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CurrentPosition" (
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
    "companySynopsis" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "address" TEXT,
    "focus" TEXT,
    "schedule" TEXT,
    "payRate" TEXT,
    "payType" TEXT NOT NULL DEFAULT 'salary',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CurrentPosition" ("company", "createdAt", "currency", "department", "description", "endDate", "id", "isActive", "location", "managerName", "responsibilities", "role", "salary", "startDate", "techStack", "type", "updatedAt") SELECT "company", "createdAt", "currency", "department", "description", "endDate", "id", "isActive", "location", "managerName", "responsibilities", "role", "salary", "startDate", "techStack", "type", "updatedAt" FROM "CurrentPosition";
DROP TABLE "CurrentPosition";
ALTER TABLE "new_CurrentPosition" RENAME TO "CurrentPosition";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
