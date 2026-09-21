-- Defaults para novas instalações. Integrações existentes são preservadas e devem
-- ser validadas pela tela de Configurações → OpenAI antes de receber o novo modelo.
ALTER TABLE "OpenAIIntegration"
  ALTER COLUMN "extractionModel" SET DEFAULT 'gpt-5.6-sol',
  ALTER COLUMN "auditModel" SET DEFAULT 'gpt-5.6-sol';
