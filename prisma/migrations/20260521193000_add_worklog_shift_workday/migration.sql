-- Worklog shift templates + shift-aware workday tracking

ALTER TABLE "WorkLog" ADD COLUMN "shiftId" TEXT;
ALTER TABLE "WorkLog" ADD COLUMN "workdayDate" TIMESTAMP(3);

CREATE TABLE "WorkHistoryShift" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "workHistoryId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "startMinute" INTEGER NOT NULL,
  "endMinute" INTEGER NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "WorkHistoryShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkHistoryShift_workHistoryId_fkey" FOREIGN KEY ("workHistoryId") REFERENCES "WorkHistory" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

ALTER TABLE "WorkLog"
  ADD CONSTRAINT "WorkLog_shiftId_fkey"
  FOREIGN KEY ("shiftId") REFERENCES "WorkHistoryShift"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkLog_userId_workdayDate_idx" ON "WorkLog"("userId", "workdayDate");
CREATE INDEX "WorkLog_positionId_shiftId_idx" ON "WorkLog"("positionId", "shiftId");
CREATE INDEX "WorkLog_shiftId_idx" ON "WorkLog"("shiftId");
CREATE INDEX "WorkHistoryShift_userId_workHistoryId_idx" ON "WorkHistoryShift"("userId", "workHistoryId");
CREATE INDEX "WorkHistoryShift_workHistoryId_isActive_idx" ON "WorkHistoryShift"("workHistoryId", "isActive");
