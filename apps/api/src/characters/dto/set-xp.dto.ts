import { IsInt, Min } from 'class-validator';

export class SetXpDto {
  @IsInt()
  @Min(0)
  value!: number;
}
