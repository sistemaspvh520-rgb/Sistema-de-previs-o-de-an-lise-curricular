-- Nome do aluno e polo informados pelo analista no envio (nulos apenas em registros legados)
ALTER TABLE "CurricularAnalysis" ADD COLUMN "studentName" TEXT;
ALTER TABLE "CurricularAnalysis" ADD COLUMN "poloCode" TEXT;
ALTER TABLE "CurricularAnalysis" ADD COLUMN "poloName" TEXT;
CREATE INDEX "CurricularAnalysis_poloCode_idx" ON "CurricularAnalysis"("poloCode");
