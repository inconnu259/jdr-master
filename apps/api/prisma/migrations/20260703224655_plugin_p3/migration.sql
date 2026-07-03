-- CreateEnum
CREATE TYPE "ContentScope" AS ENUM ('BASE', 'MJ', 'PARTIE');

-- CreateTable
CREATE TABLE "GameSystem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "version" TEXT NOT NULL,

    CONSTRAINT "GameSystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentType" (
    "id" TEXT NOT NULL,
    "gameSystemId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,

    CONSTRAINT "ContentType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContentEntry" (
    "id" TEXT NOT NULL,
    "contentTypeId" TEXT NOT NULL,
    "scope" "ContentScope" NOT NULL DEFAULT 'BASE',
    "key" TEXT NOT NULL,
    "data" JSONB NOT NULL,

    CONSTRAINT "ContentEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Character" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "partieId" TEXT NOT NULL,
    "gameSystemId" TEXT NOT NULL,
    "sheetData" JSONB NOT NULL,
    "derived" JSONB NOT NULL,
    "portraitUrl" TEXT,
    "portraitCropData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Character_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ContentType_gameSystemId_key_key" ON "ContentType"("gameSystemId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "ContentEntry_contentTypeId_key_key" ON "ContentEntry"("contentTypeId", "key");

-- CreateIndex
CREATE INDEX "Character_partieId_idx" ON "Character"("partieId");

-- CreateIndex
CREATE INDEX "Character_userId_idx" ON "Character"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Character_userId_partieId_gameSystemId_key" ON "Character"("userId", "partieId", "gameSystemId");

-- AddForeignKey
ALTER TABLE "ContentType" ADD CONSTRAINT "ContentType_gameSystemId_fkey" FOREIGN KEY ("gameSystemId") REFERENCES "GameSystem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContentEntry" ADD CONSTRAINT "ContentEntry_contentTypeId_fkey" FOREIGN KEY ("contentTypeId") REFERENCES "ContentType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "Partie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Character" ADD CONSTRAINT "Character_gameSystemId_fkey" FOREIGN KEY ("gameSystemId") REFERENCES "GameSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
