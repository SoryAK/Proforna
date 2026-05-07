-- Add rotation + flip transforms to PersonalEquipmentPhoto
ALTER TABLE "PersonalEquipmentPhoto" ADD COLUMN "rotation" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PersonalEquipmentPhoto" ADD COLUMN "flipH" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PersonalEquipmentPhoto" ADD COLUMN "flipV" BOOLEAN NOT NULL DEFAULT false;
