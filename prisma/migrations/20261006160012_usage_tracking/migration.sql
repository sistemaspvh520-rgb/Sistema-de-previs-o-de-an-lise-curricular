-- Uso da equipe: agregado por hora, linha do tempo e presença (só equipe; sem IDs nem dados de alunos).
-- CreateEnum
CREATE TYPE "UsageModule" AS ENUM ('CURRICULAR', 'GRADES', 'ACADEMIC', 'MANAGEMENT', 'SETTINGS', 'OTHER');

-- CreateEnum
CREATE TYPE "UsageEventKind" AS ENUM ('PAGE_VIEW', 'ACTION');

-- CreateTable
CREATE TABLE "UsageHourly" (
    "userId" UUID NOT NULL,
    "hour" TIMESTAMPTZ(6) NOT NULL,
    "module" "UsageModule" NOT NULL,
    "activeSeconds" INTEGER NOT NULL DEFAULT 0,
    "pageViews" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "UsageHourly_pkey" PRIMARY KEY ("userId","hour","module")
);

-- CreateTable
CREATE TABLE "UsageEvent" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "module" "UsageModule" NOT NULL,
    "kind" "UsageEventKind" NOT NULL,
    "name" TEXT NOT NULL,
    "entityId" TEXT,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPresence" (
    "userId" UUID NOT NULL,
    "module" "UsageModule" NOT NULL,
    "routeLabel" TEXT NOT NULL,
    "seenAt" TIMESTAMPTZ(6) NOT NULL,
    "beatAt" TIMESTAMPTZ(6),

    CONSTRAINT "UserPresence_pkey" PRIMARY KEY ("userId")
);

-- CreateIndex
CREATE INDEX "UsageHourly_hour_idx" ON "UsageHourly"("hour");

-- CreateIndex
CREATE INDEX "UsageEvent_userId_createdAt_idx" ON "UsageEvent"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UsageEvent_module_createdAt_idx" ON "UsageEvent"("module", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "UsageEvent_createdAt_idx" ON "UsageEvent"("createdAt");

-- CreateIndex
CREATE INDEX "UserPresence_seenAt_idx" ON "UserPresence"("seenAt");

-- AddForeignKey
ALTER TABLE "UsageHourly" ADD CONSTRAINT "UsageHourly_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UsageEvent" ADD CONSTRAINT "UsageEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPresence" ADD CONSTRAINT "UserPresence_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
