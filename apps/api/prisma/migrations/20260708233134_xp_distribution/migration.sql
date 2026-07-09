-- AlterTable
ALTER TABLE "Character" ADD COLUMN     "xp" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "XpDistribution" (
    "id" TEXT NOT NULL,
    "partieId" TEXT NOT NULL,
    "mjId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "XpDistribution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "XpDistributionEntry" (
    "id" TEXT NOT NULL,
    "distributionId" TEXT NOT NULL,
    "characterId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "isBonus" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "XpDistributionEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "XpDistribution_partieId_createdAt_idx" ON "XpDistribution"("partieId", "createdAt");

-- AddForeignKey
ALTER TABLE "XpDistribution" ADD CONSTRAINT "XpDistribution_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "Partie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpDistributionEntry" ADD CONSTRAINT "XpDistributionEntry_distributionId_fkey" FOREIGN KEY ("distributionId") REFERENCES "XpDistribution"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "XpDistributionEntry" ADD CONSTRAINT "XpDistributionEntry_characterId_fkey" FOREIGN KEY ("characterId") REFERENCES "Character"("id") ON DELETE CASCADE ON UPDATE CASCADE;
