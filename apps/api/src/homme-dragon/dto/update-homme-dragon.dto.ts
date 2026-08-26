import { IsObject, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { ArtefactDto } from './create-homme-dragon.dto';

/** Race jamais présente ici — immuable après création (AC4 ne porte que sur l'artefact/narratifs). */
export class UpdateHommeDragonDto {
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => ArtefactDto)
  artefact?: ArtefactDto;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  nom?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  apparence?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  caractere?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  vocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  demeure?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  avatar?: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  mondesProteges?: string;
}
