import { IsEnum, IsUUID } from 'class-validator';
import type { VoteAnswer } from '@master-jdr/shared';

export class CastVoteDto {
  @IsUUID()
  optionId!: string;

  @IsEnum(['YES', 'NO', 'MAYBE'])
  answer!: VoteAnswer;
}
