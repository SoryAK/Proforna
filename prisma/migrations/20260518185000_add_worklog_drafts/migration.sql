-- CreateTable
CREATE TABLE "WorkLogDraft" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workLogId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "valueJson" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkLogDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkLogDraft_userId_workLogId_field_key" ON "WorkLogDraft"("userId", "workLogId", "field");

-- CreateIndex
CREATE INDEX "WorkLogDraft_userId_workLogId_idx" ON "WorkLogDraft"("userId", "workLogId");

-- CreateIndex
CREATE INDEX "WorkLogDraft_expiresAt_idx" ON "WorkLogDraft"("expiresAt");

-- AddForeignKey
ALTER TABLE "WorkLogDraft" ADD CONSTRAINT "WorkLogDraft_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkLogDraft" ADD CONSTRAINT "WorkLogDraft_workLogId_fkey" FOREIGN KEY ("workLogId") REFERENCES "WorkLog"("id") ON DELETE CASCADE ON UPDATE CASCADE;
