-- CreateEnum
CREATE TYPE "SnapshotTrigger" AS ENUM ('LEVEL_UP', 'MJ_EDIT');

-- CreateTable
CREATE TABLE "CharacterSnapshot" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "sheetData" JSONB NOT NULL,
    "derived" JSONB NOT NULL,
    "level" INTEGER NOT NULL,
    "trigger" "SnapshotTrigger" NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterSnapshot_characterId_createdAt_idx" ON "CharacterSnapshot"("characterId", "createdAt");

-- AddForeignKey
ALTER TABLE "CharacterSnapshot" ADD CONSTRAINT "CharacterSnapshot_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
