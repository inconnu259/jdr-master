-- CreateEnum
CREATE TYPE "ScenarioStatus" AS ENUM ('BROUILLON', 'A_VENIR', 'COURANT', 'PASSE');

-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "journalAutoAssociate" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Scenario" (
    "id" TEXT NOT NULL,
    "partieId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ScenarioStatus" NOT NULL DEFAULT 'BROUILLON',
    "dureeHeures" INTEGER,
    "dureeSeances" INTEGER,
    "resumeFin" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Scenario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Seance" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "pollId" TEXT,
    "inscriptionMin" INTEGER,
    "inscriptionMax" INTEGER,
    "dateValidee" TIMESTAMP(3),
    "compteRendu" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Seance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Inscription" (
    "id" TEXT NOT NULL,
    "seanceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Inscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioParticipant" (
    "id" TEXT NOT NULL,
    "scenarioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "ScenarioParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScenarioDocument" (
    "id" TEXT NOT NULL,
    "partieId" TEXT NOT NULL,
    "scenarioId" TEXT,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScenarioDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Announcement" (
    "id" TEXT NOT NULL,
    "partieId" TEXT NOT NULL,
    "scenarioId" TEXT,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Announcement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Scenario_partieId_status_idx" ON "Scenario"("partieId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Seance_pollId_key" ON "Seance"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "Inscription_seanceId_userId_key" ON "Inscription"("seanceId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "ScenarioParticipant_scenarioId_userId_key" ON "ScenarioParticipant"("scenarioId", "userId");

-- CreateIndex
CREATE INDEX "ScenarioDocument_partieId_idx" ON "ScenarioDocument"("partieId");

-- CreateIndex
CREATE INDEX "Announcement_partieId_createdAt_idx" ON "Announcement"("partieId", "createdAt");

-- AddForeignKey
ALTER TABLE "Scenario" ADD CONSTRAINT "Scenario_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "Partie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seance" ADD CONSTRAINT "Seance_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Seance" ADD CONSTRAINT "Seance_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "SessionPoll"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscription" ADD CONSTRAINT "Inscription_seanceId_fkey" FOREIGN KEY ("seanceId") REFERENCES "Seance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Inscription" ADD CONSTRAINT "Inscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioParticipant" ADD CONSTRAINT "ScenarioParticipant_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioParticipant" ADD CONSTRAINT "ScenarioParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioDocument" ADD CONSTRAINT "ScenarioDocument_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "Partie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScenarioDocument" ADD CONSTRAINT "ScenarioDocument_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "Partie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Announcement" ADD CONSTRAINT "Announcement_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill (AD-7) : chaque Partie ONE_SHOT déjà existante avant cette migration reçoit
-- rétroactivement son scénario unique BROUILLON, pour respecter l'invariant "jamais de
-- Partie ONE_SHOT sans scénario" même pour les lignes créées avant l'introduction du modèle.
-- Idempotent (NOT EXISTS) : sans effet si relancé ou si la Partie a déjà un scénario.
INSERT INTO "Scenario" ("id", "partieId", "title", "status", "createdAt")
SELECT gen_random_uuid(), p."id", p."name", 'BROUILLON', now()
FROM "Partie" p
WHERE p."kind" = 'ONE_SHOT'
  AND NOT EXISTS (SELECT 1 FROM "Scenario" s WHERE s."partieId" = p."id");
