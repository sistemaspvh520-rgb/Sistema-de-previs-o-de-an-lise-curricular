-- Mantém o registro da reanálise declarada no retorno comercial.
-- A consulta de retornos continua usando o índice existente
-- (enrollmentStatus, followUpDueAt), portanto não é necessário novo índice.
ALTER TABLE "CurricularAnalysis"
ADD COLUMN "enrollmentReanalysisAt" TIMESTAMPTZ(6);
