import { Transform } from 'class-transformer';
import { trimIfString } from '../../common/dto/trim.transform';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** Jamais de champ `weight` — un animal n'a jamais de poids (FR8), absence structurelle. */
export class CreateAnimalDto {
  @IsString()
  @Transform(trimIfString)
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @Transform(trimIfString)
  @MaxLength(50)
  price?: string;

  @IsOptional()
  @IsString()
  @Transform(trimIfString)
  @MaxLength(300)
  effect?: string;
}
