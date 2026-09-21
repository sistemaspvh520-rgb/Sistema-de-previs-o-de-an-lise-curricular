-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'ANALYST', 'VIEWER');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('UPLOADED', 'PARSING', 'AI_EXTRACTION', 'NORMALIZING', 'CALCULATING', 'VALIDATING', 'AI_AUDIT', 'WAITING_REVIEW', 'COMPLETED', 'FAILED', 'AI_ERROR');

-- CreateEnum
CREATE TYPE "SubjectStatus" AS ENUM ('EXEMPTED', 'PENDING', 'REVIEW');

-- CreateEnum
CREATE TYPE "Readability" AS ENUM ('CLEAR', 'UNCLEAR', 'UNREADABLE');

-- CreateEnum
CREATE TYPE "SubjectOrigin" AS ENUM ('AI', 'USER');

-- CreateEnum
CREATE TYPE "EntryPeriodSource" AS ENUM ('DOCUMENT', 'STRUCTURED', 'RULE', 'USER');

-- CreateEnum
CREATE TYPE "ReliabilityLevel" AS ENUM ('HIGH', 'REVIEW_RECOMMENDED', 'REVIEW_REQUIRED');

-- CreateEnum
CREATE TYPE "ProjectionSubjectKind" AS ENUM ('REGULAR', 'BACKLOG');

-- CreateEnum
CREATE TYPE "WarningSeverity" AS ENUM ('INFO', 'WARNING', 'CRITICAL');

-- CreateEnum
CREATE TYPE "WarningSource" AS ENUM ('PIPELINE', 'VALIDATOR', 'AUDITOR', 'MATRIX');

-- CreateEnum
CREATE TYPE "AIOperation" AS ENUM ('DOCUMENT_EXTRACTION', 'CURRICULUM_EXTRACTION', 'AUDIT', 'FINAL_EXPLANATION', 'CONNECTION_TEST');

-- CreateEnum
CREATE TYPE "AIReviewStatus" AS ENUM ('OK', 'REVIEW');

