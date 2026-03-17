-- CreateTable
CREATE TABLE "CareerIncomeEntry" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "yearId" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "grossIncome" REAL NOT NULL,
    "netIncome" REAL,
    "ein" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CareerIncomeEntry_yearId_fkey" FOREIGN KEY ("yearId") REFERENCES "CareerIncomeYear" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
