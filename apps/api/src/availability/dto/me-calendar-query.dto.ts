import { IsDateString, Matches } from 'class-validator';

/** Query de GET /me/calendar (AD-18, Story 30.5) — même patron que GetHeatmapDto. */
export class MeCalendarQueryDto {
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'from must be YYYY-MM-DD' })
  from!: string;

  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'to must be YYYY-MM-DD' })
  to!: string;
}
