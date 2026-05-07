-- CreateTable
CREATE TABLE "PersonalEquipmentShare" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "label" TEXT,
    "scope" TEXT NOT NULL DEFAULT 'all',
    "itemIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "expiresAt" TIMESTAMP(3),
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalEquipmentShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PersonalEquipmentShare_token_key" ON "PersonalEquipmentShare"("token");

-- CreateIndex
CREATE INDEX "PersonalEquipmentShare_userId_idx" ON "PersonalEquipmentShare"("userId");

-- AddForeignKey
ALTER TABLE "PersonalEquipmentShare" ADD CONSTRAINT "PersonalEquipmentShare_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
