import { IsNotEmpty, IsObject, IsString } from 'class-validator';

export class CreateCharacterDto {
  @IsString()
  @IsNotEmpty()
  gameSystemId: string;

  @IsObject()
  @IsNotEmpty()
  sheetData: Record<string, unknown>;
}
