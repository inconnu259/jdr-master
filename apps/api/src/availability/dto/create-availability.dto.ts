import { IsDateString, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import type { AvailKind, DaySlot, RecurKind } from '@master-jdr/shared';

const AVAIL_KINDS: AvailKind[] = ['UNAVAILABLE', 'AVAILABLE'];
const RECUR_KINDS: RecurKind[] = ['RECURRING', 'PUNCTUAL'];
const DAY_SLOTS: DaySlot[] = ['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY'];

export class CreateAvailabilityDto {
  @IsIn(AVAIL_KINDS)
  kind!: AvailKind;

  @IsIn(RECUR_KINDS)
  recurKind!: RecurKind;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek?: number | null;

  @IsIn(DAY_SLOTS)
  slot!: DaySlot;

  @IsOptional()
  @IsDateString()
  startDate?: string | null;

  @IsOptional()
  @IsDateString()
  endDate?: string | null;

  @IsDateString()
  expiresAt!: string;
}
