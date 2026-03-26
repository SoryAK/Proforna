-- CreateTable
CREATE TABLE "InterestGroup" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InterestGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InterestGroupItem" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT,
    "url" TEXT,
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "source" TEXT NOT NULL,
    "description" TEXT,
    "thumbnail" TEXT,
    "scheduleType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InterestGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InterestGroup_userId_name_key" ON "InterestGroup"("userId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "InterestGroupItem_groupId_jobKey_key" ON "InterestGroupItem"("groupId", "jobKey");

-- AddForeignKey
ALTER TABLE "InterestGroup" ADD CONSTRAINT "InterestGroup_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestGroupItem" ADD CONSTRAINT "InterestGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "InterestGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InterestGroupItem" ADD CONSTRAINT "InterestGroupItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
