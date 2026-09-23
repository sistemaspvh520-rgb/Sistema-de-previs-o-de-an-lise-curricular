ALTER TABLE "User"
  ADD COLUMN "followUpBusinessStartHour" INTEGER,
  ADD COLUMN "followUpBusinessEndHour" INTEGER;

CREATE TABLE "CommercialGrade" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "courseName" TEXT NOT NULL,
  "modality" TEXT,
  "curriculumTerm" TEXT,
  "internshipInfo" TEXT,
  "hasTcc" BOOLEAN NOT NULL DEFAULT false,
  "originalName" TEXT NOT NULL,
  "storageKey" TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "uploadedById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "CommercialGrade_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CommercialGrade_storageKey_key" UNIQUE ("storageKey"),
  CONSTRAINT "CommercialGrade_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "CommercialGrade_uploadedById_idx" ON "CommercialGrade"("uploadedById");
CREATE INDEX "CommercialGrade_courseName_idx" ON "CommercialGrade"("courseName");
CREATE INDEX "CommercialGrade_createdAt_idx" ON "CommercialGrade"("createdAt" DESC);
