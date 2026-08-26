import { Transform } from 'class-transformer';
import { trimIfString } from '../../common/dto/trim.transform';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateDisplayNameDto {
  @Transform(trimIfString)
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  displayName!: string;
}
