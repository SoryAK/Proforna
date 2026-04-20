-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'other',
    "fileName" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "WorkHistory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
