-- CreateTable
CREATE TABLE "SkillDomain" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "socCodes" TEXT,
    "keySkills" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainCombinationDomain" (
    "id" TEXT NOT NULL,
    "combinationId" TEXT NOT NULL,
    "domainId" TEXT NOT NULL,

    CONSTRAINT "DomainCombinationDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DomainCombination" (
    "id" TEXT NOT NULL,
    "roles" TEXT NOT NULL,
    "socCodes" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "level" TEXT NOT NULL DEFAULT 'mid',
    "treeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DomainCombination_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DecompositionTree" (
    "id" TEXT NOT NULL,
    "targetRole" TEXT NOT NULL,
    "targetSocCode" TEXT,
    "userId" TEXT NOT NULL,
    "pathId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DecompositionTree_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TitleSynonymCluster" (
    "id" TEXT NOT NULL,
    "canonicalTitle" TEXT NOT NULL,
    "synonyms" TEXT NOT NULL,
    "socCodes" TEXT,
    "skillOverlap" INTEGER NOT NULL DEFAULT 0,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TitleSynonymCluster_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DomainCombinationDomain_combinationId_domainId_key" ON "DomainCombinationDomain"("combinationId", "domainId");

-- CreateIndex
CREATE INDEX "DecompositionTree_userId_idx" ON "DecompositionTree"("userId");

-- CreateIndex
CREATE INDEX "DecompositionTree_targetRole_idx" ON "DecompositionTree"("targetRole");

-- CreateIndex
CREATE INDEX "TitleSynonymCluster_canonicalTitle_idx" ON "TitleSynonymCluster"("canonicalTitle");

-- CreateIndex
CREATE INDEX "TitleSynonymCluster_userId_idx" ON "TitleSynonymCluster"("userId");

-- AddForeignKey
ALTER TABLE "SkillDomain" ADD CONSTRAINT "SkillDomain_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "SkillDomain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainCombinationDomain" ADD CONSTRAINT "DomainCombinationDomain_combinationId_fkey" FOREIGN KEY ("combinationId") REFERENCES "DomainCombination"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainCombinationDomain" ADD CONSTRAINT "DomainCombinationDomain_domainId_fkey" FOREIGN KEY ("domainId") REFERENCES "SkillDomain"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DomainCombination" ADD CONSTRAINT "DomainCombination_treeId_fkey" FOREIGN KEY ("treeId") REFERENCES "DecompositionTree"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecompositionTree" ADD CONSTRAINT "DecompositionTree_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DecompositionTree" ADD CONSTRAINT "DecompositionTree_pathId_fkey" FOREIGN KEY ("pathId") REFERENCES "CareerPath"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TitleSynonymCluster" ADD CONSTRAINT "TitleSynonymCluster_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
