-- AlterTable
-- Colonne NOT NULL sur une table déjà peuplée : ADD nullable puis backfill depuis `pseudo`
-- avant de contraindre NOT NULL, pour éviter l'échec que produirait un ADD COLUMN NOT NULL direct.
ALTER TABLE "User" ADD COLUMN     "displayName" TEXT;
UPDATE "User" SET "displayName" = "pseudo" WHERE "displayName" IS NULL;
ALTER TABLE "User" ALTER COLUMN "displayName" SET NOT NULL;
