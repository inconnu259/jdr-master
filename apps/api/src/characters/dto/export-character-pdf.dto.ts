import { IsIn } from 'class-validator';

export class ExportCharacterPdfDto {
  @IsIn(['editable', '2pages'])
  format: 'editable' | '2pages';
}
