-- CreateTable
CREATE TABLE "Occupation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "socCode" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "cluster" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'onet',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Occupation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OccupationSkillRequirement" (
    "id" TEXT NOT NULL,
    "occupationId" TEXT NOT NULL,
    "skillNodeId" TEXT NOT NULL,
    "importance" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "level" DOUBLE PRECISION NOT NULL DEFAULT 3.5,
    "source" TEXT NOT NULL DEFAULT 'onet',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OccupationSkillRequirement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserOccupationInterest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "occupationId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'exploring',
    "fitScore" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserOccupationInterest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Occupation_userId_idx" ON "Occupation"("userId");

-- CreateIndex
CREATE INDEX "Occupation_cluster_idx" ON "Occupation"("cluster");

-- CreateIndex
CREATE UNIQUE INDEX "Occupation_userId_socCode_key" ON "Occupation"("userId", "socCode");

-- CreateIndex
CREATE INDEX "OccupationSkillRequirement_occupationId_idx" ON "OccupationSkillRequirement"("occupationId");

-- CreateIndex
CREATE INDEX "OccupationSkillRequirement_skillNodeId_idx" ON "OccupationSkillRequirement"("skillNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "OccupationSkillRequirement_occupationId_skillNodeId_key" ON "OccupationSkillRequirement"("occupationId", "skillNodeId");

-- CreateIndex
CREATE INDEX "UserOccupationInterest_userId_idx" ON "UserOccupationInterest"("userId");

-- CreateIndex
CREATE INDEX "UserOccupationInterest_occupationId_idx" ON "UserOccupationInterest"("occupationId");

-- CreateIndex
CREATE UNIQUE INDEX "UserOccupationInterest_userId_occupationId_key" ON "UserOccupationInterest"("userId", "occupationId");

-- AddForeignKey
ALTER TABLE "Occupation" ADD CONSTRAINT "Occupation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupationSkillRequirement" ADD CONSTRAINT "OccupationSkillRequirement_occupationId_fkey" FOREIGN KEY ("occupationId") REFERENCES "Occupation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OccupationSkillRequirement" ADD CONSTRAINT "OccupationSkillRequirement_skillNodeId_fkey" FOREIGN KEY ("skillNodeId") REFERENCES "SkillNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOccupationInterest" ADD CONSTRAINT "UserOccupationInterest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserOccupationInterest" ADD CONSTRAINT "UserOccupationInterest_occupationId_fkey" FOREIGN KEY ("occupationId") REFERENCES "Occupation"("id") ON DELETE CASCADE ON UPDATE CASCADE;
