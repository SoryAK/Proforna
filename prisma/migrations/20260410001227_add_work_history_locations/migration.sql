-- CreateTable
CREATE TABLE "WorkHistoryLocation" (
    "id" TEXT NOT NULL,
    "workHistoryId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'daily-workplace',
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkHistoryLocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WorkHistoryLocation_workHistoryId_idx" ON "WorkHistoryLocation"("workHistoryId");

-- AddForeignKey
ALTER TABLE "WorkHistoryLocation" ADD CONSTRAINT "WorkHistoryLocation_workHistoryId_fkey" FOREIGN KEY ("workHistoryId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
