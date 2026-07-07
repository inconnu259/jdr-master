import { IsNotEmpty, IsNotEmptyObject, IsString } from 'class-validator';

export class CreateCharacterDto {
  @IsString()
  @IsNotEmpty()
  gameSystemId: string;

  /**
   * `IsNotEmptyObject()` rejette déjà null, les tableaux et `{}` (cf. son implémentation :
   * `isObject()` exclut explicitement les tableaux, puis vérifie qu'il reste au moins une clé
   * propre) — pas besoin d'un validateur custom pour ça.
   */
  @IsNotEmptyObject()
  sheetData: Record<string, unknown>;
}
