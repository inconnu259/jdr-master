import {
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
} from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Prisma } from '@prisma/client';
import type {
  GameSystemDto,
  GameSystemSchemaDto,
  GameSystemContentDto,
} from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { RYUUTAMA_ID } from './supported-game-systems';

const RYUUTAMA_DATA_DIR = join(process.cwd(), 'game-systems/ryuutama/data');
const ASSETS_DIR = join(process.cwd(), 'game-systems/ryuutama/assets');

interface ReferenceAsset {
  file: string;
  access: 'member' | 'mj';
}

/**
 * Table de correspondance exhaustive clé → fichier/accès pour les fiches de référence Ryuutama
 * servies telles quelles (AD-5, Story 12.1). Les 4 fichiers de `assets/` hors de cette table
 * (voyageur, homme-dragon, équipement, notes) sont déjà couverts par d'autres services d'export
 * (`RyuutamaPdfService`/`HommeDragonPdfService`/`EquipmentPdfService`/`NotesPdfService`) — ne
 * jamais les dupliquer ici. Toute clé absente de cette table renvoie un 404 explicite
 * (`getAssetFile`), jamais un fallback silencieux.
 */
const REFERENCE_ASSETS: Record<string, ReferenceAsset> = {
  journal: { file: 'Ryuutama_journal.pdf', access: 'member' },
  carte: { file: 'Ryuutama_carte.pdf', access: 'member' },
  evenements: { file: 'Ryuutama_evenements_edit.pdf', access: 'mj' },
  monde: { file: 'Ryuutama_fiche_de_monde_edit.pdf', access: 'mj' },
  monstre: { file: 'Ryuutama_fiche_de_monstre_edit.pdf', access: 'mj' },
  ville: { file: 'Ryuutama_fiche_de_ville_edit.pdf', access: 'mj' },
  provisions: { file: 'Ryuutama_fiche_de_provisions.pdf', access: 'mj' },
  'objectif-chasse': { file: 'Ryuutama_objectif_chasse_edit.pdf', access: 'mj' },
  'objectif-quete': { file: 'Ryuutama_objectif_quête_edit.pdf', access: 'mj' },
  'objectif-voyage': { file: 'Ryuutama_objectif_voyage_edit.pdf', access: 'mj' },
  'oeuf-de-bataille': { file: 'Ryuutama_oeuf_de_bataille.pdf', access: 'mj' },
  structure: { file: 'Ryuutama_structure_edit.pdf', access: 'mj' },
};

interface ContentTypeSeed {
  key: string;
  label: string;
  file: string;
}

const CONTENT_TYPES: ContentTypeSeed[] = [
  { key: 'class', label: 'Classe', file: 'classes.json' },
  { key: 'type', label: 'Type', file: 'types.json' },
  {
    key: 'attributePattern',
    label: "Pattern d'attributs",
    file: 'attribute-patterns.json',
  },
  {
    key: 'weaponCategory',
    label: "Catégorie d'arme favorite",
    file: 'weapon-categories.json',
  },
  {
    key: 'immunityState',
    label: 'État (immunité)',
    file: 'immunity-states.json',
  },
  { key: 'season', label: 'Saison', file: 'seasons.json' },
  { key: 'landscape', label: 'Paysage/climat', file: 'landscapes.json' },
  {
    key: 'hommeDragonArtefact',
    label: 'Artefact (Homme Dragon)',
    file: 'homme-dragon-artefacts.json',
  },
  {
    key: 'eveilPower',
    label: "Pouvoir d'éveil",
    file: 'eveil-powers.json',
  },
];

@Injectable()
export class GameSystemService implements OnApplicationBootstrap {
  private readonly logger = new Logger(GameSystemService.name);

