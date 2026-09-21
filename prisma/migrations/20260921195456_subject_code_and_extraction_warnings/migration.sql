-- AlterEnum
ALTER TYPE "WarningSource" ADD VALUE 'EXTRACTION';

-- AlterTable
ALTER TABLE "AnalyzedSubject" ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "CurricularAnalysis" ADD COLUMN     "campus" TEXT,
ADD COLUMN     "modality" TEXT;
