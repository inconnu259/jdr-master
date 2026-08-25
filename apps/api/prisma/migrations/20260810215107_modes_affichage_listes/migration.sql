-- AlterTable
ALTER TABLE "User" ADD COLUMN     "charactersSort" TEXT NOT NULL DEFAULT 'partie',
ADD COLUMN     "charactersViewMode" TEXT NOT NULL DEFAULT 'medium',
ADD COLUMN     "partiesViewMode" TEXT NOT NULL DEFAULT 'medium';
