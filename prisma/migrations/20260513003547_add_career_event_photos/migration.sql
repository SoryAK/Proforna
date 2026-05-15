-- CreateTable
CREATE TABLE "CareerEventPhoto" (
    "id" TEXT NOT NULL,
    "careerEventId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "focalX" INTEGER NOT NULL DEFAULT 50,
    "focalY" INTEGER NOT NULL DEFAULT 50,
    "zoom" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "rotation" INTEGER NOT NULL DEFAULT 0,
    "flipH" BOOLEAN NOT NULL DEFAULT false,
    "flipV" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CareerEventPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CareerEventPhoto_careerEventId_idx" ON "CareerEventPhoto"("careerEventId");

-- AddForeignKey
ALTER TABLE "CareerEventPhoto" ADD CONSTRAINT "CareerEventPhoto_careerEventId_fkey" FOREIGN KEY ("careerEventId") REFERENCES "CareerEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
