-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserProfile" (
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
    "filingStatus" TEXT NOT NULL DEFAULT 'single',
    "federalTaxRate" REAL,
    "stateTaxRate" REAL,
    "monthlyExpenses" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_UserProfile" ("availability", "bio", "createdAt", "currency", "id", "locationPreference", "portalSlug", "preferredRoles", "showCertifications", "showCurrentRole", "showResume", "showSkills", "targetSalaryMax", "targetSalaryMin", "updatedAt") SELECT "availability", "bio", "createdAt", "currency", "id", "locationPreference", "portalSlug", "preferredRoles", "showCertifications", "showCurrentRole", "showResume", "showSkills", "targetSalaryMax", "targetSalaryMin", "updatedAt" FROM "UserProfile";
DROP TABLE "UserProfile";
ALTER TABLE "new_UserProfile" RENAME TO "UserProfile";
CREATE UNIQUE INDEX "UserProfile_portalSlug_key" ON "UserProfile"("portalSlug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
