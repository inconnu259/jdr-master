-- AlterTable
ALTER TABLE "User" ADD COLUMN     "calendarLayersSetAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "UserCalendarLayer" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "layerKey" TEXT NOT NULL,

    CONSTRAINT "UserCalendarLayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCalendarLayer_userId_layerKey_key" ON "UserCalendarLayer"("userId", "layerKey");

-- AddForeignKey
ALTER TABLE "UserCalendarLayer" ADD CONSTRAINT "UserCalendarLayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
