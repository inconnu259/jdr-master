import { Transform } from 'class-transformer';
import { trimIfString } from '../../common/dto/trim.transform';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateCharacterNoteDto {
  @IsString()
  @Transform(trimIfString)
  @IsNotEmpty()
  @MaxLength(5000)
  text!: string;
}
