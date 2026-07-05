import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, type PDFImage } from 'pdf-lib';
import type { CharacterDto } from '@master-jdr/shared';
import {
  mapToPdfFields,
  type RyuutamaSheetData,
  type RyuutamaPdfContent,
} from '@master-jdr/game-rules';
import { GameSystemService } from '../game-systems/game-system.service';
import { RYUUTAMA_ID } from '../game-systems/supported-game-systems';
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
 */
const PORTRAIT_X = 344.87;
const PORTRAIT_Y = 646.92;
const PORTRAIT_WIDTH = 188.18;
const PORTRAIT_HEIGHT = 136.48;

export type PdfExportFormat = 'editable' | '2pages';

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
    await this.embedPortrait(doc, character.portraitUrl);

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
   */
  private async embedPortrait(
    doc: PDFDocument,
    portraitUrl: string | null,
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
