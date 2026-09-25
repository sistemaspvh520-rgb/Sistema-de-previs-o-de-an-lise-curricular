-- AlterTable
ALTER TABLE "AcademicAnalysisSource" ADD COLUMN     "deleteAfter" TIMESTAMPTZ(6),
ADD COLUMN     "deletedAt" TIMESTAMPTZ(6);

-- CreateIndex
CREATE INDEX "AcademicAnalysisSource_deleteAfter_idx" ON "AcademicAnalysisSource"("deleteAfter");

