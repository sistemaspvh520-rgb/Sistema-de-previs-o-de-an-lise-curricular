-- Metadados consultáveis e trilhas de formação extraídos das matrizes comerciais.
ALTER TABLE "CommercialGrade"
  ADD COLUMN "degree" TEXT,
  ADD COLUMN "knowledgeArea" TEXT,
  ADD COLUMN "durationSemesters" INTEGER,
  ADD COLUMN "courseTracks" JSONB;

CREATE INDEX "CommercialGrade_degree_idx" ON "CommercialGrade"("degree");
CREATE INDEX "CommercialGrade_knowledgeArea_idx" ON "CommercialGrade"("knowledgeArea");
CREATE INDEX "CommercialGrade_durationSemesters_idx" ON "CommercialGrade"("durationSemesters");
