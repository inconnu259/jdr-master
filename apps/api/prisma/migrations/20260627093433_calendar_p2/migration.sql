-- CreateEnum
CREATE TYPE "DaySlot" AS ENUM ('MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY');

-- CreateEnum
CREATE TYPE "RecurKind" AS ENUM ('RECURRING', 'PUNCTUAL');

-- CreateEnum
CREATE TYPE "AvailKind" AS ENUM ('UNAVAILABLE', 'AVAILABLE');

-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "VoteAnswer" AS ENUM ('YES', 'NO', 'MAYBE');

-- CreateTable
CREATE TABLE "AvailabilityDeclaration" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AvailKind" NOT NULL,
    "recurKind" "RecurKind" NOT NULL,
    "dayOfWeek" INTEGER,
    "slot" "DaySlot" NOT NULL DEFAULT 'FULL_DAY',
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilityDeclaration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SessionPoll" (
    "id" TEXT NOT NULL,
    "partieId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "scenarioRef" TEXT,
    "status" "PollStatus" NOT NULL DEFAULT 'OPEN',
    "expiresAt" TIMESTAMP(3),
    "chosenDate" TIMESTAMP(3),
    "chosenSlot" "DaySlot",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SessionPoll_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollOption" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "slot" "DaySlot" NOT NULL,

    CONSTRAINT "PollOption_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PollVote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "answer" "VoteAnswer" NOT NULL,

    CONSTRAINT "PollVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AvailabilityDeclaration_userId_expiresAt_idx" ON "AvailabilityDeclaration"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "SessionPoll_partieId_status_idx" ON "SessionPoll"("partieId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PollVote_optionId_userId_key" ON "PollVote"("optionId", "userId");

-- AddForeignKey
ALTER TABLE "AvailabilityDeclaration" ADD CONSTRAINT "AvailabilityDeclaration_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SessionPoll" ADD CONSTRAINT "SessionPoll_partieId_fkey" FOREIGN KEY ("partieId") REFERENCES "Partie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollOption" ADD CONSTRAINT "PollOption_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "SessionPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "SessionPoll"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "PollOption"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PollVote" ADD CONSTRAINT "PollVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
