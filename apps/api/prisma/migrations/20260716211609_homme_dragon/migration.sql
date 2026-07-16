-- CreateTable
CREATE TABLE "HommeDragon" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partieId" TEXT NOT NULL,
    "gameSystemId" TEXT NOT NULL,
    "sheetData" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HommeDragon_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HommeDragon_partieId_idx" ON "HommeDragon"("partieId");

-- CreateIndex
CREATE INDEX "HommeDragon_userId_idx" ON "HommeDragon"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "HommeDragon_userId_partieId_gameSystemId_key" ON "HommeDragon"("userId", "partieId", "gameSystemId");

-- AddForeignKey
ALTER TABLE "HommeDragon" ADD CONSTRAINT "HommeDragon_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HommeDragon" ADD CONSTRAINT "HommeDragon_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "Partie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HommeDragon" ADD CONSTRAINT "HommeDragon_gameSystemId_fkey" FOREIGN KEY ("gameSystemId") REFERENCES "GameSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
