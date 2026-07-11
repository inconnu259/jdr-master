import { IsIn, IsOptional, IsString } from 'class-validator';

const NARRATIVE_FIELDS = [
  'sex',
  'age',
  'physicalTraits',
  'homeTown',
  'motivation',
  'personality',
] as const;

export class UpdateNarrativeFieldDto {
  @IsString()
  @IsIn(NARRATIVE_FIELDS)
  field!: (typeof NARRATIVE_FIELDS)[number];

  // Cf. SetSheetFieldDto (Story 6.6) : @IsOptional() enregistre la propriété dans les métadonnées
  // class-validator (évite le rejet whitelist) sans imposer de forme — accepte null pour vider un champ.
  @IsOptional()
  value: unknown;
}
