-- AlterTable
ALTER TABLE "WorkHistory" ADD COLUMN "osmWayIds" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
                          ADD COLUMN "footprintCustom" JSONB;
