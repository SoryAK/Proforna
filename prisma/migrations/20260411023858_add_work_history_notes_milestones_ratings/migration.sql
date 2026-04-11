-- AlterTable
ALTER TABLE "WorkHistoryLocation" ADD COLUMN     "skills" TEXT;

-- CreateTable
CREATE TABLE "WorkHistoryNote" (
    "id" TEXT NOT NULL,
    "workHistoryId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkHistoryNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkHistoryMilestone" (
    "id" TEXT NOT NULL,
    "workHistoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'achievement',
    "date" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkHistoryMilestone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkplaceRating" (
    "id" TEXT NOT NULL,
    "workHistoryId" TEXT NOT NULL,
    "culture" INTEGER NOT NULL DEFAULT 0,
    "growth" INTEGER NOT NULL DEFAULT 0,
    "compensation" INTEGER NOT NULL DEFAULT 0,
    "workLifeBalance" INTEGER NOT NULL DEFAULT 0,
    "management" INTEGER NOT NULL DEFAULT 0,
    "overall" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkplaceRating_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkHistoryNote_workHistoryId_idx" ON "WorkHistoryNote"("workHistoryId");

-- CreateIndex
CREATE INDEX "WorkHistoryMilestone_workHistoryId_idx" ON "WorkHistoryMilestone"("workHistoryId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkplaceRating_workHistoryId_key" ON "WorkplaceRating"("workHistoryId");

-- AddForeignKey
ALTER TABLE "WorkHistoryNote" ADD CONSTRAINT "WorkHistoryNote_workHistoryId_fkey" FOREIGN KEY ("workHistoryId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkHistoryMilestone" ADD CONSTRAINT "WorkHistoryMilestone_workHistoryId_fkey" FOREIGN KEY ("workHistoryId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkplaceRating" ADD CONSTRAINT "WorkplaceRating_workHistoryId_fkey" FOREIGN KEY ("workHistoryId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
