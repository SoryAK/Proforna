-- CreateTable
CREATE TABLE "SiteMarketData" (
    "id" TEXT NOT NULL,
    "occupation" TEXT NOT NULL,
    "socCode" TEXT NOT NULL,
    "region" TEXT NOT NULL DEFAULT 'national',
    "experienceLevel" TEXT NOT NULL DEFAULT 'all',
    "periodLabel" TEXT NOT NULL,
    "median" INTEGER,
    "mean" INTEGER,
    "p10" INTEGER,
    "p25" INTEGER,
    "p75" INTEGER,
    "p90" INTEGER,
    "low" INTEGER,
    "high" INTEGER,
    "rawAnswer" TEXT,
    "sourcesJson" TEXT,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staleAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteMarketData_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SiteMarketData_socCode_region_idx" ON "SiteMarketData"("socCode", "region");

-- CreateIndex
CREATE UNIQUE INDEX "SiteMarketData_socCode_region_experienceLevel_periodLabel_key" ON "SiteMarketData"("socCode", "region", "experienceLevel", "periodLabel");
