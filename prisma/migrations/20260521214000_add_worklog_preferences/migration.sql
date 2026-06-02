-- Per-user defaults for new worklog entries

CREATE TABLE "WorkLogPreference" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "defaultPositionId" TEXT,
  "defaultShiftId" TEXT,
  "defaultCategory" TEXT NOT NULL DEFAULT 'task',
  "defaultMood" TEXT,
  "defaultHours" DOUBLE PRECISION,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkLogPreference_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkLogPreference_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkLogPreference_defaultPositionId_fkey" FOREIGN KEY ("defaultPositionId") REFERENCES "WorkHistory"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "WorkLogPreference_defaultShiftId_fkey" FOREIGN KEY ("defaultShiftId") REFERENCES "WorkHistoryShift"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "WorkLogPreference_userId_key" ON "WorkLogPreference"("userId");
CREATE INDEX "WorkLogPreference_defaultPositionId_idx" ON "WorkLogPreference"("defaultPositionId");
CREATE INDEX "WorkLogPreference_defaultShiftId_idx" ON "WorkLogPreference"("defaultShiftId");
