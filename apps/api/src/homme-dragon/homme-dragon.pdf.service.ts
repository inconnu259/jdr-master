import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument } from 'pdf-lib';
import type { HommeDragonDto, HommeDragonRace } from '@master-jdr/shared';
import { mapHommeDragonToPdfFields } from '@master-jdr/game-rules';
import { GameSystemService } from '../game-systems/game-system.service';
import { RYUUTAMA_ID } from '../game-systems/supported-game-systems';

const PDF_TEMPLATE_PATH = join(
  process.cwd(),
  'game-systems/ryuutama/assets/Ryuutama_fiche_homme-dragon_big_edit.pdf',
);

/** Dupliquée depuis `homme-dragon-sheet.ts` (frontend) plutôt que partagée : `@master-jdr/shared`
 * est une frontière types-only, effacée au runtime (même contrainte déjà documentée dans
 * `ryuutama-pdf.service.ts` pour `RYUUTAMA_PDF_PORTRAIT_WIDTH/HEIGHT`). */
const RACE_LABELS: Record<HommeDragonRace, string> = {
  DRAGON_VERT: 'Dragon Vert',
  DRAGON_BLEU: 'Dragon Bleu',
  DRAGON_ROUGE: 'Dragon Rouge',
  DRAGON_NOIR: 'Dragon Noir',
};

@Injectable()
export class HommeDragonPdfService {
  private readonly logger = new Logger(HommeDragonPdfService.name);
  private templatePromise: Promise<Buffer> | null = null;

  constructor(private readonly gameSystems: GameSystemService) {}

  async fillHommeDragonPdf(hommeDragon: HommeDragonDto, mjPseudo: string): Promise<Buffer> {
    const templateBytes = await this.loadTemplate();
    const eveilPowerLabels = await this.resolveEveilPowerLabels();

    const fields = mapHommeDragonToPdfFields(hommeDragon, {
      raceLabel: RACE_LABELS[hommeDragon.sheetData.race],
      mjPseudo,
      eveilPowerLabels,
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
        // Revue de code : deux causes distinctes partagent ce catch — champ AcroForm
        // introuvable/incompatible sur le template (getTextField) OU valeur contenant un
        // caractère non encodable en WinAnsi par pdf-lib (setText, ex. `WinAnsi cannot encode`,
        // constaté en test manuel) — le message couvre les deux, la cause précise reste dans le
        // log ci-dessus.
        throw new Error(
          `Champ PDF "${f.field}" introuvable/incompatible sur le template Homme Dragon, ou valeur non encodable. Vérifiez apps/api/game-systems/ryuutama/assets/README.md.`,
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
        this.logger.error('Échec du chargement du template PDF Homme Dragon', e);
        throw new Error(
          'Template PDF Homme Dragon introuvable. Consultez apps/api/game-systems/ryuutama/assets/README.md',
        );
      });
    }
    return this.templatePromise;
  }

  private async resolveEveilPowerLabels(): Promise<Record<string, string>> {
    const content = await this.gameSystems.getContent(RYUUTAMA_ID);
    const labels: Record<string, string> = {};
    for (const entry of content['eveilPower'] ?? []) {
      const label = (entry.data as { label?: string })?.label;
      if (label) labels[entry.key] = label;
    }
    return labels;
  }
}
