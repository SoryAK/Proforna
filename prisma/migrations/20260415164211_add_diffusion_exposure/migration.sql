-- CreateTable
CREATE TABLE "DiffusionExposure" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workHistoryId" TEXT NOT NULL,
    "skillNodeId" TEXT NOT NULL,
    "zone" TEXT NOT NULL,
    "intensity" DOUBLE PRECISION NOT NULL,
    "category" TEXT NOT NULL,
    "exposureType" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DiffusionExposure_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DiffusionExposure_userId_idx" ON "DiffusionExposure"("userId");

-- CreateIndex
CREATE INDEX "DiffusionExposure_workHistoryId_idx" ON "DiffusionExposure"("workHistoryId");

-- CreateIndex
CREATE INDEX "DiffusionExposure_skillNodeId_idx" ON "DiffusionExposure"("skillNodeId");

-- CreateIndex
CREATE INDEX "DiffusionExposure_zone_idx" ON "DiffusionExposure"("zone");

-- CreateIndex
CREATE UNIQUE INDEX "DiffusionExposure_workHistoryId_skillNodeId_key" ON "DiffusionExposure"("workHistoryId", "skillNodeId");

-- AddForeignKey
ALTER TABLE "DiffusionExposure" ADD CONSTRAINT "DiffusionExposure_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiffusionExposure" ADD CONSTRAINT "DiffusionExposure_workHistoryId_fkey" FOREIGN KEY ("workHistoryId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiffusionExposure" ADD CONSTRAINT "DiffusionExposure_skillNodeId_fkey" FOREIGN KEY ("skillNodeId") REFERENCES "SkillNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
