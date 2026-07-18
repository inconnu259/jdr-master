import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import type { CharacterDto } from '@master-jdr/shared';
import { mapEquipmentToPdfFields, type RyuutamaSheetData } from '@master-jdr/game-rules';

const PDF_TEMPLATE_PATH = join(
  process.cwd(),
  'game-systems/ryuutama/assets/Ryuutama-fiche_equipement_edit.pdf',
);

@Injectable()
export class EquipmentPdfService {
  private readonly logger = new Logger(EquipmentPdfService.name);
  private templatePromise: Promise<Buffer> | null = null;

  async fillEquipmentPdf(character: CharacterDto): Promise<Buffer> {
    const templateBytes = await this.loadTemplate();
    const sheetData = character.sheetData as unknown as RyuutamaSheetData;

    const fields = mapEquipmentToPdfFields({
      ownerPseudo: character.ownerPseudo,
      characterName: sheetData.narrative?.name ?? '',
      encombrementLimit: character.derived.Encombrement,
      equipment: {
        individual: (sheetData.equipment?.individual ?? []).map((i) => ({
          name: i.name,
          weight: i.weight,
          price: i.price,
          effect: i.effect,
        })),
        contenants: (sheetData.equipment?.contenants ?? []).map((c) => ({
          name: c.name,
          weight: c.weight,
          price: c.price,
          effect: c.effect,
        })),
        animaux: (sheetData.equipment?.animaux ?? []).map((a) => ({
          name: a.name,
          price: a.price,
          effect: a.effect,
        })),
      },
    });

    const doc = await PDFDocument.load(templateBytes);
    const form = doc.getForm();
    for (const f of fields) {
      if (!f.value) continue;
      try {
        form.getTextField(f.field).setText(f.value);
      } catch (e) {
        this.logger.error(
          `Échec du remplissage du champ PDF "${f.field}" (value=${f.value})`,
          e,
        );
        // Deux causes distinctes partagent ce catch — champ AcroForm introuvable/incompatible sur
        // le template (getTextField) OU valeur contenant un caractère non encodable en WinAnsi par
        // pdf-lib (setText) — même convention que HommeDragonPdfService (Story 10.5, revue de code).
        throw new Error(
          `Champ PDF "${f.field}" introuvable/incompatible sur le template équipement Ryuutama, ou valeur non encodable. Vérifiez apps/api/game-systems/ryuutama/assets/README.md.`,
        );
      }
    }

    const bytes = await doc.save();
    return Buffer.from(bytes);
  }

  private loadTemplate(): Promise<Buffer> {
    if (!this.templatePromise) {
      this.templatePromise = readFile(PDF_TEMPLATE_PATH).catch((e) => {
        this.templatePromise = null;
        this.logger.error('Échec du chargement du template PDF équipement Ryuutama', e);
        throw new Error(
          'Template PDF équipement Ryuutama introuvable. Consultez apps/api/game-systems/ryuutama/assets/README.md',
        );
      });
    }
    return this.templatePromise;
  }
}
