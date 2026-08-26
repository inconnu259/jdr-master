import { IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  text!: string;

  // Revue de code : `@IsOptional()` laisse passer un `scenarioId` envoyé explicitement comme
  // `null` (pas seulement omis) sans jamais le valider avec `@IsUUID()` — `verifyScenarioBelongsToPartie(null, ...)`
  // levait alors une erreur Prisma non gérée (500) au lieu d'un rejet propre (400). `@ValidateIf`
  // ne saute la validation que si la clé est absente (`undefined`) ; une valeur `null` explicite est
  // bien soumise à `@IsUUID()` et rejetée proprement.
  @ValidateIf((o: CreateAnnouncementDto) => o.scenarioId !== undefined)
  @IsUUID()
  scenarioId?: string;
}
