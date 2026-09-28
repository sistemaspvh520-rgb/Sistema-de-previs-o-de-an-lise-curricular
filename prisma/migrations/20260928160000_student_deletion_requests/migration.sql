-- CreateTable
CREATE TABLE "StudentDeletionRequest" (
    "id" UUID NOT NULL,
    "enrollmentId" UUID,
    "studentName" TEXT NOT NULL,
    "rgm" TEXT NOT NULL,
    "requestedById" UUID NOT NULL,
    "reason" TEXT,
    "status" "DeletionRequestStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(6),
    "decisionNote" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "StudentDeletionRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StudentDeletionRequest_status_createdAt_idx" ON "StudentDeletionRequest"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "StudentDeletionRequest_enrollmentId_status_idx" ON "StudentDeletionRequest"("enrollmentId", "status");

-- AddForeignKey
ALTER TABLE "StudentDeletionRequest" ADD CONSTRAINT "StudentDeletionRequest_enrollmentId_fkey" FOREIGN KEY ("enrollmentId") REFERENCES "StudentEnrollment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDeletionRequest" ADD CONSTRAINT "StudentDeletionRequest_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudentDeletionRequest" ADD CONSTRAINT "StudentDeletionRequest_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS (mesmo padrão das demais tabelas: só o app, via role postgres, acessa)
ALTER TABLE "StudentDeletionRequest" ENABLE ROW LEVEL SECURITY;
