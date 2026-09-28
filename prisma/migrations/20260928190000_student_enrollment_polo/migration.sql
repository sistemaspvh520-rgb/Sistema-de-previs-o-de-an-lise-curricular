-- Polo do aluno (antes era sempre o do tutor responsável).
ALTER TABLE "StudentEnrollment" ADD COLUMN "poloCode" TEXT;

-- Alunos atuais herdam o polo do tutor responsável, quando ele tem polo.
UPDATE "StudentEnrollment" AS e
SET "poloCode" = u."poloCode"
FROM "User" AS u
WHERE u."id" = e."ownerId" AND u."poloCode" IS NOT NULL AND e."poloCode" IS NULL;
