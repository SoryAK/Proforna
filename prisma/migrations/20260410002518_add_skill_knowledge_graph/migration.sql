-- CreateTable
CREATE TABLE "SkillNode" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'technical',
    "source" TEXT NOT NULL DEFAULT 'user',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SkillNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillEdge" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'peer',
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "source" TEXT NOT NULL DEFAULT 'ai',
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillEdge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SkillEvidence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "skillNodeId" TEXT NOT NULL,
    "artifactType" TEXT NOT NULL,
    "artifactId" TEXT,
    "strength" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "notes" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkillEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SkillNode_userId_idx" ON "SkillNode"("userId");

-- CreateIndex
CREATE INDEX "SkillNode_name_idx" ON "SkillNode"("name");

-- CreateIndex
CREATE UNIQUE INDEX "SkillNode_userId_name_key" ON "SkillNode"("userId", "name");

-- CreateIndex
CREATE INDEX "SkillEdge_fromId_idx" ON "SkillEdge"("fromId");

-- CreateIndex
CREATE INDEX "SkillEdge_toId_idx" ON "SkillEdge"("toId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillEdge_fromId_toId_type_key" ON "SkillEdge"("fromId", "toId", "type");

-- CreateIndex
CREATE INDEX "SkillEvidence_userId_idx" ON "SkillEvidence"("userId");

-- CreateIndex
CREATE INDEX "SkillEvidence_skillNodeId_idx" ON "SkillEvidence"("skillNodeId");

-- CreateIndex
CREATE UNIQUE INDEX "SkillEvidence_skillNodeId_artifactType_artifactId_key" ON "SkillEvidence"("skillNodeId", "artifactType", "artifactId");

-- AddForeignKey
ALTER TABLE "SkillNode" ADD CONSTRAINT "SkillNode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEdge" ADD CONSTRAINT "SkillEdge_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "SkillNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEdge" ADD CONSTRAINT "SkillEdge_toId_fkey" FOREIGN KEY ("toId") REFERENCES "SkillNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEvidence" ADD CONSTRAINT "SkillEvidence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SkillEvidence" ADD CONSTRAINT "SkillEvidence_skillNodeId_fkey" FOREIGN KEY ("skillNodeId") REFERENCES "SkillNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
