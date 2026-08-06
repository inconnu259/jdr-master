import { IsIn } from 'class-validator';
import { THEMES, type Theme } from '@master-jdr/shared';

export class UpdateThemeDto {
  @IsIn(THEMES)
  theme!: Theme;
}
