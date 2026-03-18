-- CreateTable
CREATE TABLE "ResearchFeed" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'general',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ResearchArticle" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "feedId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "source" TEXT,
    "summary" TEXT,
    "publishedAt" DATETIME,
    "imageUrl" TEXT,
    "isBookmarked" BOOLEAN NOT NULL DEFAULT false,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResearchArticle_feedId_fkey" FOREIGN KEY ("feedId") REFERENCES "ResearchFeed" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MarketSearch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seriesId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "occupation" TEXT,
    "area" TEXT,
    "dataType" TEXT NOT NULL DEFAULT 'wages',
    "lastData" TEXT,
    "lastFetchedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ResearchFeed_url_key" ON "ResearchFeed"("url");
