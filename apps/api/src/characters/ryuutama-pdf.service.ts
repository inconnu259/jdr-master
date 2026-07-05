import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  PDFDocument,
  clip,
  endPath,
  popGraphicsState,
  pushGraphicsState,
  rectangle,
  type PDFImage,
} from 'pdf-lib';
import type { CharacterDto } from '@master-jdr/shared';
import {
  mapToPdfFields,
  type RyuutamaSheetData,
  type RyuutamaPdfContent,
} from '@master-jdr/game-rules';
import { GameSystemService } from '../game-systems/game-system.service';
import { RYUUTAMA_ID } from '../game-systems/supported-game-systems';
import {
  MAX_PORTRAIT_OFFSET,
  MAX_PORTRAIT_SCALE,
  MIN_PORTRAIT_OFFSET,
  MIN_PORTRAIT_SCALE,
} from './dto/portrait-crop-data.dto';
import { readPortraitFile } from './portrait-storage.util';

const PDF_TEMPLATE_PATH = join(
  process.cwd(),
  'game-systems/ryuutama/assets/Ryuutama_fiche_de_voyageur_big_edit.pdf',
);

/**
 * Zone du portrait sur la page 1 du template — le cadre orné (vignes/feuilles) en haut à
 * droite de la page, au-dessus de la ligne HD/Créé le. Coordonnées **vérifiées visuellement**
 * (rendu de la page via PyMuPDF à 4x zoom, mesure par scan de pixels sur les 4 bords du cadre
 * à plusieurs positions, croisée avec les champs AcroForm voisins connus, confirmée par une
 * incrustation de vérification superposée sur le rendu réel) — bord intérieur du cadre.
 * Remplace l'estimation initiale (90×110, jamais vérifiée) très en-deçà de la vraie zone et
 * mal positionnée, cf. captures utilisateur lors de la revue de la Story 4.6.
 * Dupliquées intentionnellement dans `RYUUTAMA_PDF_PORTRAIT_WIDTH/HEIGHT` (`@master-jdr/shared`,
 * consommées par `PortraitCropper` côté web) plutôt que partagées : `@master-jdr/shared` est une
 * frontière **types uniquement, effacée au runtime** (CLAUDE.md/project-context.md) — Jest ne
 * transforme pas ce module en tant que dépendance de workspace (`node_modules`, hors `rootDir`
 * de l'API), donc un import de valeur runtime depuis ce package casse la suite `api` (confirmé :
 * `SyntaxError: Unexpected token 'export'`). Si ces valeurs changent, mettre à jour les deux
 * emplacements (et considérer construire `@master-jdr/shared` en JS si ce besoin se répète).
 */
const PORTRAIT_X = 344.87;
const PORTRAIT_Y = 646.92;
const PORTRAIT_WIDTH = 188.18;
const PORTRAIT_HEIGHT = 136.48;

export type PdfExportFormat = 'editable' | '2pages';

export interface PdfPortraitCropData {
  scale: number;
  offsetX: number;
  offsetY: number;
}

/**
 * Calcule position/taille pour dessiner une image centrée dans un cadre, en conservant son
 * ratio d'origine (équivalent PDF de `object-fit: contain` centré) — l'image ne déborde jamais
 * du cadre et n'est jamais déformée. Fonction pure, testable indépendamment de pdf-lib.
 */
export function fitCentered(
  imageWidth: number,
  imageHeight: number,
  frameX: number,
  frameY: number,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number; width: number; height: number } {
  const scale = Math.min(frameWidth / imageWidth, frameHeight / imageHeight);
  const width = imageWidth * scale;
  const height = imageHeight * scale;
  const x = frameX + (frameWidth - width) / 2;
  const y = frameY + (frameHeight - height) / 2;
  return { x, y, width, height };
}

/**
 * Calcule position/taille pour dessiner une image (surdimensionnée puis clippée au cadre, cf.
 * `embedPortrait`) selon un recadrage utilisateur `{ scale, offsetX, offsetY }` (Story 4.7,
 * même forme que `PortraitCropDataDto` / le widget `PortraitCropper` web).
 *
 * Reproduit visuellement `object-fit: contain` (base, `scale=1` montre l'image entière, jamais
 * rognée — contrairement à `cover` qui masquerait toujours une partie de l'image si son ratio ne
 * correspond pas à celui du cadre) + `transform: translate(offsetX%, offsetY%) scale(scale)`
 * (CSS, `PortraitCropper`) pour zoomer/déplacer au-delà de cette vue de base (fonction pure,
 * testable indépendamment de `pdf-lib`).
 */
