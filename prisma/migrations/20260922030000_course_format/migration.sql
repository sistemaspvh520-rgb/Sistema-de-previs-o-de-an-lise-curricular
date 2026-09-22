-- Formato do curso informado no envio (EAD Digital ou Semipresencial); nulo apenas em registros legados
CREATE TYPE "CourseFormat" AS ENUM ('EAD_DIGITAL', 'SEMIPRESENCIAL');
ALTER TABLE "CurricularAnalysis" ADD COLUMN "courseFormat" "CourseFormat";
