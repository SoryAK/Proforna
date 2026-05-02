-- CreateTable
CREATE TABLE "PublishedProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "profileSnapshot" JSONB NOT NULL,
    "compensationSnapshot" JSONB,
    "workHistorySnapshot" JSONB,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishNote" TEXT,

    CONSTRAINT "PublishedProfile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublishedProfile_userId_key" ON "PublishedProfile"("userId");

-- AddForeignKey
ALTER TABLE "PublishedProfile" ADD CONSTRAINT "PublishedProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
