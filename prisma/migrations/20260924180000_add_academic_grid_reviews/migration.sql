CREATE TYPE "AcademicGridReviewStatus" AS ENUM (
  'NO_PENDING',
  'CAN_ADD',
  'NEAR_LIMIT',
  'LIMIT_REACHED',
  'MANUAL_REVIEW_REQUIRED'
);

CREATE TABLE "AcademicGridReview" (
  "id" UUID NOT NULL,
  "createdById" UUID NOT NULL,
  "studentName" TEXT,
  "rgm" TEXT,
  "courseName" TEXT,
  "currentPeriod" INTEGER,
  "currentPeriodRaw" TEXT,
  "currentPeriodConfirmed" BOOLEAN NOT NULL DEFAULT false,
  "sourceFilename" TEXT NOT NULL,
  "sourceSha256" CHAR(64) NOT NULL,
  "sourcePageCount" INTEGER NOT NULL,
  "status" "AcademicGridReviewStatus" NOT NULL DEFAULT 'MANUAL_REVIEW_REQUIRED',
  "snapshot" JSONB NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "AcademicGridReview_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AcademicGridCorrection" (
  "id" UUID NOT NULL,
  "reviewId" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "disciplineIndex" INTEGER,
  "field" TEXT NOT NULL,
  "previousValue" JSONB,
  "newValue" JSONB,
  "reason" TEXT,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AcademicGridCorrection_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AcademicGridReview_createdById_createdAt_idx"
  ON "AcademicGridReview" ("createdById", "createdAt" DESC);
CREATE INDEX "AcademicGridReview_rgm_createdAt_idx"
  ON "AcademicGridReview" ("rgm", "createdAt" DESC);
CREATE INDEX "AcademicGridReview_studentName_createdAt_idx"
  ON "AcademicGridReview" ("studentName", "createdAt" DESC);
CREATE INDEX "AcademicGridCorrection_reviewId_createdAt_idx"
  ON "AcademicGridCorrection" ("reviewId", "createdAt" DESC);
CREATE INDEX "AcademicGridCorrection_userId_createdAt_idx"
  ON "AcademicGridCorrection" ("userId", "createdAt" DESC);

ALTER TABLE "AcademicGridReview"
  ADD CONSTRAINT "AcademicGridReview_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "AcademicGridCorrection"
  ADD CONSTRAINT "AcademicGridCorrection_reviewId_fkey"
  FOREIGN KEY ("reviewId") REFERENCES "AcademicGridReview"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AcademicGridCorrection"
  ADD CONSTRAINT "AcademicGridCorrection_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
