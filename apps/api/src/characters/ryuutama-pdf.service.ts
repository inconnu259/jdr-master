import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import type { CharacterDto } from '@master-jdr/shared';
import {
  mapToPdfFields,
  type RyuutamaSheetData,
  type RyuutamaPdfContent,
} from '@master-jdr/game-rules';
import { GameSystemService } from '../game-systems/game-system.service';
import { RYUUTAMA_ID } from '../game-systems/supported-game-systems';

const PDF_TEMPLATE_PATH = join(
  process.cwd(),
  'game-systems/ryuutama/assets/Ryuutama_fiche_de_voyageur_big_edit.pdf',
);

export type PdfExportFormat = 'editable' | '2pages';

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
    const content = await this.resolveContent(sheetData);

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
    if (format === '2pages') {
      form.flatten();
    }
    const bytes = await doc.save();
    return Buffer.from(bytes);
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
    };
  }
}
