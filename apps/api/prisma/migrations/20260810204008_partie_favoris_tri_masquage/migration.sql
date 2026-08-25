-- AlterTable
ALTER TABLE "User" ADD COLUMN     "hideFinishedParties" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "partiesSort" TEXT NOT NULL DEFAULT 'urgence';

-- CreateTable
CREATE TABLE "PartieFavorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partieId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartieFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PartieFavorite_userId_partieId_key" ON "PartieFavorite"("userId", "partieId");

-- AddForeignKey
ALTER TABLE "PartieFavorite" ADD CONSTRAINT "PartieFavorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartieFavorite" ADD CONSTRAINT "PartieFavorite_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "Partie"("id") ON DELETE CASCADE ON UPDATE CASCADE;
