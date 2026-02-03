-- AlterTable
ALTER TABLE "Place" ADD COLUMN     "emails" TEXT[],
ADD COLUMN     "phones" TEXT[],
ADD COLUMN     "scrapeStatus" TEXT NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "socials" JSONB;
