-- CreateTable
CREATE TABLE "PersonalEquipment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'tool',
    "ownership" TEXT NOT NULL DEFAULT 'personal',
    "manufacturer" TEXT,
    "model" TEXT,
    "serialNumber" TEXT,
    "condition" TEXT NOT NULL DEFAULT 'good',
    "proficiency" INTEGER,
    "purchaseDate" TIMESTAMP(3),
    "purchasePrice" DOUBLE PRECISION,
    "currentValue" DOUBLE PRECISION,
    "location" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PersonalEquipment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonalEquipmentPhoto" (
    "id" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileMime" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "caption" TEXT,
    "isCover" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonalEquipmentPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PersonalEquipment_userId_idx" ON "PersonalEquipment"("userId");

-- CreateIndex
CREATE INDEX "PersonalEquipmentPhoto_equipmentId_idx" ON "PersonalEquipmentPhoto"("equipmentId");

-- AddForeignKey
ALTER TABLE "PersonalEquipment" ADD CONSTRAINT "PersonalEquipment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonalEquipmentPhoto" ADD CONSTRAINT "PersonalEquipmentPhoto_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "PersonalEquipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
