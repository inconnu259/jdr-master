-- AddForeignKey
ALTER TABLE "XpDistribution" ADD CONSTRAINT "XpDistribution_mjId_fkey" FOREIGN KEY ("mjId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
