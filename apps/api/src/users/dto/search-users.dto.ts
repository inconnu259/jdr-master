import { IsString, MaxLength, MinLength } from 'class-validator';

export class SearchUsersDto {
  @IsString()
  @MinLength(1)
  @MaxLength(254)
  q!: string;
}
