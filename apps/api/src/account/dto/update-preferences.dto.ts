import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import { PARTIE_SORTS, type PartieSort } from '@master-jdr/shared';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(PARTIE_SORTS)
  partiesSort?: PartieSort;

  @IsOptional()
  @IsBoolean()
  hideFinishedParties?: boolean;
}
