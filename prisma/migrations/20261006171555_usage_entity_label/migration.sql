-- Uso das grades: nome do registro (ex.: curso da grade) no momento do uso, para o histórico sobreviver à exclusão.
ALTER TABLE "UsageEvent" ADD COLUMN "entityLabel" TEXT;
