/*
  Warnings:

  - Made the column `artifactId` on table `SkillEvidence` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "SkillEvidence" ALTER COLUMN "artifactId" SET NOT NULL;

-- AlterTable
ALTER TABLE "UserProfile" ADD COLUMN     "industryGroup" TEXT;
