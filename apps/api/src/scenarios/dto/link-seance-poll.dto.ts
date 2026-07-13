import { IsUUID } from 'class-validator';

export class LinkSeancePollDto {
  @IsUUID()
  pollId!: string;
}
