-- AlterTable
ALTER TABLE "WorkHistory" ADD COLUMN     "linkedPositionId" TEXT;

-- AddForeignKey
ALTER TABLE "WorkHistory" ADD CONSTRAINT "WorkHistory_linkedPositionId_fkey" FOREIGN KEY ("linkedPositionId") REFERENCES "CurrentPosition"("id") ON DELETE SET NULL ON UPDATE CASCADE;
