import { IsUUID } from 'class-validator';

export class ChooseDateDto {
  @IsUUID()
  optionId!: string;
}
