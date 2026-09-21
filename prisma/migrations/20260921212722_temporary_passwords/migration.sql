-- AlterTable
ALTER TABLE "User" ADD COLUMN     "initialPasswordAuthTag" TEXT,
ADD COLUMN     "initialPasswordEncrypted" TEXT,
ADD COLUMN     "initialPasswordIv" TEXT,
ADD COLUMN     "initialPasswordKeyVersion" INTEGER,
ADD COLUMN     "initialPasswordSetAt" TIMESTAMPTZ(6),
ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;
