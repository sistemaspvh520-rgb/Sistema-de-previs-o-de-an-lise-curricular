-- Mantidos nulos em registros antigos; novos envios sempre recebem as duas assinaturas.
ALTER TABLE "CommercialGrade"
  ADD COLUMN "contentHash" CHAR(64),
  ADD COLUMN "catalogKey" CHAR(64);

CREATE UNIQUE INDEX "CommercialGrade_contentHash_key" ON "CommercialGrade"("contentHash");
CREATE UNIQUE INDEX "CommercialGrade_catalogKey_key" ON "CommercialGrade"("catalogKey");
