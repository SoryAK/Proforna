-- AlterTable
ALTER TABLE "PersonalEquipment" ADD COLUMN     "tags" TEXT[] DEFAULT ARRAY[]::TEXT[];
