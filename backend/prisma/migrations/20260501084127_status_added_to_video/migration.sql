-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "errorMsg" TEXT,
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'DONE';
