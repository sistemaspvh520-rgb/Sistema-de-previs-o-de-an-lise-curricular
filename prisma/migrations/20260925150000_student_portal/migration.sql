-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'STUDENT';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "sessionVersion" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "AcademicGridReview" ADD COLUMN     "enrollmentId" UUID;

-- CreateTable
CREATE TABLE "StudentEnrollment" (
    "id" UUID NOT NULL,
    "rgm" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "courseName" TEXT,
    "studentUserId" UUID,
    "ownerId" UUID NOT NULL,
    "currentVersionId" UUID,
    "welcomedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StudentEnrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicAnalysisVersion" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "reviewId" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "previousVersionId" UUID,
    "academicSnapshotHash" CHAR(64) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "actorUserId" UUID NOT NULL,
    "actorRole" "Role" NOT NULL,
    "origin" TEXT NOT NULL,
    "changeSummary" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AcademicAnalysisVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AcademicAnalysisSource" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID NOT NULL,
    "sourceFileHash" CHAR(64) NOT NULL,
    "normalizedContentHash" CHAR(64),
    "storageKey" TEXT,
    "filename" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PROCESSING',
    "stage" TEXT NOT NULL DEFAULT 'Processando extrato',
    "actorUserId" UUID NOT NULL,
    "actorRole" "Role" NOT NULL,
    "versionId" UUID,
    "errorMessage" TEXT,
    "reused" BOOLEAN NOT NULL DEFAULT false,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AcademicAnalysisSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudentEnrollment_rgm_key" ON "StudentEnrollment"("rgm");

-- CreateIndex
CREATE UNIQUE INDEX "StudentEnrollment_currentVersionId_key" ON "StudentEnrollment"("currentVersionId");

-- CreateIndex
CREATE INDEX "StudentEnrollment_studentUserId_idx" ON "StudentEnrollment"("studentUserId");

-- CreateIndex
CREATE INDEX "StudentEnrollment_ownerId_createdAt_idx" ON "StudentEnrollment"("ownerId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AcademicAnalysisVersion_enrollmentId_createdAt_idx" ON "AcademicAnalysisVersion"("enrollmentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AcademicAnalysisVersion_reviewId_idx" ON "AcademicAnalysisVersion"("reviewId");

-- CreateIndex
CREATE INDEX "AcademicAnalysisVersion_actorUserId_idx" ON "AcademicAnalysisVersion"("actorUserId");

-- CreateIndex
CREATE INDEX "AcademicAnalysisVersion_previousVersionId_idx" ON "AcademicAnalysisVersion"("previousVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicAnalysisVersion_enrollmentId_version_key" ON "AcademicAnalysisVersion"("enrollmentId", "version");

-- CreateIndex
CREATE INDEX "AcademicAnalysisSource_enrollmentId_normalizedContentHash_s_idx" ON "AcademicAnalysisSource"("enrollmentId", "normalizedContentHash", "status");

-- CreateIndex
CREATE INDEX "AcademicAnalysisSource_enrollmentId_createdAt_idx" ON "AcademicAnalysisSource"("enrollmentId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AcademicAnalysisSource_actorUserId_idx" ON "AcademicAnalysisSource"("actorUserId");

-- CreateIndex
CREATE INDEX "AcademicAnalysisSource_versionId_idx" ON "AcademicAnalysisSource"("versionId");

-- CreateIndex
CREATE UNIQUE INDEX "AcademicAnalysisSource_enrollmentId_sourceFileHash_key" ON "AcademicAnalysisSource"("enrollmentId", "sourceFileHash");

-- CreateIndex
CREATE INDEX "AcademicGridReview_enrollmentId_idx" ON "AcademicGridReview"("enrollmentId");

-- AddForeignKey
ALTER TABLE "AcademicGridReview" ADD CONSTRAINT "AcademicGridReview_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_studentUserId_fkey" FOREIGN KEY ("studentUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentEnrollment" ADD CONSTRAINT "StudentEnrollment_currentVersionId_fkey" FOREIGN KEY ("currentVersionId") REFERENCES "AcademicAnalysisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicAnalysisVersion" ADD CONSTRAINT "AcademicAnalysisVersion_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicAnalysisVersion" ADD CONSTRAINT "AcademicAnalysisVersion_reviewId_fkey" FOREIGN KEY ("reviewId") REFERENCES "AcademicGridReview"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicAnalysisVersion" ADD CONSTRAINT "AcademicAnalysisVersion_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicAnalysisVersion" ADD CONSTRAINT "AcademicAnalysisVersion_previousVersionId_fkey" FOREIGN KEY ("previousVersionId") REFERENCES "AcademicAnalysisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicAnalysisSource" ADD CONSTRAINT "AcademicAnalysisSource_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicAnalysisSource" ADD CONSTRAINT "AcademicAnalysisSource_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AcademicAnalysisSource" ADD CONSTRAINT "AcademicAnalysisSource_versionId_fkey" FOREIGN KEY ("versionId") REFERENCES "AcademicAnalysisVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Only one in-flight update per enrollment, even across application instances.
CREATE UNIQUE INDEX "AcademicAnalysisSource_one_processing" ON "AcademicAnalysisSource" ("enrollmentId") WHERE status = 'PROCESSING';
ALTER TABLE "AcademicAnalysisSource" ADD CONSTRAINT "AcademicAnalysisSource_status_check" CHECK (status IN ('PROCESSING', 'COMPLETED', 'FAILED'));
ALTER TABLE "AcademicAnalysisVersion" ADD CONSTRAINT "AcademicAnalysisVersion_positive_version" CHECK (version > 0);
-- Auth.js identities are checked by our server, not Supabase JWTs. Deny the Data API.
ALTER TABLE "StudentEnrollment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicAnalysisVersion" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AcademicAnalysisSource" ENABLE ROW LEVEL SECURITY;
DO $$
DECLARE client_role text;
BEGIN
  FOREACH client_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = client_role) THEN
      EXECUTE format('REVOKE ALL ON "StudentEnrollment", "AcademicAnalysisVersion", "AcademicAnalysisSource" FROM %I', client_role);
    END IF;
  END LOOP;
END $$;
