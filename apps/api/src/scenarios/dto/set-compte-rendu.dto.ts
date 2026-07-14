import { IsString, MaxLength } from 'class-validator';

export class SetCompteRenduDto {
  @IsString()
  @MaxLength(5000)
  compteRendu!: string;
}
