import { IsNumber, Max, Min } from 'class-validator';

/**
 * Mêmes bornes que le composant `PortraitCropper` (frontend) : `scale` est un facteur de
 * zoom (1 = taille réelle, 3 = zoom max), `offsetX`/`offsetY` un décalage en pourcentage
 * du centre. Validé côté serveur pour ne jamais faire confiance à un appel direct de
 * l'API (hors UI) qui enverrait des valeurs hors bornes ou de type incorrect.
 */
export const MIN_PORTRAIT_SCALE = 1;
export const MAX_PORTRAIT_SCALE = 3;
export const MIN_PORTRAIT_OFFSET = -100;
export const MAX_PORTRAIT_OFFSET = 100;

export class PortraitCropDataDto {
  @IsNumber()
  @Min(MIN_PORTRAIT_SCALE)
  @Max(MAX_PORTRAIT_SCALE)
  scale!: number;

  @IsNumber()
  @Min(MIN_PORTRAIT_OFFSET)
  @Max(MAX_PORTRAIT_OFFSET)
  offsetX!: number;

  @IsNumber()
  @Min(MIN_PORTRAIT_OFFSET)
  @Max(MAX_PORTRAIT_OFFSET)
  offsetY!: number;
}
