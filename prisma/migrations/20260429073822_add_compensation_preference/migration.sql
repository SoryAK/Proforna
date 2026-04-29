-- CreateTable
CREATE TABLE "public"."CompensationPreference" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "period" TEXT NOT NULL DEFAULT 'annual',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "salaryMin" INTEGER,
    "salaryTarget" INTEGER,
    "salaryMax" INTEGER,
    "hardFloor" INTEGER,
    "employmentTypes" TEXT,
    "openToRelocation" BOOLEAN NOT NULL DEFAULT false,
    "openToEquity" BOOLEAN NOT NULL DEFAULT false,
    "openToBonus" BOOLEAN NOT NULL DEFAULT true,
    "openToSignOn" BOOLEAN NOT NULL DEFAULT false,
    "remotePreference" TEXT NOT NULL DEFAULT 'any',
    "benefitsMustHaves" TEXT,
    "notes" TEXT,
    "visibility" TEXT NOT NULL DEFAULT 'public',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompensationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CompensationPreference_profileId_key" ON "public"."CompensationPreference"("profileId");

-- AddForeignKey
ALTER TABLE "public"."CompensationPreference" ADD CONSTRAINT "CompensationPreference_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "public"."UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
