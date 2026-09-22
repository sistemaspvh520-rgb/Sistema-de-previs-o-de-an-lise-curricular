-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING', 'ENROLLED', 'NOT_ENROLLED');

-- AlterTable
ALTER TABLE "CurricularAnalysis" ADD COLUMN     "enrollmentNote" TEXT,
ADD COLUMN     "enrollmentStatus" "EnrollmentStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "enrollmentUpdatedAt" TIMESTAMPTZ(6),
ADD COLUMN     "enrollmentUpdatedById" UUID,
ADD COLUMN     "followUpDueAt" TIMESTAMPTZ(6),
ADD COLUMN     "followUpNotifiedAt" TIMESTAMPTZ(6),
ADD COLUMN     "reanalysisOfId" UUID;

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMPTZ(6),

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "CurricularAnalysis_enrollmentStatus_followUpDueAt_idx" ON "CurricularAnalysis"("enrollmentStatus", "followUpDueAt");

-- CreateIndex
CREATE INDEX "CurricularAnalysis_reanalysisOfId_idx" ON "CurricularAnalysis"("reanalysisOfId");

-- AddForeignKey
ALTER TABLE "CurricularAnalysis" ADD CONSTRAINT "CurricularAnalysis_enrollmentUpdatedById_fkey" FOREIGN KEY ("enrollmentUpdatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CurricularAnalysis" ADD CONSTRAINT "CurricularAnalysis_reanalysisOfId_fkey" FOREIGN KEY ("reanalysisOfId") REFERENCES "CurricularAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Análises já entregues passam a ter prazo de retorno (24h após a conclusão)
UPDATE "CurricularAnalysis" SET "followUpDueAt" = "completedAt" + INTERVAL '24 hours' WHERE "status" = 'COMPLETED' AND "completedAt" IS NOT NULL AND "followUpDueAt" IS NULL;
