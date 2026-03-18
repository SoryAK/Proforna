-- CreateTable
CREATE TABLE "EquipmentResource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "equipmentId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'manual',
    "title" TEXT NOT NULL,
    "content" TEXT,
    "fileName" TEXT,
    "fileData" BLOB,
    "fileMime" TEXT,
    "url" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "EquipmentResource_equipmentId_fkey" FOREIGN KEY ("equipmentId") REFERENCES "Equipment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
