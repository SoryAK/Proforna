-- CreateTable
CREATE TABLE "RecruiterFlag" (
    "id" TEXT NOT NULL,
    "companyNorm" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruiterFlag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AddressOverride" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "landmarkName" TEXT,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AddressOverride_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecruiterFlag_companyNorm_idx" ON "RecruiterFlag"("companyNorm");

-- CreateIndex
CREATE UNIQUE INDEX "RecruiterFlag_companyNorm_userId_key" ON "RecruiterFlag"("companyNorm", "userId");

-- CreateIndex
CREATE INDEX "AddressOverride_userId_idx" ON "AddressOverride"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "AddressOverride_userId_jobKey_key" ON "AddressOverride"("userId", "jobKey");

-- AddForeignKey
ALTER TABLE "RecruiterFlag" ADD CONSTRAINT "RecruiterFlag_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AddressOverride" ADD CONSTRAINT "AddressOverride_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
