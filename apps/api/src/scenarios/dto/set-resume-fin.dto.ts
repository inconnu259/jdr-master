import { IsString } from 'class-validator';

export class SetResumeFinDto {
  @IsString()
  resumeFin!: string;
}
