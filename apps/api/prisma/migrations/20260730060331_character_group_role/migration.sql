-- CreateTable
CREATE TABLE "CharacterGroupRole" (
    "id" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "partieId" TEXT NOT NULL,
    "roleKey" TEXT NOT NULL,
    "assignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CharacterGroupRole_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CharacterGroupRole_partieId_roleKey_key" ON "CharacterGroupRole"("partieId", "roleKey");

-- CreateIndex
CREATE UNIQUE INDEX "CharacterGroupRole_partieId_characterId_key" ON "CharacterGroupRole"("partieId", "characterId");

-- AddForeignKey
ALTER TABLE "CharacterGroupRole" ADD CONSTRAINT "CharacterGroupRole_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CharacterGroupRole" ADD CONSTRAINT "CharacterGroupRole_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "Partie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
