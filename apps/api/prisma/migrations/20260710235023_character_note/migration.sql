-- CreateTable
CREATE TABLE "CharacterNote" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "shared" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CharacterNote_characterId_createdAt_idx" ON "CharacterNote"("characterId", "createdAt");

-- AddForeignKey
ALTER TABLE "CharacterNote" ADD CONSTRAINT "CharacterNote_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
