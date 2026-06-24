-- CreateEnum
CREATE TYPE "PartieKind" AS ENUM ('ONE_SHOT', 'CAMPAGNE_LINEAIRE', 'CAMPAGNE_EPISODIQUE');

-- CreateTable
CREATE TABLE "Partie" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PartieKind" NOT NULL,
    "gameSystemId" TEXT NOT NULL,
    "mjId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,

    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

-- CreateIndex
CREATE INDEX "IDX_session_expire" ON "session"("expire");

-- AddForeignKey
ALTER TABLE "Partie" ADD CONSTRAINT "Partie_mjId_fkey" FOREIGN KEY ("mjId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
