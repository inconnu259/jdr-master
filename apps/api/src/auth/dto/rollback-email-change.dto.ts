import { IsString, MaxLength, MinLength } from 'class-validator';

export class RollbackEmailChangeDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  token!: string;
}
