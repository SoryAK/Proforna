-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "daysInOffice" INTEGER,
ADD COLUMN     "gasPricePerGallon" DOUBLE PRECISION,
ADD COLUMN     "homeAddress" TEXT,
ADD COLUMN     "homeLat" DOUBLE PRECISION,
ADD COLUMN     "homeLng" DOUBLE PRECISION,
ADD COLUMN     "vehicleId" TEXT,
ADD COLUMN     "vehicleMake" TEXT,
ADD COLUMN     "vehicleModel" TEXT,
ADD COLUMN     "vehicleMpg" DOUBLE PRECISION,
ADD COLUMN     "vehicleYear" TEXT;
