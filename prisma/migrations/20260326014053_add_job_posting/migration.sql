-- CreateTable
CREATE TABLE "JobPosting" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "companyLogo" TEXT,
    "role" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "type" TEXT NOT NULL DEFAULT 'remote',
    "employmentType" TEXT NOT NULL DEFAULT 'full_time',
    "experienceLevel" TEXT NOT NULL DEFAULT 'mid',
    "salaryMin" INTEGER,
    "salaryMax" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "payFrequency" TEXT NOT NULL DEFAULT 'yearly',
    "description" TEXT NOT NULL,
    "requirements" TEXT,
    "niceToHave" TEXT,
    "benefits" TEXT,
    "techStack" TEXT,
    "applicationUrl" TEXT,
    "contactEmail" TEXT,
    "ein" TEXT,
    "isPublished" BOOLEAN NOT NULL DEFAULT false,
    "isFeatured" BOOLEAN NOT NULL DEFAULT false,
    "expiresAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "applicationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobPosting_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "JobPosting_slug_key" ON "JobPosting"("slug");

-- CreateIndex
CREATE INDEX "JobPosting_isPublished_createdAt_idx" ON "JobPosting"("isPublished", "createdAt");

-- CreateIndex
CREATE INDEX "JobPosting_company_idx" ON "JobPosting"("company");

-- CreateIndex
CREATE INDEX "JobPosting_type_experienceLevel_idx" ON "JobPosting"("type", "experienceLevel");

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
