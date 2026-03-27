-- DropForeignKey
ALTER TABLE "JobPosting" DROP CONSTRAINT "JobPosting_userId_fkey";

-- AlterTable
ALTER TABLE "JobPosting" ALTER COLUMN "userId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "JobPosting" ADD CONSTRAINT "JobPosting_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
