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
import { RYUUTAMA_ID } from './supported-game-systems';

const RYUUTAMA_DATA_DIR = join(process.cwd(), 'game-systems/ryuutama/data');

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

  constructor(private readonly prisma: PrismaService) {}

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
}
