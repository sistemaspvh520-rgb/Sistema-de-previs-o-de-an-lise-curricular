-- Preferências individuais de lembretes; mantêm os dois canais ligados para usuários já existentes.
ALTER TABLE "User" ADD COLUMN "followUpEmailEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN "followUpPushEnabled" BOOLEAN NOT NULL DEFAULT true;
