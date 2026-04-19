-- CreateTable
CREATE TABLE "CareerEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workHistoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT NOT NULL DEFAULT 'project',
    "startDate" TEXT,
    "endDate" TEXT,
    "metrics" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CareerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CareerEventSkill" (
    "id" TEXT NOT NULL,
    "careerEventId" TEXT NOT NULL,
    "skillNodeId" TEXT NOT NULL,

    CONSTRAINT "CareerEventSkill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareerEvent_userId_idx" ON "CareerEvent"("userId");

-- CreateIndex
CREATE INDEX "CareerEvent_workHistoryId_idx" ON "CareerEvent"("workHistoryId");

-- CreateIndex
CREATE INDEX "CareerEventSkill_careerEventId_idx" ON "CareerEventSkill"("careerEventId");

-- CreateIndex
CREATE INDEX "CareerEventSkill_skillNodeId_idx" ON "CareerEventSkill"("skillNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "CareerEventSkill_careerEventId_skillNodeId_key" ON "CareerEventSkill"("careerEventId", "skillNodeId");

-- AddForeignKey
ALTER TABLE "CareerEvent" ADD CONSTRAINT "CareerEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerEvent" ADD CONSTRAINT "CareerEvent_workHistoryId_fkey" FOREIGN KEY ("workHistoryId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerEventSkill" ADD CONSTRAINT "CareerEventSkill_careerEventId_fkey" FOREIGN KEY ("careerEventId") REFERENCES "CareerEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CareerEventSkill" ADD CONSTRAINT "CareerEventSkill_skillNodeId_fkey" FOREIGN KEY ("skillNodeId") REFERENCES "SkillNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
