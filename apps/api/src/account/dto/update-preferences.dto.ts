import { IsBoolean, IsIn, IsOptional } from 'class-validator';
import {
  CHARACTER_SORTS,
  LIST_VIEW_MODES,
  PARTIE_SORTS,
  type CharacterSort,
  type ListViewMode,
  type PartieSort,
} from '@master-jdr/shared';

export class UpdatePreferencesDto {
  @IsOptional()
  @IsIn(PARTIE_SORTS)
  partiesSort?: PartieSort;

  @IsOptional()
  @IsBoolean()
  hideFinishedParties?: boolean;

  @IsOptional()
  @IsIn(LIST_VIEW_MODES)
  partiesViewMode?: ListViewMode;

  @IsOptional()
  @IsIn(LIST_VIEW_MODES)
  charactersViewMode?: ListViewMode;

  @IsOptional()
  @IsIn(CHARACTER_SORTS)
  charactersSort?: CharacterSort;
}
