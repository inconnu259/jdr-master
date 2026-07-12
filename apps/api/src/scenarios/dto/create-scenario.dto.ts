import {
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  MinLength,
  MaxLength,
} from 'class-validator';

export class CreateScenarioDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  @Matches(/\S/, {
    message: 'title ne peut pas être uniquement composé d’espaces',
  })
  title!: string;

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
