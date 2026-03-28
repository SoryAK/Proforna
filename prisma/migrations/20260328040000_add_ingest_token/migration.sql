-- AlterTable
ALTER TABLE "User" ADD COLUMN "ingestToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "User_ingestToken_key" ON "User"("ingestToken");
