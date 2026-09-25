-- CreateEnum
CREATE TYPE "AcademicDocumentType" AS ENUM ('OFFICIAL_ACADEMIC_HISTORY', 'SIMPLE_ACADEMIC_HISTORY', 'CURRICULAR_EXTRACT', 'UNKNOWN_ACADEMIC_DOCUMENT');

-- CreateEnum
CREATE TYPE "AcademicRequestStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'UNDER_REVIEW', 'WAITING_NEW_DOCUMENT', 'NO_CHANGES', 'COMPLETED', 'REJECTED', 'FAILED');

-- AlterTable
ALTER TABLE "AcademicAnalysisVersion" ADD COLUMN     "preferredSourceId" UUID;

-- AlterTable
ALTER TABLE "AcademicAnalysisSource" ADD COLUMN     "documentType" "AcademicDocumentType" NOT NULL DEFAULT 'CURRICULAR_EXTRACT',
ADD COLUMN     "parserName" TEXT,
ADD COLUMN     "validationResult" TEXT;

-- CreateTable
CREATE TABLE "AcademicRequest" (
    "id" UUID NOT NULL,
    "protocol" SERIAL NOT NULL,
    "sourceDocumentId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "previousRequestId" UUID,
    "status" "AcademicRequestStatus" NOT NULL DEFAULT 'RECEIVED',
    "actorUserId" UUID NOT NULL,
    "actorRole" "Role" NOT NULL,
    "result" TEXT,
    "aiUsed" BOOLEAN NOT NULL DEFAULT false,
    "createdVersion" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AcademicRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AcademicRequest_protocol_key" ON "AcademicRequest"("protocol");

-- CreateIndex
CREATE INDEX "AcademicRequest_status_createdAt_idx" ON "AcademicRequest"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AcademicRequest_actorUserId_idx" ON "AcademicRequest"("actorUserId");

-- CreateIndex
CREATE INDEX "AcademicRequest_previousRequestId_idx" ON "AcademicRequest"("previousRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicRequest_sourceDocumentId_attempt_key" ON "AcademicRequest"("sourceDocumentId", "attempt");

-- CreateIndex
CREATE INDEX "AcademicAnalysisVersion_preferredSourceId_idx" ON "AcademicAnalysisVersion"("preferredSourceId");

-- AddForeignKey
ALTER TABLE "AcademicAnalysisVersion" ADD CONSTRAINT "AcademicAnalysisVersion_preferredSourceId_fkey" FOREIGN KEY ("preferredSourceId") REFERENCES "AcademicAnalysisSource"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicRequest" ADD CONSTRAINT "AcademicRequest_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "AcademicAnalysisSource"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicRequest" ADD CONSTRAINT "AcademicRequest_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicRequest" ADD CONSTRAINT "AcademicRequest_previousRequestId_fkey" FOREIGN KEY ("previousRequestId") REFERENCES "AcademicRequest"("id") ON DELETE SET NULL ON UPDATE CASCADE;


ALTER TABLE "AcademicRequest" ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON "AcademicRequest" FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON "AcademicRequest" FROM authenticated;
  END IF;
END $$;
ALTER TABLE "AcademicRequest" ADD CONSTRAINT "AcademicRequest_attempt_positive" CHECK (attempt > 0);
INSERT INTO "AcademicRequest" (id, "sourceDocumentId", attempt, status, "actorUserId", "actorRole", result, "createdAt", "updatedAt")
SELECT gen_random_uuid(), id, attempts,
  CASE WHEN status = 'COMPLETED' THEN CASE WHEN reused THEN 'NO_CHANGES' ELSE 'COMPLETED' END
       WHEN status = 'PROCESSING' THEN 'PROCESSING' ELSE 'FAILED' END::"AcademicRequestStatus",
  "actorUserId", "actorRole", "errorMessage", "createdAt", "updatedAt"
FROM "AcademicAnalysisSource";
UPDATE "AcademicAnalysisVersion" v SET "preferredSourceId" = (
  SELECT s.id FROM "AcademicAnalysisSource" s WHERE s."versionId" = v.id AND s.status = 'COMPLETED' ORDER BY s."createdAt" LIMIT 1
);
