-- Add DocumentFolder model + Document.folderId
-- Postgres NULL-distinct gotcha: the composite unique (userId, parentId, name) does NOT prevent
-- duplicate root-level folder names because parentId IS NULL. We add a partial unique index for
-- root folders explicitly.

-- AlterTable: link documents to folders (nullable; SET NULL on folder delete is enforced via FK)
ALTER TABLE "Document" ADD COLUMN "folderId" TEXT;

-- CreateTable
CREATE TABLE "DocumentFolder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DocumentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentFolder_userId_parentId_idx" ON "DocumentFolder"("userId", "parentId");

-- CreateIndex (catches sibling collisions where parentId IS NOT NULL)
CREATE UNIQUE INDEX "DocumentFolder_userId_parentId_name_key" ON "DocumentFolder"("userId", "parentId", "name");

-- Partial unique: catches sibling collisions at the root (parentId IS NULL)
CREATE UNIQUE INDEX "DocumentFolder_userId_name_root_key"
    ON "DocumentFolder"("userId", "name")
    WHERE "parentId" IS NULL;

-- CreateIndex
CREATE INDEX "Document_userId_folderId_idx" ON "Document"("userId", "folderId");

-- AddForeignKey
ALTER TABLE "Document"
    ADD CONSTRAINT "Document_folderId_fkey"
    FOREIGN KEY ("folderId") REFERENCES "DocumentFolder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFolder"
    ADD CONSTRAINT "DocumentFolder_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey: deleting a folder cascades to its descendant folders.
-- Documents inside cascaded folders get folderId=NULL via Document_folderId_fkey ON DELETE SET NULL.
-- App-level logic prevents non-empty folder deletion unless cascade=1 is explicitly passed.
ALTER TABLE "DocumentFolder"
    ADD CONSTRAINT "DocumentFolder_parentId_fkey"
    FOREIGN KEY ("parentId") REFERENCES "DocumentFolder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
