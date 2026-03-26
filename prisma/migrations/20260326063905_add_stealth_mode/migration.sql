-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "anonymousTitle" TEXT,
ADD COLUMN     "blockedDomains" TEXT,
ADD COLUMN     "blockedEins" TEXT,
ADD COLUMN     "hideCurrentEmployer" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "visibility" TEXT NOT NULL DEFAULT 'public';

-- CreateTable
CREATE TABLE "AccessRequest" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "requesterName" TEXT NOT NULL,
    "requesterEmail" TEXT NOT NULL,
    "requesterCompany" TEXT,
    "requesterLinkedin" TEXT,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "approvedAt" TIMESTAMP(3),
    "accessToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SingleUseLink" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "viewedAt" TIMESTAMP(3),
    "viewedBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SingleUseLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AccessRequest_accessToken_key" ON "AccessRequest"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "SingleUseLink_token_key" ON "SingleUseLink"("token");

-- AddForeignKey
ALTER TABLE "AccessRequest" ADD CONSTRAINT "AccessRequest_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SingleUseLink" ADD CONSTRAINT "SingleUseLink_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "UserProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
