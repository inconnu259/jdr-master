import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  ValidateNested,
} from 'class-validator';
import type { DaySlot } from '@master-jdr/shared';

// Copie exacte de la validation de PollOptionInput (apps/api/src/poll/dto/create-poll.dto.ts) —
// pas de scenarioRef ici, la séance est déjà l'identifiant explicite via l'URL (Story 8.7).
class SeancePollOptionInput {
  @IsDateString()
  date!: string;

  @IsEnum(['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY'])
  slot!: DaySlot;
}

export class CreateSeancePollDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => SeancePollOptionInput)
  options!: SeancePollOptionInput[];
}
