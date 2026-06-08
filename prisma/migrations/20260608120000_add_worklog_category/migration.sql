-- CreateTable
CREATE TABLE "WorkLogCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkLogCategory_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkLogCategory_userId_name_key" ON "WorkLogCategory"("userId", "name");

-- CreateIndex
CREATE INDEX "WorkLogCategory_userId_sortOrder_idx" ON "WorkLogCategory"("userId", "sortOrder");

-- AddForeignKey
ALTER TABLE "WorkLogCategory" ADD CONSTRAINT "WorkLogCategory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