  /**
   * Le contenu (`ContentType`/`ContentEntry`) n'est écrit qu'une fois, au bootstrap
   * (`seedRyuutama()`, appelé depuis `onApplicationBootstrap`) — aucun endpoint ne le modifie à
   * l'exécution. Le mettre en cache évite une requête DB (avec jointure) à chaque appel de
   * `getContent()`, notamment sur le chemin chaud de création de personnage
   * (`CharacterService.create()` → `buildRyuutamaCatalog()`).
   */
  private readonly contentCache = new Map<string, GameSystemContentDto>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedRyuutama();
  }

  async seedRyuutama(): Promise<void> {
    const entriesByType: Record<string, Record<string, unknown>[]> = {};
    for (const contentType of CONTENT_TYPES) {
      const filePath = join(RYUUTAMA_DATA_DIR, contentType.file);
      let raw: string;
      try {
        raw = await readFile(filePath, 'utf-8');
        const parsed: unknown = JSON.parse(raw);
        if (!Array.isArray(parsed)) {
          throw new Error(`${contentType.file} doit contenir un tableau`);
        }
        for (const entry of parsed as Record<string, unknown>[]) {
          if (typeof entry?.key !== 'string' || entry.key.length === 0) {
            throw new Error(
              `${contentType.file} : chaque entrée doit avoir une "key" (string non vide)`,
            );
          }
        }
        entriesByType[contentType.key] = parsed as Record<string, unknown>[];
      } catch (e) {
        this.logger.error(`Échec du chargement de ${contentType.file}`, e);
        throw new Error(
          'Seed Ryuutama introuvable ou mal formé. Consultez apps/api/game-systems/ryuutama/README.md',
        );
      }
    }

    await this.prisma.gameSystem.upsert({
      where: { id: RYUUTAMA_ID },
      update: { name: 'Ryuutama', version: '1.0.0' },
      create: { id: RYUUTAMA_ID, name: 'Ryuutama', version: '1.0.0' },
    });

    for (const contentType of CONTENT_TYPES) {
      const ct = await this.prisma.contentType.upsert({
        where: {
          gameSystemId_key: {
            gameSystemId: RYUUTAMA_ID,
            key: contentType.key,
          },
        },
        update: { label: contentType.label },
        create: {
          gameSystemId: RYUUTAMA_ID,
          key: contentType.key,
          label: contentType.label,
        },
      });

      for (const entry of entriesByType[contentType.key]) {
        const key = entry.key as string;
        await this.prisma.contentEntry.upsert({
          where: { contentTypeId_key: { contentTypeId: ct.id, key } },
          update: { data: entry as Prisma.InputJsonValue },
          create: {
            contentTypeId: ct.id,
            key,
            data: entry as Prisma.InputJsonValue,
          },
        });
      }
    }
  }

  async findAll(): Promise<GameSystemDto[]> {
    return this.prisma.gameSystem.findMany({
      select: { id: true, name: true, version: true },
    });
  }

  async getContent(id: string): Promise<GameSystemContentDto> {
    if (id !== RYUUTAMA_ID) {
      throw new NotFoundException('Système de jeu introuvable');
    }
    const cached = this.contentCache.get(id);
    if (cached) return cached;

    const contentTypes = await this.prisma.contentType.findMany({
      where: { gameSystemId: id },
      include: { entries: { where: { scope: 'BASE' } } },
    });
    const result: GameSystemContentDto = {};
    for (const ct of contentTypes) {
      result[ct.key] = ct.entries.map((e) => ({ key: e.key, data: e.data }));
    }
    this.contentCache.set(id, result);
    return result;
  }

  async getSchema(id: string): Promise<GameSystemSchemaDto> {
    // Vérifie d'abord l'existence en base (comme findAll()) — distinct du cas "existe en base
    // mais aucun schéma codé pour ce système" ci-dessous, pour ne pas confondre les deux causes.
    const gameSystem = await this.prisma.gameSystem.findUnique({
      where: { id },
    });
    if (!gameSystem) {
      throw new NotFoundException('Système de jeu introuvable');
    }
    // Seul Ryuutama a un schéma codé en dur aujourd'hui — pas encore de registre de plugin par
    // système (prévu Palier 6/7 avec Conte de Minuit/Draconis, cf. deferred-work.md). Un système
    // présent en base sans schéma implémenté reste un 404, mais pour une raison différente de
    // "introuvable" — ce n'est PAS une divergence avec findAll() (qui, lui, liste tout ce qui est
    // en base) : c'est une limitation connue et assumée tant que ce registre n'existe pas.
    if (id !== RYUUTAMA_ID) {
      throw new NotFoundException(
        'Aucun schéma implémenté pour ce système de jeu',
      );
    }
    return {
      sheetSchema: {
        classId: { type: 'string' },
        specialtyTypeId: { type: 'string', optional: true },
        typeId: { type: 'string' },
        attributes: {
          type: 'object',
          fields: ['AGI', 'ESP', 'INT', 'VIG'],
        },
        weaponCategoryId: { type: 'string' },
        fetiqueObject: { type: 'string', optional: true },
        equipment: { type: 'object', optional: true },
        narrative: { type: 'object', optional: true },
      },
      creationSteps: [
        { key: 'classId', label: 'Classe' },
        { key: 'typeId', label: 'Type' },
        { key: 'attributes', label: 'Attributs' },
        { key: 'weaponCategoryId', label: 'Arme favorite' },
        { key: 'fetiqueObject', label: 'Objet fétiche' },
        { key: 'equipment', label: 'Équipement' },
        { key: 'narrative', label: 'Narratif' },
        { key: 'portrait', label: 'Portrait' },
      ],
    };
  }

  /**
   * Fiche de référence Ryuutama servie telle quelle (AD-5, Story 12.1) — aucune donnée de
   * campagne injectée, contrairement aux services d'export PDF (`RyuutamaPdfService` et
   * consorts). Aucun cache : ces fichiers sont volumineux et rarement demandés, contrairement au
   * contenu structuré de `getContent()` sur le chemin chaud de création de personnage.
   */
  async getAssetFile(
    partieId: string,
    systemId: string,
    key: string,
    userId: string,
  ): Promise<Buffer> {
    if (systemId !== RYUUTAMA_ID) {
      throw new NotFoundException('Système de jeu introuvable');
    }
    // `Object.hasOwn` (pas un simple `!REFERENCE_ASSETS[key]`) : une clé comme `__proto__` ou
    // `constructor` renverrait sinon une valeur héritée truthy (`Object.prototype`), contournant
    // le 404 et provoquant un crash plus loin (`asset.file` undefined) — cf. revue de code.
    if (!Object.hasOwn(REFERENCE_ASSETS, key)) {
      throw new NotFoundException('Fiche introuvable');
    }
    const asset = REFERENCE_ASSETS[key];

    if (asset.access === 'member') {
      await this.parties.getViewable(partieId, userId);
    } else {
      await this.parties.getOwned(partieId, userId);
    }

    return readFile(join(ASSETS_DIR, asset.file)).catch((e) => {
      this.logger.error(
        `Échec du chargement de la fiche de référence "${key}" (${asset.file})`,
        e,
      );
      throw new Error(
        `Fiche de référence Ryuutama "${key}" introuvable sur le disque. Consultez apps/api/game-systems/ryuutama/assets/README.md`,
      );
    });
  }
}