export function computePdfCropDraw(
  imageWidth: number,
  imageHeight: number,
  frameX: number,
  frameY: number,
  frameWidth: number,
  frameHeight: number,
  cropData: PdfPortraitCropData,
): { x: number; y: number; width: number; height: number } {
  const containScale = Math.min(
    frameWidth / imageWidth,
    frameHeight / imageHeight,
  );
  const totalScale = containScale * cropData.scale;
  const width = imageWidth * totalScale;
  const height = imageHeight * totalScale;
  const baseX = frameX + (frameWidth - width) / 2;
  const baseY = frameY + (frameHeight - height) / 2;

  // Marge disponible avant que le cadre ne dépasse des bords de l'image mise à l'échelle — borne
  // l'offset pour ne jamais révéler de zone hors de l'image source. À scale=1 (contain), l'image
  // ne dépasse le cadre dans aucun axe : la marge est nulle, l'offset est entièrement ignoré
  // (aucun intérêt à déplacer une image déjà entièrement visible).
  const maxOffsetXPixels = Math.max(0, (width - frameWidth) / 2);
  const maxOffsetYPixels = Math.max(0, (height - frameHeight) / 2);
  // Un pourcentage CSS dans `translate()` se résout contre la boîte de layout de l'élément
  // (ici : le cadre/conteneur, taille fixe), PAS contre sa taille une fois `scale()` appliqué
  // dans le même `transform` — sinon un même `offsetX` produirait un déplacement différent
  // selon le zoom, ce qui décorrèle visuellement l'export PDF de l'aperçu web.
  const offsetXPixels = Math.min(
    maxOffsetXPixels,
    Math.max(-maxOffsetXPixels, (cropData.offsetX / 100) * frameWidth),
  );
  const offsetYPixels = Math.min(
    maxOffsetYPixels,
    Math.max(-maxOffsetYPixels, (cropData.offsetY / 100) * frameHeight),
  );

  // CSS translate Y positif = vers le bas de l'écran ; l'axe Y de pdf-lib augmente vers le haut
  // de la page — un déplacement "vers le bas" côté web se traduit par une position Y décroissante.
  return { x: baseX + offsetXPixels, y: baseY - offsetYPixels, width, height };
}

/** Un nombre fini dans `[min, max]` — rejette `NaN`/`Infinity` en plus des valeurs hors bornes. */
function isFiniteInRange(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  );
}

/**
 * Valide `scale`/`offsetX`/`offsetY` avec les mêmes bornes que `PortraitCropDataDto` (déjà
 * appliquées à l'écriture, cf. `updatePdfPortraitCrop`) — une donnée legacy/corrompue en base
 * (ou un accès direct à la colonne hors du chemin API validé) ne doit jamais atteindre
 * `computePdfCropDraw` avec un `NaN`/`Infinity`/hors bornes qui produirait une géométrie
 * dégénérée ; dégradation gracieuse vers `fitCentered` dans ce cas (cf. `embedPortrait`).
 */
function parsePdfPortraitCropData(value: unknown): PdfPortraitCropData | null {
  if (typeof value !== 'object' || value === null) return null;
  const { scale, offsetX, offsetY } = value as PdfPortraitCropData;
  if (
    !isFiniteInRange(scale, MIN_PORTRAIT_SCALE, MAX_PORTRAIT_SCALE) ||
    !isFiniteInRange(offsetX, MIN_PORTRAIT_OFFSET, MAX_PORTRAIT_OFFSET) ||
    !isFiniteInRange(offsetY, MIN_PORTRAIT_OFFSET, MAX_PORTRAIT_OFFSET)
  ) {
    return null;
  }
  return { scale, offsetX, offsetY };
}

interface ClassContentData {
  label: string;
  talents: { name: string; effect: string }[];
}

interface TypeContentData {
  label: string;
}

interface WeaponContentData {
  label: string;
  touchFormula: string;
  damageFormula: string;
}

@Injectable()
export class RyuutamaPdfService {
  private readonly logger = new Logger(RyuutamaPdfService.name);
  private templatePromise: Promise<Buffer> | null = null;

  constructor(private readonly gameSystems: GameSystemService) {}

