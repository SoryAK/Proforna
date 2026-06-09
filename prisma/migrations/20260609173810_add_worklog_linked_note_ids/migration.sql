-- AlterTable
ALTER TABLE "WorkLog" ADD COLUMN     "linkedNoteIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateIndex
CREATE INDEX "WorkLog_linkedNoteIds_idx" ON "WorkLog" USING GIN ("linkedNoteIds");
