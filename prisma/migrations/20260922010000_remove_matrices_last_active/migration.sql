-- Atividade real dos usuários (não só login por senha)
ALTER TABLE "User" ADD COLUMN "lastActiveAt" TIMESTAMPTZ(6);
UPDATE "User" SET "lastActiveAt" = "lastLoginAt" WHERE "lastActiveAt" IS NULL;

-- Ingresso passou a ser obrigatório no envio: análises reabertas manualmente (que já têm ingresso)
-- voltam a "Pronta"; só registros legados sem ingresso permanecem aguardando confirmação.
UPDATE "CurricularAnalysis"
SET "status" = 'COMPLETED', "completedAt" = COALESCE("completedAt", "updatedAt")
WHERE "status" = 'WAITING_REVIEW' AND "entryPeriod" IS NOT NULL;

-- Remoção do recurso de matrizes curriculares oficiais
DELETE FROM "AnalysisWarning" WHERE "source" = 'MATRIX';

ALTER TABLE "CurricularAnalysis" DROP CONSTRAINT IF EXISTS "CurricularAnalysis_curriculumMatrixId_fkey";
ALTER TABLE "CurricularAnalysis" DROP COLUMN IF EXISTS "curriculumMatrixId";

DROP TABLE IF EXISTS "CurriculumSubject";
DROP TABLE IF EXISTS "CurriculumPeriod";
DROP TABLE IF EXISTS "CurriculumMatrix";
DROP TABLE IF EXISTS "Course";

-- Enum sem MATRIX
CREATE TYPE "WarningSource_new" AS ENUM ('PIPELINE', 'VALIDATOR', 'AUDITOR', 'EXTRACTION');
ALTER TABLE "AnalysisWarning" ALTER COLUMN "source" TYPE "WarningSource_new" USING ("source"::text::"WarningSource_new");
ALTER TYPE "WarningSource" RENAME TO "WarningSource_old";
ALTER TYPE "WarningSource_new" RENAME TO "WarningSource";
DROP TYPE "WarningSource_old";