  async fillCharacterPdf(
    character: CharacterDto,
    format: PdfExportFormat,
  ): Promise<Buffer> {
    const templateBytes = await this.loadTemplate();
    const sheetData = character.sheetData as unknown as RyuutamaSheetData;
    const derived = character.derived;
    const content = await this.resolveContent(sheetData, character.ownerPseudo);

    const fields = mapToPdfFields(sheetData, derived, content);

    const doc = await PDFDocument.load(templateBytes);
    const form = doc.getForm();
    for (const f of fields) {
      if (!f.value) continue;
      try {
        if (f.kind === 'text') {
          form.getTextField(f.field).setText(f.value);
        } else {
          form.getDropdown(f.field).select(f.value);
        }
      } catch (e) {
        this.logger.error(
          `Échec du remplissage du champ PDF "${f.field}" (kind=${f.kind}, value=${f.value})`,
          e,
        );
        throw new Error(
          `Champ PDF "${f.field}" introuvable ou incompatible sur le template Ryuutama. Vérifiez apps/api/game-systems/ryuutama/assets/README.md.`,
        );
      }
    }
    await this.embedPortrait(
      doc,
      character.portraitUrl,
      character.pdfPortraitCropData,
    );

    if (format === '2pages') {
      form.flatten();
    }
    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  /**
   * Dessine le portrait dans la zone dédiée de la page 1 (pas un champ AcroForm, cf.
   * `PORTRAIT_X/Y/WIDTH/HEIGHT`). Ne fait rien si le personnage n'a pas de portrait (AC6) —
   * la zone reste vide, cohérent avec le comportement déjà établi pour `PortraitPanel` sur le
   * web. `pdf-lib` 1.x ne sait embarquer que JPEG/PNG (`embedJpg`/`embedPng`) — pas de méthode
   * WEBP native : un portrait WEBP reste visible sur le web mais n'apparaît pas dans le PDF
   * pour ce palier (limitation documentée, pas un bug).
   *
   * Si `pdfPortraitCropData` est renseigné (Story 4.7), applique ce recadrage utilisateur au lieu
   * du centrage automatique `fitCentered` (Story 4.6, AC4 — comportement inchangé sans recadrage
   * dédié). `pdf-lib` ne sait pas dessiner une sous-région d'une image embarquée : l'image
   * surdimensionnée est dessinée puis clippée au cadre via un clip path bas niveau
   * (`pushGraphicsState`/`rectangle`/`clip`/`endPath`/`popGraphicsState`).
   */
  private async embedPortrait(
    doc: PDFDocument,
    portraitUrl: string | null,
    pdfPortraitCropData: unknown,
  ): Promise<void> {
    const portrait = await readPortraitFile(portraitUrl);
    if (!portrait) return;

    if (portrait.mime !== 'image/jpeg' && portrait.mime !== 'image/png') {
      this.logger.warn(
        `Portrait au format ${portrait.mime} non embarquable dans le PDF (pdf-lib ne supporte que JPEG/PNG) — zone laissée vide.`,
      );
      return;
    }

    let image: PDFImage;
    try {
      image =
        portrait.mime === 'image/jpeg'
          ? await doc.embedJpg(portrait.buffer)
          : await doc.embedPng(portrait.buffer);
    } catch (e) {
      // Un portrait a passé la validation par octets magiques à l'upload (Story 4.5) mais peut
      // rester rejeté par le parseur strict de pdf-lib (fichier tronqué/corrompu) — ne jamais
      // faire échouer tout l'export PDF pour ça, la zone reste simplement vide (dégradation
      // gracieuse, cohérent avec AC6).
      this.logger.warn(
        "Échec de l'intégration du portrait dans le PDF — zone laissée vide",
        e as Error,
      );
      return;
    }

    const page = doc.getPages()[0];
    const cropData = parsePdfPortraitCropData(pdfPortraitCropData);
    if (cropData) {
      const { x, y, width, height } = computePdfCropDraw(
        image.width,
        image.height,
        PORTRAIT_X,
        PORTRAIT_Y,
        PORTRAIT_WIDTH,
        PORTRAIT_HEIGHT,
        cropData,
      );
      page.pushOperators(
        pushGraphicsState(),
        rectangle(PORTRAIT_X, PORTRAIT_Y, PORTRAIT_WIDTH, PORTRAIT_HEIGHT),
        clip(),
        endPath(),
      );
      try {
        page.drawImage(image, { x, y, width, height });
      } finally {
        // Toujours dépiler l'état graphique, même si `drawImage` lève — sinon la pile
        // push/pop de la page resterait déséquilibrée pour tout ce qui serait dessiné après.
        page.pushOperators(popGraphicsState());
      }
      return;
    }

    const { x, y, width, height } = fitCentered(
      image.width,
      image.height,
      PORTRAIT_X,
      PORTRAIT_Y,
      PORTRAIT_WIDTH,
      PORTRAIT_HEIGHT,
    );
    page.drawImage(image, { x, y, width, height });
  }

  private loadTemplate(): Promise<Buffer> {
    if (!this.templatePromise) {
      this.templatePromise = readFile(PDF_TEMPLATE_PATH).catch((e) => {
        this.templatePromise = null;
        this.logger.error('Échec du chargement du template PDF Ryuutama', e);
        throw new Error(
          'Template PDF Ryuutama introuvable. Consultez apps/api/game-systems/ryuutama/assets/README.md',
        );
      });
    }
    return this.templatePromise;
  }

  private async resolveContent(
    sheetData: RyuutamaSheetData,
    ownerPseudo: string,
  ): Promise<RyuutamaPdfContent> {
    const content = await this.gameSystems.getContent(RYUUTAMA_ID);
    const classEntry = content['class']?.find(
      (c) => c.key === sheetData.classId,
    );
    const typeEntry = content['type']?.find((t) => t.key === sheetData.typeId);
    const weaponEntry = content['weaponCategory']?.find(
      (w) => w.key === sheetData.weaponCategoryId,
    );
    const classData = classEntry?.data as ClassContentData | undefined;
    const typeData = typeEntry?.data as TypeContentData | undefined;
    const weaponData = weaponEntry?.data as WeaponContentData | undefined;

    return {
      classLabel: classData?.label ?? '',
      classTalents: classData?.talents ?? [],
      typeLabel: typeData?.label ?? '',
      weaponLabel: weaponData?.label ?? '',
      weaponTouchFormula: weaponData?.touchFormula ?? '',
      weaponDamageFormula: weaponData?.damageFormula ?? '',
      ownerPseudo,
    };
  }
}
