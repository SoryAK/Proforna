-- User-defined folder hierarchy for WorkLog notes.
-- Adjacency-list tree (parentId self-relation) per user. Folders coexist with
-- the existing `WorkLog.category` field — categories remain a cross-cutting
-- "kind" tag, while folders provide free-form hierarchical organization.

CREATE TABLE "WorkLogFolder" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "parentId" TEXT,
  "color" TEXT,
  "icon" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "WorkLogFolder_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WorkLogFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WorkLogFolder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "WorkLogFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "WorkLogFolder_userId_parentId_idx" ON "WorkLogFolder"("userId", "parentId");
CREATE INDEX "WorkLogFolder_userId_sortOrder_idx" ON "WorkLogFolder"("userId", "sortOrder");

-- Add nullable folderId on WorkLog. Existing notes default to NULL (Unfiled).
ALTER TABLE "WorkLog" ADD COLUMN "folderId" TEXT;

ALTER TABLE "WorkLog"
  ADD CONSTRAINT "WorkLog_folderId_fkey"
  FOREIGN KEY ("folderId") REFERENCES "WorkLogFolder"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "WorkLog_userId_folderId_idx" ON "WorkLog"("userId", "folderId");
