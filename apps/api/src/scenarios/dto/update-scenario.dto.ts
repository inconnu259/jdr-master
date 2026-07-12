import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  MaxLength,
  ValidateIf,
} from 'class-validator';

export class UpdateScenarioDto {
  // ValidateIf (pas IsOptional) : `title` est NOT NULL en base — IsOptional sauterait aussi la
  // validation pour `null` (pas seulement `undefined`), laissant passer un title:null qui
  // crasherait ensuite sur la contrainte Prisma au lieu d'un 400 propre.
  @ValidateIf((o) => o.title !== undefined)
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, {
    message: 'title ne peut pas être uniquement composé d’espaces',
  })
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100000)
  dureeHeures?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10000)
  dureeSeances?: number;
}
