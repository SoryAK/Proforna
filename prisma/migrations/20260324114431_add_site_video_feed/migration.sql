-- CreateTable
CREATE TABLE "SiteVideoFeed" (
    "id" TEXT NOT NULL,
    "searchQuery" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "videosJson" TEXT NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "staleAfter" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SiteVideoFeed_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SiteVideoFeed_searchQuery_key" ON "SiteVideoFeed"("searchQuery");
