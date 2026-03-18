-- CreateTable
CREATE TABLE "InteractiveResume" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "targetRole" TEXT,
    "summary" TEXT,
    "theme" TEXT NOT NULL DEFAULT 'modern',
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "sections" TEXT,
    "customContent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ResumeView" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "resumeId" TEXT NOT NULL,
    "referrer" TEXT,
    "userAgent" TEXT,
    "sectionsViewed" TEXT,
    "durationSeconds" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ResumeView_resumeId_fkey" FOREIGN KEY ("resumeId") REFERENCES "InteractiveResume" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "InteractiveResume_slug_key" ON "InteractiveResume"("slug");
