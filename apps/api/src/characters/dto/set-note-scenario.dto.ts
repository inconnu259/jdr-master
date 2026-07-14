import { IsUUID, ValidateIf } from 'class-validator';

export class SetNoteScenarioDto {
  // ValidateIf (pas IsOptional) : `null` désassocie explicitement (valeur significative, pas
  // absente) — seule une chaîne non-null doit être un UUID valide, cf. set-resume-fin.dto.ts.
  @ValidateIf((o) => o.scenarioId !== null)
  @IsUUID()
  scenarioId!: string | null;
}
