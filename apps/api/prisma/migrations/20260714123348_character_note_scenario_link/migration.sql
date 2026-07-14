-- AlterTable
ALTER TABLE "CharacterNote" ADD COLUMN     "scenarioId" TEXT;

-- AddForeignKey
ALTER TABLE "CharacterNote" ADD CONSTRAINT "CharacterNote_scenarioId_fkey" FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE SET NULL ON UPDATE CASCADE;
