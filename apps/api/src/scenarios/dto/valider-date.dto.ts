import { IsDateString } from 'class-validator';

export class ValiderDateDto {
  @IsDateString()
  date!: string;
}
