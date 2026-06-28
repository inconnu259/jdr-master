-- AlterTable
ALTER TABLE "Partie" ADD COLUMN     "nextSessionDate" TIMESTAMP(3),
ADD COLUMN     "nextSessionSlot" "DaySlot";
