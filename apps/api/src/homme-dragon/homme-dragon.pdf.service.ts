import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { HommeDragonDto, HommeDragonRace } from '@master-jdr/shared';
import { availableSouffles, mapHommeDragonToPdfFields } from '@master-jdr/game-rules';
import type { SouffleCatalogEntry } from '@master-jdr/game-rules';
import { GameSystemService } from '../game-systems/game-system.service';
import { RYUUTAMA_ID } from '../game-systems/supported-game-systems';
import type { HommeDragonPdfFormat } from './dto/export-homme-dragon-pdf.dto';
import { drawSoufflesPages, sanitizeWinAnsi } from './homme-dragon-souffles-pages';

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

  async fillHommeDragonPdf(
    hommeDragon: HommeDragonDto,
    mjPseudo: string,
    format: HommeDragonPdfFormat,
  ): Promise<Buffer> {
    const templateBytes = await this.loadTemplate();
    const catalogues = await this.resolveCatalogues(hommeDragon.sheetData.artefact.key);

    const fields = mapHommeDragonToPdfFields(hommeDragon, {
      raceLabel: RACE_LABELS[hommeDragon.sheetData.race],
      mjPseudo,
      eveilPowerLabels: catalogues.eveilPowerLabels,
      artefactLabel: catalogues.artefactLabel,
    });

    const doc = await PDFDocument.load(templateBytes);
    const form = doc.getForm();
    // Police par défaut des champs du formulaire (Helvetica, WinAnsi) : sert à remplacer tout
    // caractère non encodable — un nom ou un libellé exotique ne doit jamais faire échouer l'export.
    const fieldFont = await doc.embedFont(StandardFonts.Helvetica);
    for (const f of fields) {
      if (!f.value) continue;
      try {
        form.getTextField(f.field).setText(sanitizeWinAnsi(f.value, fieldFont));
      } catch (e) {
        this.logger.error(`Échec du remplissage du champ PDF "${f.field}" (value=${f.value})`, e);
        throw new Error(
          `Champ PDF "${f.field}" introuvable/incompatible sur le template Homme Dragon. Vérifiez apps/api/game-systems/ryuutama/assets/README.md.`,
        );
      }
    }

    // Les souffles ne tiennent pas dans le gabarit (4 cases de réserve seulement) : pages ajoutées
    // après lui, identiques dans les deux formats. Aucune page si le catalogue est vide.
    const groups = availableSouffles(
      hommeDragon.derived.level,
      hommeDragon.sheetData.race,
      catalogues.souffles,
    );
    await drawSoufflesPages(doc, groups);

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
        this.logger.error('Échec du chargement du template PDF Homme Dragon', e);
        throw new Error(
          'Template PDF Homme Dragon introuvable. Consultez apps/api/game-systems/ryuutama/assets/README.md',
        );
      });
    }
    return this.templatePromise;
  }

  /** Catalogues Ryuutama utiles à l'export, résolus en un seul `getContent()` : libellés des
   * pouvoirs d'éveil, libellé de l'artefact, entrées `souffle` (jamais `eveilPower` pour ces
   * dernières — éveils et souffles restent distincts). */
  private async resolveCatalogues(artefactKey: string): Promise<{
    eveilPowerLabels: Record<string, string>;
    artefactLabel: string | undefined;
    souffles: SouffleCatalogEntry[];
  }> {
    const content = await this.gameSystems.getContent(RYUUTAMA_ID);
    const eveilPowerLabels: Record<string, string> = {};
    for (const entry of content['eveilPower'] ?? []) {
      const label = (entry.data as { label?: string })?.label;
      if (label) eveilPowerLabels[entry.key] = label;
    }
    const artefactEntry = (content['hommeDragonArtefact'] ?? []).find((e) => e.key === artefactKey);
    const artefactLabel =
      (artefactEntry?.data as { label?: string } | undefined)?.label || undefined;
    return { eveilPowerLabels, artefactLabel, souffles: content['souffle'] ?? [] };
  }
}