-- CreateEnum
CREATE TYPE "IntegrationStatus" AS ENUM ('DISCONNECTED', 'CONNECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "RuleStatus" AS ENUM ('CONFIRMED', 'CONFIGURABLE', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "RetentionPolicy" AS ENUM ('DAYS_30', 'DAYS_90', 'DAYS_180', 'INDEFINITE', 'DELETE_AFTER_PROCESSING');

-- CreateEnum
CREATE TYPE "AIPrivacyMode" AS ENUM ('PDF_FILE', 'REDACTED_TEXT');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ANALYST',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastLoginAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "userId" UUID,
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurricularAnalysis" (
    "id" UUID NOT NULL,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'UPLOADED',
    "createdById" UUID NOT NULL,
    "courseName" TEXT,
    "matrixLabel" TEXT,
    "candidateLabel" TEXT,
    "entryPeriod" INTEGER,
    "entryPeriodSource" "EntryPeriodSource",
    "startTerm" TEXT NOT NULL,
    "reliability" "ReliabilityLevel",
    "reviewItemsCount" INTEGER NOT NULL DEFAULT 0,
    "processingSteps" JSONB NOT NULL DEFAULT '[]',
    "errorCode" TEXT,
    "errorMessage" TEXT,
    "ruleSetVersionId" UUID NOT NULL,
    "engineVersion" TEXT NOT NULL,
    "extractorPromptVersion" TEXT,
    "auditorPromptVersion" TEXT,
    "extractionModel" TEXT,
    "auditModel" TEXT,
    "curriculumMatrixId" UUID,
    "projectionIncomplete" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMPTZ(6),
    "lastCalculatedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CurricularAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UploadedDocument" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "originalName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "pageCount" INTEGER,
    "mimeType" TEXT NOT NULL,
    "localExtraction" JSONB,
    "deleteAfter" TIMESTAMPTZ(6),
    "deletedAt" TIMESTAMPTZ(6),
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UploadedDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalyzedSubject" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "rowHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "workload" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "usedSubject" TEXT,
    "status" "SubjectStatus" NOT NULL,
    "readability" "Readability" NOT NULL DEFAULT 'CLEAR',
    "sourcePage" INTEGER NOT NULL,
    "sourceRow" INTEGER NOT NULL,
    "bbox" JSONB,
    "origin" "SubjectOrigin" NOT NULL DEFAULT 'AI',
    "note" TEXT,
    "sortIndex" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "AnalyzedSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SemesterProjection" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "index" INTEGER NOT NULL,
    "term" TEXT NOT NULL,
    "periodNumber" INTEGER,
    "isAdditional" BOOLEAN NOT NULL DEFAULT false,
    "subjectsInPeriod" INTEGER NOT NULL,
    "exemptedInPeriod" INTEGER NOT NULL,
    "regularSubjectsToTake" INTEGER NOT NULL,
    "maximumCapacity" INTEGER NOT NULL,
    "backlogCapacity" INTEGER NOT NULL,
    "subjectsFromBacklog" INTEGER NOT NULL,
    "semesterLoad" INTEGER NOT NULL,
    "remainingBacklog" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SemesterProjection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProjectionSubject" (
    "id" UUID NOT NULL,
    "projectionId" UUID NOT NULL,
    "subjectId" UUID NOT NULL,
    "kind" "ProjectionSubjectKind" NOT NULL,
    "order" INTEGER NOT NULL,

    CONSTRAINT "ProjectionSubject_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentClaim" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "value" DOUBLE PRECISION,
    "sourcePage" INTEGER NOT NULL,
    "rawText" TEXT,
    "calculatedValue" DOUBLE PRECISION,
    "matches" BOOLEAN,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentClaim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisWarning" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "severity" "WarningSeverity" NOT NULL,
    "source" "WarningSource" NOT NULL,
    "message" TEXT NOT NULL,
    "subjectId" UUID,
    "sourcePage" INTEGER,
    "resolvedAt" TIMESTAMPTZ(6),
    "resolvedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalysisWarning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ManualCorrection" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "subjectId" UUID,
    "userId" UUID NOT NULL,
    "field" TEXT NOT NULL,
    "previousValue" TEXT,
    "newValue" TEXT,
    "reason" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualCorrection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIExtraction" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "privacyMode" "AIPrivacyMode" NOT NULL,
    "rawOutput" JSONB,
    "durationMs" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "errorCode" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIExtraction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIReview" (
    "id" UUID NOT NULL,
    "analysisId" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "status" "AIReviewStatus" NOT NULL,
    "issues" JSONB NOT NULL,
    "durationMs" INTEGER NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIReview_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" UUID NOT NULL,
    "analysisId" UUID,
    "operation" "AIOperation" NOT NULL,
    "model" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "totalTokens" INTEGER NOT NULL,
    "estimatedCost" DECIMAL(12,6) NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpenAIIntegration" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "status" "IntegrationStatus" NOT NULL DEFAULT 'DISCONNECTED',
    "encryptedApiKey" TEXT,
    "encryptionIv" TEXT,
    "encryptionAuthTag" TEXT,
    "keyVersion" INTEGER,
    "apiKeyLastFour" TEXT,
    "extractionModel" TEXT NOT NULL DEFAULT 'gpt-5.5',
    "auditModel" TEXT NOT NULL DEFAULT 'gpt-5.4-mini',
    "futureExplanationModel" TEXT,
    "projectLabel" TEXT,
    "serviceAccountLabel" TEXT,
    "lastTestedAt" TIMESTAMPTZ(6),
    "lastConnectionStatus" TEXT,
    "lastErrorCode" TEXT,
    "createdById" UUID,
    "updatedById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "OpenAIIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RuleSetVersion" (
    "id" UUID NOT NULL,
    "version" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "effectiveFrom" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdById" UUID,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RuleSetVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemRule" (
    "id" UUID NOT NULL,
    "ruleSetVersionId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "valueType" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "status" "RuleStatus" NOT NULL,
    "description" TEXT NOT NULL,

    CONSTRAINT "SystemRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT,
    "modality" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumMatrix" (
    "id" UUID NOT NULL,
    "courseId" UUID NOT NULL,
    "label" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "version" TEXT NOT NULL,
    "validFrom" DATE,
    "validTo" DATE,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "CurriculumMatrix_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumPeriod" (
    "id" UUID NOT NULL,
    "matrixId" UUID NOT NULL,
    "number" INTEGER NOT NULL,
    "label" TEXT,

    CONSTRAINT "CurriculumPeriod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CurriculumSubject" (
    "id" UUID NOT NULL,
    "periodId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "workload" INTEGER NOT NULL,
    "prerequisites" JSONB NOT NULL DEFAULT '[]',
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "CurriculumSubject_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");

-- CreateIndex
CREATE INDEX "CurricularAnalysis_status_createdAt_idx" ON "CurricularAnalysis"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "CurricularAnalysis_createdById_idx" ON "CurricularAnalysis"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "UploadedDocument_analysisId_key" ON "UploadedDocument"("analysisId");

-- CreateIndex
CREATE INDEX "UploadedDocument_deleteAfter_idx" ON "UploadedDocument"("deleteAfter");

-- CreateIndex
CREATE INDEX "AnalyzedSubject_analysisId_period_sortIndex_idx" ON "AnalyzedSubject"("analysisId", "period", "sortIndex");

-- CreateIndex
CREATE UNIQUE INDEX "AnalyzedSubject_analysisId_rowHash_key" ON "AnalyzedSubject"("analysisId", "rowHash");

-- CreateIndex
CREATE UNIQUE INDEX "SemesterProjection_analysisId_index_key" ON "SemesterProjection"("analysisId", "index");

-- CreateIndex
CREATE UNIQUE INDEX "ProjectionSubject_projectionId_subjectId_key" ON "ProjectionSubject"("projectionId", "subjectId");

-- CreateIndex
CREATE INDEX "DocumentClaim_analysisId_idx" ON "DocumentClaim"("analysisId");

-- CreateIndex
CREATE INDEX "AnalysisWarning_analysisId_resolvedAt_idx" ON "AnalysisWarning"("analysisId", "resolvedAt");

-- CreateIndex
CREATE INDEX "ManualCorrection_analysisId_createdAt_idx" ON "ManualCorrection"("analysisId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AIExtraction_analysisId_idx" ON "AIExtraction"("analysisId");

-- CreateIndex
CREATE INDEX "AIReview_analysisId_idx" ON "AIReview"("analysisId");

-- CreateIndex
CREATE INDEX "AIUsage_createdAt_idx" ON "AIUsage"("createdAt");

-- CreateIndex
CREATE INDEX "AIUsage_analysisId_idx" ON "AIUsage"("analysisId");

-- CreateIndex
CREATE UNIQUE INDEX "RuleSetVersion_version_key" ON "RuleSetVersion"("version");

-- CreateIndex
CREATE UNIQUE INDEX "SystemRule_ruleSetVersionId_key_key" ON "SystemRule"("ruleSetVersionId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Course_name_modality_key" ON "Course"("name", "modality");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumMatrix_courseId_year_version_key" ON "CurriculumMatrix"("courseId", "year", "version");

-- CreateIndex
CREATE UNIQUE INDEX "CurriculumPeriod_matrixId_number_key" ON "CurriculumPeriod"("matrixId", "number");

-- CreateIndex
CREATE INDEX "CurriculumSubject_periodId_order_idx" ON "CurriculumSubject"("periodId", "order");

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurricularAnalysis" ADD CONSTRAINT "CurricularAnalysis_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurricularAnalysis" ADD CONSTRAINT "CurricularAnalysis_ruleSetVersionId_fkey" FOREIGN KEY ("ruleSetVersionId") REFERENCES "RuleSetVersion"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurricularAnalysis" ADD CONSTRAINT "CurricularAnalysis_curriculumMatrixId_fkey" FOREIGN KEY ("curriculumMatrixId") REFERENCES "CurriculumMatrix"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UploadedDocument" ADD CONSTRAINT "UploadedDocument_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CurricularAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyzedSubject" ADD CONSTRAINT "AnalyzedSubject_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CurricularAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SemesterProjection" ADD CONSTRAINT "SemesterProjection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CurricularAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectionSubject" ADD CONSTRAINT "ProjectionSubject_projectionId_fkey" FOREIGN KEY ("projectionId") REFERENCES "SemesterProjection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProjectionSubject" ADD CONSTRAINT "ProjectionSubject_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "AnalyzedSubject"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentClaim" ADD CONSTRAINT "DocumentClaim_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CurricularAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisWarning" ADD CONSTRAINT "AnalysisWarning_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CurricularAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisWarning" ADD CONSTRAINT "AnalysisWarning_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "AnalyzedSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisWarning" ADD CONSTRAINT "AnalysisWarning_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualCorrection" ADD CONSTRAINT "ManualCorrection_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CurricularAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualCorrection" ADD CONSTRAINT "ManualCorrection_subjectId_fkey" FOREIGN KEY ("subjectId") REFERENCES "AnalyzedSubject"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ManualCorrection" ADD CONSTRAINT "ManualCorrection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExtraction" ADD CONSTRAINT "AIExtraction_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CurricularAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIReview" ADD CONSTRAINT "AIReview_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CurricularAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CurricularAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenAIIntegration" ADD CONSTRAINT "OpenAIIntegration_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpenAIIntegration" ADD CONSTRAINT "OpenAIIntegration_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RuleSetVersion" ADD CONSTRAINT "RuleSetVersion_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SystemRule" ADD CONSTRAINT "SystemRule_ruleSetVersionId_fkey" FOREIGN KEY ("ruleSetVersionId") REFERENCES "RuleSetVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumMatrix" ADD CONSTRAINT "CurriculumMatrix_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumPeriod" ADD CONSTRAINT "CurriculumPeriod_matrixId_fkey" FOREIGN KEY ("matrixId") REFERENCES "CurriculumMatrix"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurriculumSubject" ADD CONSTRAINT "CurriculumSubject_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "CurriculumPeriod"("id") ON DELETE CASCADE ON UPDATE CASCADE;
