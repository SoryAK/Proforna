-- AlterTable
ALTER TABLE "PersonalEquipmentShare" ADD COLUMN     "kitId" TEXT;

-- CreateTable
CREATE TABLE "EquipmentKit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "color" TEXT,
    "icon" TEXT,
    "isPrivate" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EquipmentKit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EquipmentKitItem" (
    "id" TEXT NOT NULL,
    "kitId" TEXT NOT NULL,
    "equipmentId" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EquipmentKitItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EquipmentKit_userId_idx" ON "EquipmentKit"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentKit_userId_name_key" ON "EquipmentKit"("userId", "name");

-- CreateIndex
CREATE INDEX "EquipmentKitItem_kitId_idx" ON "EquipmentKitItem"("kitId");

-- CreateIndex
CREATE INDEX "EquipmentKitItem_equipmentId_idx" ON "EquipmentKitItem"("equipmentId");

-- CreateIndex
CREATE UNIQUE INDEX "EquipmentKitItem_kitId_equipmentId_key" ON "EquipmentKitItem"("kitId", "equipmentId");

-- AddForeignKey
ALTER TABLE "EquipmentKit" ADD CONSTRAINT "EquipmentKit_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentKitItem" ADD CONSTRAINT "EquipmentKitItem_kitId_fkey" FOREIGN KEY ("kitId") REFERENCES "EquipmentKit"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EquipmentKitItem" ADD CONSTRAINT "EquipmentKitItem_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "PersonalEquipment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
