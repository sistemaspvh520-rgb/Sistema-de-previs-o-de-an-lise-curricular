CREATE TYPE "DeletionRequestStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "AnalysisDeletionRequest" (
  "id" UUID NOT NULL,
  "analysisId" UUID NOT NULL,
  "requestedById" UUID NOT NULL,
  "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "reviewedById" UUID,
  "reviewedAt" TIMESTAMPTZ(6),
  "decisionNote" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "AnalysisDeletionRequest_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AnalysisDeletionRequest_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CurricularAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnalysisDeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AnalysisDeletionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "AnalysisDeletionRequest_status_createdAt_idx" ON "AnalysisDeletionRequest"("status", "createdAt" DESC);
CREATE INDEX "AnalysisDeletionRequest_analysisId_requestedById_status_idx" ON "AnalysisDeletionRequest"("analysisId", "requestedById", "status");
