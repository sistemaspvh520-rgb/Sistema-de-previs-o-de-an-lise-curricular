-- Cada analista confirma uma frequência antes de entrar na operação.
CREATE TYPE "FollowUpCadence" AS ENUM ('ONCE_DAILY', 'TWICE_DAILY');

ALTER TABLE "User"
  ADD COLUMN "followUpCadence" "FollowUpCadence",
  ADD COLUMN "followUpPreferencesConfirmedAt" TIMESTAMPTZ(6);

CREATE INDEX "User_followUpPreferencesConfirmedAt_idx"
  ON "User"("followUpPreferencesConfirmedAt");
