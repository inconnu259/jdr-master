import { IsBoolean } from 'class-validator';

export class ToggleNoteShareDto {
  @IsBoolean()
  shared!: boolean;
}
