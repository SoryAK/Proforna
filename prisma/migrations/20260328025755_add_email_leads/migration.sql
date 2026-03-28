-- CreateTable
CREATE TABLE "EmailLead" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lng" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "salaryMin" DOUBLE PRECISION,
    "salaryMax" DOUBLE PRECISION,
    "applyUrl" TEXT,
    "source" TEXT NOT NULL,
    "emailDate" TIMESTAMP(3),
    "description" TEXT NOT NULL DEFAULT '',
    "dedupeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLead_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EmailLead_userId_expiresAt_idx" ON "EmailLead"("userId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "EmailLead_userId_dedupeHash_key" ON "EmailLead"("userId", "dedupeHash");

-- AddForeignKey
ALTER TABLE "EmailLead" ADD CONSTRAINT "EmailLead_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
