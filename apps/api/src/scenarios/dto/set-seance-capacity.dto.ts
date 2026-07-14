import { IsInt, Min } from 'class-validator';

export class SetSeanceCapacityDto {
  @IsInt()
  @Min(1)
  inscriptionMin!: number;

  @IsInt()
  @Min(1)
  inscriptionMax!: number;
}
