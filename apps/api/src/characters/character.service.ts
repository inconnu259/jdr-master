import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type {
  CharacterDto,
  CharacterNoteDto,
  CharacterSnapshotDto,
  SetSheetFieldResultDto,
} from '@master-jdr/shared';
import {
  computeDerived,
  validate,
  pendingLevels,
  LEVEL_TABLE,
  type CapabilityType,
  type RyuutamaCatalog,
  type RyuutamaSheetData,
} from '@master-jdr/game-rules';
import { PartiesService } from '../parties/parties.service';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { GameSystemService } from '../game-systems/game-system.service';
import { EmailService } from '../email/email.service';
import { SUPPORTED_GAME_SYSTEMS } from '../game-systems/supported-game-systems';
import { CreateCharacterDto } from './dto/create-character.dto';
import type { CreateLevelUpDto } from './dto/create-level-up.dto';
import type { CreateInventoryItemDto } from './dto/create-inventory-item.dto';
import type { UpdateInventoryItemDto } from './dto/update-inventory-item.dto';
import type { CreateCharacterNoteDto } from './dto/create-character-note.dto';
import type { SetSheetFieldDto } from './dto/set-sheet-field.dto';
import type { UpdateNarrativeFieldDto } from './dto/update-narrative-field.dto';
import type { PortraitCropDataDto } from './dto/portrait-crop-data.dto';
import {
  detectImageMime,
  extensionForImageMime,
  type DetectedImageMime,
} from './image-mime.util';
import {
  PORTRAITS_DIR,
  PORTRAITS_URL_PREFIX,
  extractPortraitFilename,
  readPortraitFile,
} from './portrait-storage.util';

/**
 * Mapping type de capacité (`CapabilityType`) → clé de contenu seedé (`GameSystemService`
 * `CONTENT_TYPES`) permettant de valider `params.key` à l'application d'une montée de niveau.
 * `attribute`/`legendary-journey` n'ont pas de contenu seedé (validés autrement / sans params).
 */
const CONTENT_KEY_BY_CAPABILITY: Record<string, string> = {
  landscape: 'landscape',
  immunity: 'immunityState',
  class: 'class',
  type: 'type',
  'dragon-protection': 'season',
};

/**
 * Défense en profondeur (revue de code Story 6.4) : `equipment.individual` ne devrait jamais
 * contenir d'entrées `string` legacy à ce stade (la migration one-off `migrateInventoryFormat`
 * doit tourner avant tout redémarrage de l'API sur ce changement), mais si un personnage y
 * échappe malgré tout (échec partiel de migration, ordre de déploiement incorrect), un
 * `addInventoryItem` qui spreadrait ces entrées telles quelles produirait un tableau mixte
 * (string + InventoryItem) qui casse le rendu frontend et corrompt `totalWeight()` (NaN). Chaque
 * méthode du service normalise donc systématiquement avant de lire/écrire — jamais de tableau
 * mixte persisté, quel que soit l'état d'entrée.
 */
type InventoryItemEntry = NonNullable<
  RyuutamaSheetData['equipment']
>['individual'][number];

function normalizeInventoryIndividual(
  individual: (InventoryItemEntry | string)[] | undefined,
): InventoryItemEntry[] {
  return (individual ?? []).map((item) =>
    typeof item === 'string'
      ? { id: randomUUID(), name: item, weight: 0, addedBy: 'player' as const }
      : item,
  );
}

/**
 * Écrit `value` au chemin pointé par `path` (notation à points, ex. "attributes.VIG" ou
 * "equipment.individual.2") dans `obj`, en créant les structures intermédiaires manquantes
 * (objet ou tableau selon que le segment suivant est numérique). Utilisé exclusivement par
 * `setSheetField` (AD-6) — mécanisme générique volontairement minimal, pas de validation de
 * forme ici (délégué à `validate('mj', ...)`, consultatif, cf. AD-7).
 */
const FORBIDDEN_PATH_SEGMENTS = new Set([
  '__proto__',
  'constructor',
  'prototype',
]);

function setByPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split('.');
  if (segments.some((seg) => FORBIDDEN_PATH_SEGMENTS.has(seg))) {
    throw new BadRequestException('Segment de chemin interdit');
  }
  let cursor: any = obj;
  for (let i = 0; i < segments.length - 1; i++) {
    const seg = segments[i];
    if (typeof cursor !== 'object' || cursor === null) {
      throw new BadRequestException(
        'Le chemin ne correspond pas à la structure de la fiche',
      );
    }
    if (cursor[seg] === undefined || cursor[seg] === null) {
      const nextSeg = segments[i + 1];
      cursor[seg] = /^\d+$/.test(nextSeg) ? [] : {};
    }
    cursor = cursor[seg];
  }
  if (typeof cursor !== 'object' || cursor === null) {
    throw new BadRequestException(
      'Le chemin ne correspond pas à la structure de la fiche',
    );
  }
  cursor[segments[segments.length - 1]] = value;
}

@Injectable()
export class CharacterService {
  private readonly logger = new Logger(CharacterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
    private readonly users: UsersService,
    private readonly gameSystems: GameSystemService,
    private readonly email: EmailService,
  ) {}

  async create(
    partieId: string,
    userId: string,
    dto: CreateCharacterDto,
  ): Promise<CharacterDto> {
    const partie = await this.parties.getViewable(partieId, userId);

    if (!SUPPORTED_GAME_SYSTEMS.includes(dto.gameSystemId)) {
      throw new BadRequestException(
        `Système de jeu non supporté : ${dto.gameSystemId}`,
      );
    }

    const catalog = await this.buildRyuutamaCatalog(dto.gameSystemId);
    const sheetData = dto.sheetData as unknown as RyuutamaSheetData;
    const result = validate(sheetData, 'strict', catalog);
    if (!result.valid) {
      throw new BadRequestException(result.errors);
    }
    const derived = computeDerived(sheetData);

    try {
      const character = await this.prisma.character.create({
        data: {
          gameSystemId: dto.gameSystemId,
          sheetData: dto.sheetData as any,
          userId,
          partieId,
          derived: derived as any,
        },
      });
      const owner = await this.users.findById(userId);
      // Le créateur est toujours le propriétaire ici — ownerIsMj et viewerIsMj coïncident.
      const isMj = partie.mjId === userId;
      return toDto(character, owner?.pseudo ?? '', isMj, isMj);
    } catch (e: any) {
      if (e?.code === 'P2002') {
        throw new ConflictException(
          'Vous avez déjà un personnage sur cette partie',
        );
      }
      throw e;
    }
  }

  /**
   * Dérive le catalogue de validation Ryuutama du contenu réellement seedé en base
   * (`GameSystemService.getContent`), pour que `validate()` ne code plus en dur ses propres
   * listes déconnectées du contenu seed.
   */
  private async buildRyuutamaCatalog(
    gameSystemId: string,
  ): Promise<RyuutamaCatalog> {
    const content = await this.gameSystems.getContent(gameSystemId);
    const keysOf = (typeKey: string) =>
      (content[typeKey] ?? []).map((entry) => entry.key);
    // `entry.data` vient de `ContentEntry.data` (Json, aucune contrainte de forme en base) — la
    // garde vérifie que `values` est un tableau ET que chaque élément est bien un nombre, pas
    // seulement `Array.isArray()` (qui laisserait passer ex. ["8","4","6","6"] et produirait un
    // tri silencieusement faux via NaN dans `.sort((a, b) => a - b)`).
    const isNumberArray = (values: unknown): values is number[] =>
      Array.isArray(values) && values.every((v) => typeof v === 'number');
    const attributePatterns = (content['attributePattern'] ?? [])
      .map((entry) => (entry.data as { values?: unknown }).values)
      .filter(isNumberArray)
      .map((values) => [...values].sort((a, b) => a - b));

    return {
      validClasses: keysOf('class'),
      validTypes: keysOf('type'),
      validWeapons: keysOf('weaponCategory'),
      attributePatterns,
    };
  }

  async findOne(id: string, userId: string): Promise<CharacterDto> {
    const character = await this.prisma.character.findUnique({
      where: { id },
    });
    if (!character) throw new NotFoundException('Personnage introuvable');

    // Le MJ a déjà été résolu par getViewable() pour un viewer non-propriétaire — pas besoin
    // de re-requêter la partie via resolveOwnerInfo() dans ce cas. getViewable (MJ OU membre,
    // pas getOwned qui est MJ-seul) — la fiche est visible par tout participant de la Partie
    // depuis la Story 6.5 (prérequis du Journal de notes, cf. AC4 : un fellow player doit
    // pouvoir atteindre cette page pour y voir les entrées partagées). getHistory/
    // getPortraitFile ont leur propre check indépendant, non affectés par ce changement.
    let mjId: string | undefined;
    if (character.userId !== userId) {
      mjId = (await this.parties.getViewable(character.partieId, userId)).mjId;
    } else {
      mjId = (
        await this.prisma.partie.findUnique({
          where: { id: character.partieId },
          select: { mjId: true },
        })
      )?.mjId;
    }
    const owner = await this.users.findById(character.userId);
    // ownerIsMj : le PROPRIÉTAIRE du personnage est-il le MJ. viewerIsMj : le VIEWER (userId, le
    // demandeur de cette requête) est-il le MJ — distinct depuis que findOne est accessible à
    // tout participant (Story 6.5) : un fellow player n'est ni l'un ni l'autre, mais l'ancienne
    // heuristique frontend ("tout non-propriétaire = MJ") le traitait à tort comme MJ (cf. revue
    // de code Story 6.5). C'est ce champ, pas une heuristique client, qui doit trancher.
    return toDto(
      character,
      owner?.pseudo ?? '',
      mjId === character.userId,
      mjId === userId,
    );
  }

  async findByPartie(
    partieId: string,
    userId: string,
  ): Promise<CharacterDto[]> {
    const partie = await this.parties.getViewable(partieId, userId);
    const characters =
      partie.mjId === userId
        ? await this.prisma.character.findMany({ where: { partieId } })
        : await this.prisma.character.findMany({
            where: { partieId, userId },
          });
    if (characters.length === 0) return [];

    // Résolution en lot (pas de N+1) — même pattern que PartiesService.resolveParticipants.
    const ownerIds = [...new Set(characters.map((c) => c.userId))];
    const owners = await this.prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, pseudo: true },
    });
    const pseudoById = new Map(owners.map((o) => [o.id, o.pseudo]));

    const viewerIsMj = partie.mjId === userId;
    return characters.map((c) =>
      toDto(
        c,
        pseudoById.get(c.userId) ?? '',
        c.userId === partie.mjId,
        viewerIsMj,
      ),
    );
  }

  /**
   * Mutation du portrait : accès PROPRIÉTAIRE SEUL, contrairement à `findOne`
   * qui autorise aussi le MJ. Le MJ reste strictement en lecture seule sur les
   * personnages de ses joueurs (FR39) — aucune action d'édition à aucun palier.
   *
   * Verrou optimiste sur `updatedAt` : deux requêtes concurrentes sur le même personnage
   * (double-clic, onglets multiples) ne doivent jamais laisser un fichier orphelin sur
   * disque sans que la seconde requête échoue proprement (409) plutôt que de silencieusement
   * écraser/perdre le travail de l'autre.
   */
  async updatePortrait(
    id: string,
    userId: string,
    file: Express.Multer.File,
    cropData: PortraitCropDataDto | null,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(id, userId);

    const mime = detectImageMime(file.buffer);
    if (!mime) {
      throw new BadRequestException(
        "Le fichier fourni n'est pas une image JPEG/PNG/WEBP valide",
      );
    }

    await mkdir(PORTRAITS_DIR, { recursive: true });
    const filename = `${randomUUID()}${extensionForImageMime(mime)}`;
    await writeFile(join(PORTRAITS_DIR, filename), file.buffer);

    try {
      const result = await this.prisma.character.updateMany({
        where: { id, updatedAt: character.updatedAt },
        data: {
          portraitUrl: `${PORTRAITS_URL_PREFIX}${filename}`,
          portraitCropData: (cropData ?? null) as any,
        },
      });
      if (result.count === 0) {
        throw new ConflictException(
          'Le personnage a été modifié entretemps, réessayez.',
        );
      }
    } catch (e) {
      // Le nouveau fichier n'est référencé nulle part : DB en conflit ou en échec, on
      // nettoie immédiatement plutôt que de laisser un fichier orphelin sur disque.
      await this.unlinkPortraitFile(filename);
      throw e;
    }

    if (character.portraitUrl) {
      await this.deletePortraitFile(character.portraitUrl);
    }

    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { id },
    });
    const owner = await this.resolveOwnerInfo(userId, updated.partieId);
    return toDto(updated, owner.pseudo, owner.isMj, owner.isMj); // mutation propriétaire-seul : viewer === propriétaire
  }

  async removePortrait(id: string, userId: string): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(id, userId);

    const result = await this.prisma.character.updateMany({
      where: { id, updatedAt: character.updatedAt },
      data: { portraitUrl: null, portraitCropData: Prisma.JsonNull },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'Le personnage a été modifié entretemps, réessayez.',
      );
    }

    if (character.portraitUrl) {
      await this.deletePortraitFile(character.portraitUrl);
    }

    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { id },
    });
    const owner = await this.resolveOwnerInfo(userId, updated.partieId);
    return toDto(updated, owner.pseudo, owner.isMj, owner.isMj); // mutation propriétaire-seul : viewer === propriétaire
  }

  /**
   * Recadrage dédié pour l'export PDF (Story 4.7, AC2) : enregistré séparément de
   * `portraitCropData` (avatar web), sans toucher au fichier image existant — pas d'upload ici.
   */
  async updatePdfPortraitCrop(
    id: string,
    userId: string,
    cropData: PortraitCropDataDto,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(id, userId);
    if (!character.portraitUrl) {
      throw new BadRequestException(
        "Ce personnage n'a pas de portrait à recadrer",
      );
    }

    const result = await this.prisma.character.updateMany({
      where: { id, updatedAt: character.updatedAt },
      data: { pdfPortraitCropData: cropData as any },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'Le personnage a été modifié entretemps, réessayez.',
      );
    }

    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { id },
    });
    const owner = await this.resolveOwnerInfo(userId, updated.partieId);
    return toDto(updated, owner.pseudo, owner.isMj, owner.isMj); // mutation propriétaire-seul : viewer === propriétaire
  }

  /**
   * Lecture du fichier portrait : mêmes règles d'accès que `findOne` (propriétaire OU MJ),
   * contrairement aux mutations (propriétaire seul, cf. `getOwnCharacterOrThrow`) — consulter
   * un portrait n'est pas une action d'édition.
   */
  async getPortraitFile(
    id: string,
    userId: string,
  ): Promise<{ buffer: Buffer; mime: DetectedImageMime }> {
    const character = await this.prisma.character.findUnique({ where: { id } });
    if (!character) throw new NotFoundException('Personnage introuvable');
    // getViewable (MJ ou membre), pas getOwned (MJ seul) — cohérent avec findOne depuis la
    // Story 6.5 : un fellow player qui peut charger la fiche doit aussi pouvoir en voir le
    // portrait, sous peine d'image cassée sur une page par ailleurs accessible (revue de code).
    if (character.userId !== userId) {
      await this.parties.getViewable(character.partieId, userId);
    }

    const portrait = await readPortraitFile(character.portraitUrl);
    if (!portrait)
      throw new NotFoundException("Ce personnage n'a pas de portrait");
    return portrait;
  }

  /**
   * Incrément atomique commutatif de l'XP (AD-1) — appelé une fois par entrée d'une distribution
   * (`XpDistributionsService`). Pas de verrou optimiste : deux increments concurrents sur le même
   * personnage s'additionnent correctement sans lecture préalable, contrairement à `updatePortrait`.
   */
  async applyXpDelta(characterId: string, amount: number): Promise<void> {
    const updated = await this.prisma.character.update({
      where: { id: characterId },
      data: { xp: { increment: amount } },
    });
    await this.notifyPendingLevelUp(updated);
  }

  /**
   * Point de déclenchement UNIQUE de la notification "montée de niveau en attente" (AD-6) —
   * partagé par `applyXpDelta` (distribution) et `setXp` (édition MJ directe) : les deux chemins
   * d'écriture d'XP appellent cette même vérification juste après leur écriture respective,
   * jamais deux implémentations séparées qui pourraient diverger.
   */
  private async notifyPendingLevelUp(updated: {
    id: string;
    xp: number;
    sheetData: unknown;
    userId: string;
    partieId: string;
  }): Promise<void> {
    const sheetData = updated.sheetData as RyuutamaSheetData & {
      levelUps?: unknown[];
    };
    const pending = pendingLevels(updated.xp, sheetData.levelUps?.length ?? 0);
    if (pending.length === 0) return;

    const [owner, partie] = await Promise.all([
      this.users.findById(updated.userId),
      this.prisma.partie.findUnique({
        where: { id: updated.partieId },
        select: { name: true },
      }),
    ]);
    if (!owner) return;

    const narrative = (sheetData as any)?.narrative as
      | { name?: string }
      | undefined;
    const characterName = narrative?.name?.trim() || 'Personnage sans nom';
    const link = `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/parties/${updated.partieId}/characters/${updated.id}`;

    // `sendMail` ne relance jamais (déjà try/catch interne, { ok: false } silencieux) — pas de
    // try/catch supplémentaire ici, un échec d'envoi ne doit jamais faire échouer l'appelant.
    await this.email.sendMail('level-up', owner.email, {
      characterName,
      partieName: partie?.name ?? '',
      link,
    });
  }

  /**
   * Application d'une montée de niveau : accès PROPRIÉTAIRE SEUL (FR-6, c'est le joueur qui
   * applique ses propres montées, jamais le MJ). Verrou optimiste sur `updatedAt` (AD-9,
   * contrairement à `applyXpDelta` qui en est explicitement exclu).
   */
  async applyLevelUp(
    characterId: string,
    userId: string,
    dto: CreateLevelUpDto,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(characterId, userId);
    const sheetData = character.sheetData as unknown as RyuutamaSheetData;
    const levelUps = sheetData.levelUps ?? [];

    const pending = pendingLevels(character.xp, levelUps.length);
    if (pending.length === 0) {
      throw new BadRequestException('Aucun niveau en attente');
    }

    if (
      dto.pvAllocated + dto.peAllocated !== 3 ||
      dto.pvAllocated < 0 ||
      dto.peAllocated < 0
    ) {
      throw new BadRequestException(
        'La répartition doit totaliser exactement 3 points entre PV et PE',
      );
    }

    const nextLevel = pending[0];
    const expectedCapabilities =
      LEVEL_TABLE.find((entry) => entry.level === nextLevel)?.capabilities ??
      [];

    // Aux niveaux 4/6/10, deux capacités sont octroyées CONJOINTEMENT (Attribut ET spéciale),
    // jamais un choix exclusif — l'ensemble des types fourni doit correspondre exactement à
    // l'attendu (même cardinalité, mêmes types, sans doublon ni extra).
    const providedTypes = dto.capabilities.map((c) => c.type).sort();
    const expectedTypes = [...expectedCapabilities].sort();
    if (
      providedTypes.length !== expectedTypes.length ||
      providedTypes.some((t, i) => t !== expectedTypes[i])
    ) {
      throw new BadRequestException(
        `Capacités attendues pour le niveau ${nextLevel} : ${expectedCapabilities.join(', ')}`,
      );
    }

    // Validation de chaque capacité AVANT toute mutation (pas d'application partielle si l'une
    // échoue). Le contenu seedé n'est chargé que si une capacité data-driven doit être validée.
    const needsContent = dto.capabilities.some(
      (c) => c.type !== 'attribute' && c.type !== 'legendary-journey',
    );
    const content = needsContent
      ? await this.gameSystems.getContent(character.gameSystemId)
      : null;
    for (const cap of dto.capabilities) {
      if (cap.type === 'attribute') {
        const attribute = (cap.params as { attribute?: string }).attribute;
        if (
          !attribute ||
          !['AGI', 'ESP', 'INT', 'VIG'].includes(attribute) ||
          sheetData.attributes[
            attribute as keyof typeof sheetData.attributes
          ] >= 12
        ) {
          throw new BadRequestException('Attribut invalide ou déjà au maximum');
        }
      } else if (cap.type !== 'legendary-journey') {
        // Défense en profondeur : la clé choisie doit exister dans le contenu seedé du système
        // (parité avec la validation de l'attribut ; le serveur ne fait jamais confiance au client).
        const contentKey = CONTENT_KEY_BY_CAPABILITY[cap.type];
        const key = (cap.params as { key?: string }).key;
        const known =
          !!contentKey &&
          !!key &&
          (content?.[contentKey] ?? []).some((e) => e.key === key);
        if (!known) {
          throw new BadRequestException(
            `Choix de capacité invalide pour le type ${cap.type}`,
          );
        }
      }
    }

    // Toutes les validations passées : appliquer les effets (seul l'Attribut mute `attributes`).
    for (const cap of dto.capabilities) {
      if (cap.type === 'attribute') {
        const attribute = (cap.params as { attribute?: string }).attribute!;
        sheetData.attributes[attribute as keyof typeof sheetData.attributes] +=
          2;
      }
    }

    sheetData.levelUps = [
      ...levelUps,
      {
        level: nextLevel,
        pvAllocated: dto.pvAllocated,
        peAllocated: dto.peAllocated,
        capabilities: dto.capabilities as {
          type: CapabilityType;
          params: Record<string, unknown>;
        }[],
      },
    ];
    const derived = computeDerived(sheetData);

    // Écriture verrouillée (AD-9) + création du snapshot dans une même transaction : ni niveau
    // appliqué sans snapshot, ni snapshot orphelin si le verrou optimiste échoue (`count === 0`).
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.character.updateMany({
        where: { id: characterId, updatedAt: character.updatedAt },
        data: { sheetData: sheetData as any, derived: derived as any },
      });
      if (result.count === 0) {
        throw new ConflictException(
          'Le personnage a été modifié entretemps, réessayez.',
        );
      }
      await tx.characterSnapshot.create({
        data: {
          characterId,
          sheetData: sheetData as any,
          derived: derived as any,
          level: nextLevel,
          trigger: 'LEVEL_UP',
        },
      });
    });

    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
    });
    const owner = await this.resolveOwnerInfo(userId, updated.partieId);
    return toDto(updated, owner.pseudo, owner.isMj, owner.isMj); // mutation propriétaire-seul : viewer === propriétaire
  }

  /**
   * Édition MJ directe de l'XP (AD-6, structurellement distincte de `applyXpDelta`) : écriture
   * ABSOLUE verrouillée (AD-1/AD-9 — updateMany sur `updatedAt`, 409 si conflit), contrairement à
   * l'incrément atomique commutatif de la distribution — une lecture-puis-écriture est nécessaire
   * ici car la valeur est un remplacement, pas un delta. Crée immédiatement un
   * `CharacterSnapshot(trigger: 'MJ_EDIT')` et réutilise EXACTEMENT la même détection
   * `notifyPendingLevelUp` qu'`applyXpDelta` (AD-6) : le MJ ne peut jamais faire sauter un
   * niveau silencieusement, le joueur voit toujours sa `LevelUpBanner` et reçoit le même e-mail.
   */
  async setXp(
    characterId: string,
    userId: string,
    value: number,
  ): Promise<CharacterDto> {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
    });
    if (!character) throw new NotFoundException('Personnage introuvable');
    await this.parties.getOwned(character.partieId, userId);

    const sheetData = character.sheetData as unknown as RyuutamaSheetData;

    await this.prisma.$transaction(async (tx) => {
      const result = await tx.character.updateMany({
        where: { id: characterId, updatedAt: character.updatedAt },
        data: { xp: value },
      });
      if (result.count === 0) {
        throw new ConflictException(
          'Le personnage a été modifié entretemps, réessayez.',
        );
      }
      await tx.characterSnapshot.create({
        data: {
          characterId,
          sheetData: character.sheetData as any,
          derived: character.derived as any,
          level: 1 + (sheetData.levelUps?.length ?? 0),
          trigger: 'MJ_EDIT',
        },
      });
    });

    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
    });
    await this.notifyPendingLevelUp(updated);

    // viewerIsMj: true littéral — le viewer ICI est nécessairement le MJ (garanti par
    // parties.getOwned ci-dessus), à ne pas confondre avec owner.isMj (le personnage édité
    // appartient à un JOUEUR, pas au MJ appelant).
    const owner = await this.resolveOwnerInfo(updated.userId, updated.partieId);
    return toDto(updated, owner.pseudo, owner.isMj, true);
  }

  /**
   * Édition MJ générique d'un champ de `sheetData` (AD-6/AD-7) : accès MJ-only (AD-8), denylist
   * strict sur `xp`/`levelUps` (AD-6 — ces sous-arbres ne sont accessibles que via `setXp`/
   * `applyLevelUp`), `equipment.individual` traité spécialement (AD-3 : `addedBy`/`id` forcés
   * serveur, jamais confiance dans le client). `validate('mj', ...)` reste consultatif (AD-7) —
   * les `warnings` retournés n'empêchent jamais l'écriture. Verrouillage optimiste + snapshot en
   * transaction (AD-9), même pattern qu'`applyLevelUp`.
   */
  async setSheetField(
    characterId: string,
    userId: string,
    dto: SetSheetFieldDto,
  ): Promise<SetSheetFieldResultDto> {
    const segments = dto.path.split('.');

    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
    });
    if (!character) throw new NotFoundException('Personnage introuvable');
    await this.parties.getOwned(character.partieId, userId);

    if (segments[0] === 'xp' || segments[0] === 'levelUps') {
      throw new BadRequestException(
        'Les champs xp et levelUps ne sont pas éditables via ce mécanisme : utilisez PATCH /xp ou POST /level-up',
      );
    }

    const sheetData = character.sheetData as unknown as RyuutamaSheetData;
    let value = dto.value;
    let effectivePath = dto.path;

    if (segments[0] === 'equipment') {
      if (
        segments[1] !== 'individual' ||
        segments.length !== 3 ||
        !/^(0|[1-9]\d*)$/.test(segments[2])
      ) {
        throw new BadRequestException(
          'Le chemin doit cibler un objet précis : equipment.individual.<index>',
        );
      }
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new BadRequestException(
          'La valeur doit être un objet { name, weight }',
        );
      }
      const index = Number(segments[2]);
      const individual = normalizeInventoryIndividual(
        sheetData.equipment?.individual,
      );
      if (index > individual.length) {
        throw new BadRequestException('Index hors limites');
      }
      let id: string;
      if (index < individual.length) {
        const expectedId = (value as Record<string, unknown>)['id'];
        if (
          typeof expectedId !== 'string' ||
          expectedId !== individual[index].id
        ) {
          throw new ConflictException(
            "L'objet visé n'existe plus à cet emplacement, réessayez.",
          );
        }
        id = individual[index].id;
      } else {
        id = randomUUID();
      }
      value = {
        ...(value as Record<string, unknown>),
        id,
        addedBy: 'mj' as const,
      };
      effectivePath = `equipment.individual.${index}`;
    }

    setByPath(
      sheetData as unknown as Record<string, unknown>,
      effectivePath,
      value,
    );
    const derived = computeDerived(sheetData);
    const catalog = await this.buildRyuutamaCatalog(character.gameSystemId);
    const result = validate(sheetData, 'mj', catalog);

    await this.prisma.$transaction(async (tx) => {
      const updateResult = await tx.character.updateMany({
        where: { id: characterId, updatedAt: character.updatedAt },
        data: { sheetData: sheetData as any, derived: derived as any },
      });
      if (updateResult.count === 0) {
        throw new ConflictException(
          'Le personnage a été modifié entretemps, réessayez.',
        );
      }
      await tx.characterSnapshot.create({
        data: {
          characterId,
          sheetData: sheetData as any,
          derived: derived as any,
          level: 1 + (sheetData.levelUps?.length ?? 0),
          trigger: 'MJ_EDIT',
        },
      });
    });

    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
    });
    const owner = await this.resolveOwnerInfo(updated.userId, updated.partieId);
    return {
      character: toDto(updated, owner.pseudo, owner.isMj, true),
      warnings: result.errors.map((e) => e.message),
    };
  }

  /**
   * Historique des instantanés d'un personnage : accès PROPRIÉTAIRE OU MJ (AD-8, même pattern
   * que `findOne`), pas `getOwnCharacterOrThrow` qui est propriétaire-seul.
   */
  async getHistory(
    characterId: string,
    userId: string,
  ): Promise<CharacterSnapshotDto[]> {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
    });
    if (!character) throw new NotFoundException('Personnage introuvable');
    if (character.userId !== userId) {
      await this.parties.getOwned(character.partieId, userId);
    }

    const snapshots = await this.prisma.characterSnapshot.findMany({
      where: { characterId },
      orderBy: { createdAt: 'desc' },
    });
    return snapshots.map((s) => ({
      id: s.id,
      characterId: s.characterId,
      sheetData: s.sheetData as any,
      derived: s.derived as any,
      level: s.level,
      trigger: s.trigger,
      note: s.note ?? undefined,
      createdAt: s.createdAt.toISOString(),
    }));
  }

  /**
   * Ajoute un objet à l'inventaire individuel : accès PROPRIÉTAIRE SEUL (FR-9), verrou optimiste
   * (AD-9/NFR1). `addedBy` n'est jamais lu depuis `dto` (le type `CreateInventoryItemDto` ne le
   * déclare même pas) — toujours forcé à `'player'`. Aucun `CharacterSnapshot` créé (FR-12 exclut
   * explicitement l'inventaire de l'historique) — ne pas copier le pattern `$transaction` de
   * `applyLevelUp`, ce n'est pas le même cas.
   */
  async addInventoryItem(
    characterId: string,
    userId: string,
    dto: CreateInventoryItemDto,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(characterId, userId);
    const sheetData = character.sheetData as unknown as RyuutamaSheetData;
    const equipment = sheetData.equipment ?? { individual: [], group: [] };
    const individual = [
      ...normalizeInventoryIndividual(equipment.individual),
      {
        id: randomUUID(),
        name: dto.name,
        weight: dto.weight ?? 0,
        addedBy: 'player' as const,
      },
    ];
    sheetData.equipment = { ...equipment, individual };
    return this.writeInventoryChange(
      characterId,
      character.updatedAt,
      sheetData,
      userId,
    );
  }

  /**
   * Modifie un objet existant de l'inventaire individuel — même règles d'accès et de verrouillage
   * que `addInventoryItem`. `itemId` = `InventoryItem.id` (UUID stable, jamais une position de
   * tableau — revue de code Story 6.4 : adresser par index laissait un client périmé agir sur le
   * mauvais objet sans jamais déclencher de 409 ; par id, un objet déjà retiré/déplacé par une
   * autre requête n'est simplement plus trouvé → 404, jamais une mauvaise cible silencieuse).
   */
  async updateInventoryItem(
    characterId: string,
    userId: string,
    itemId: string,
    dto: UpdateInventoryItemDto,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(characterId, userId);
    const sheetData = character.sheetData as unknown as RyuutamaSheetData;
    const individual = normalizeInventoryIndividual(
      sheetData.equipment?.individual,
    );
    const index = individual.findIndex((i) => i.id === itemId);
    if (index === -1)
      throw new NotFoundException("Objet d'inventaire introuvable");

    const updated = [...individual];
    updated[index] = {
      ...updated[index],
      name: dto.name ?? updated[index].name,
      weight: dto.weight ?? updated[index].weight,
    };
    sheetData.equipment = { ...sheetData.equipment!, individual: updated };
    return this.writeInventoryChange(
      characterId,
      character.updatedAt,
      sheetData,
      userId,
    );
  }

  /** Retire un objet existant de l'inventaire individuel — mêmes règles que `updateInventoryItem`. */
  async removeInventoryItem(
    characterId: string,
    userId: string,
    itemId: string,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(characterId, userId);
    const sheetData = character.sheetData as unknown as RyuutamaSheetData;
    const individual = normalizeInventoryIndividual(
      sheetData.equipment?.individual,
    );
    if (!individual.some((i) => i.id === itemId)) {
      throw new NotFoundException("Objet d'inventaire introuvable");
    }
    const updated = individual.filter((i) => i.id !== itemId);
    sheetData.equipment = { ...sheetData.equipment!, individual: updated };
    return this.writeInventoryChange(
      characterId,
      character.updatedAt,
      sheetData,
      userId,
    );
  }

  /**
   * Édition propriétaire-seul d'un champ narratif (Story 6.7, extension hors FR14 — le MJ édite
   * via `sheet-field`, cf. setSheetField ; ceci est un chemin séparé pour le propriétaire).
   * `field` restreint aux 6 clés `narrative.*` affichées sur la fiche (denylist implicite via
   * whitelist DTO — jamais un path libre côté propriétaire). Pas de `computeDerived` (narratif
   * n'entre dans aucun calcul), pas de `CharacterSnapshot` (cohérent avec FR9/FR11 : édition
   * propriétaire de contenu non structurel = pas d'instantané).
   */
  async updateNarrativeField(
    characterId: string,
    userId: string,
    dto: UpdateNarrativeFieldDto,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(characterId, userId);
    const sheetData = character.sheetData as unknown as RyuutamaSheetData;
    sheetData.narrative = { ...sheetData.narrative, [dto.field]: dto.value };
    return this.writeInventoryChange(
      characterId,
      character.updatedAt,
      sheetData,
      userId,
    );
  }

  /**
   * Écriture verrouillée commune aux mutations propriétaire-seul sans recalcul (inventaire,
   * champs narratifs Story 6.7) — pas de `computeDerived`, pas de snapshot.
   */
  private async writeInventoryChange(
    characterId: string,
    expectedUpdatedAt: Date,
    sheetData: RyuutamaSheetData,
    userId: string,
  ): Promise<CharacterDto> {
    const result = await this.prisma.character.updateMany({
      where: { id: characterId, updatedAt: expectedUpdatedAt },
      data: { sheetData: sheetData as any },
    });
    if (result.count === 0) {
      throw new ConflictException(
        'Le personnage a été modifié entretemps, réessayez.',
      );
    }
    const updated = await this.prisma.character.findUniqueOrThrow({
      where: { id: characterId },
    });
    const owner = await this.resolveOwnerInfo(userId, updated.partieId);
    return toDto(updated, owner.pseudo, owner.isMj, owner.isMj); // mutation propriétaire-seul : viewer === propriétaire
  }

  /**
   * Ajoute une entrée au journal de notes : PROPRIÉTAIRE SEUL (FR-11), toujours privée à la
   * création (`shared: false`) — append-only, aucune modification de texte possible ensuite via
   * ce chemin. Écriture ligne dédiée (pas de JSON sur `Character`) : PAS de verrou optimiste requis
   * ici, contrairement à l'inventaire (Story 6.4) — c'est précisément le bénéfice d'un modèle
   * Prisma dédié plutôt qu'un tableau JSON (AD-5) : un `create()` n'a aucun risque de perte
   * d'écriture concurrente sur un blob partagé. Pas de `CharacterSnapshot` créé (FR-12 exclut
   * explicitement les notes, comme l'inventaire).
   */
  async addNote(
    characterId: string,
    userId: string,
    dto: CreateCharacterNoteDto,
  ): Promise<CharacterNoteDto> {
    await this.getOwnCharacterOrThrow(characterId, userId);
    const note = await this.prisma.characterNote.create({
      data: { characterId, text: dto.text, shared: false },
    });
    return toNoteDto(note);
  }

  /**
   * Bascule le statut de partage d'une entrée existante : PROPRIÉTAIRE SEUL, par entrée (jamais
   * un réglage global du journal). Vérifie explicitement que `noteId` appartient bien à
   * `characterId` — sinon un propriétaire pourrait, en devinant/énumérant un UUID, basculer le
   * partage d'une note d'un AUTRE personnage.
   */
  async toggleNoteShare(
    characterId: string,
    userId: string,
    noteId: string,
    shared: boolean,
  ): Promise<CharacterNoteDto> {
    await this.getOwnCharacterOrThrow(characterId, userId);
    const note = await this.prisma.characterNote.findUnique({
      where: { id: noteId },
    });
    if (!note || note.characterId !== characterId) {
      throw new NotFoundException('Note introuvable');
    }
    const updated = await this.prisma.characterNote.update({
      where: { id: noteId },
      data: { shared },
    });
    return toNoteDto(updated);
  }

  /**
   * Liste le journal : PROPRIÉTAIRE (tout), MJ (tout), ou tout autre participant de la Partie
   * (uniquement `shared: true` — 3e pattern d'accès introduit par cette story, AD-8). Ne réutilise
   * ni `getOwnCharacterOrThrow` (propriétaire seul) ni `findOne` (renvoie un `CharacterDto`, pas
   * ce dont on a besoin ici) — check inline dédié, même esprit que `getHistory`/`getPortraitFile`.
   */
  async getNotes(
    characterId: string,
    userId: string,
  ): Promise<CharacterNoteDto[]> {
    const character = await this.prisma.character.findUnique({
      where: { id: characterId },
    });
    if (!character) throw new NotFoundException('Personnage introuvable');

    let sharedOnly = character.userId !== userId;
    if (sharedOnly) {
      const partie = await this.parties.getViewable(character.partieId, userId);
      if (partie.mjId === userId) sharedOnly = false;
    }
    const notes = await this.prisma.characterNote.findMany({
      where: { characterId, ...(sharedOnly ? { shared: true } : {}) },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map(toNoteDto);
  }

  /** Pseudo du propriétaire + s'il est le MJ de la partie — résolu en une seule paire de requêtes ciblées (`select` minimal, jamais le hash). */
  private async resolveOwnerInfo(
    ownerId: string,
    partieId: string,
  ): Promise<{ pseudo: string; isMj: boolean }> {
    const [owner, partie] = await Promise.all([
      this.users.findById(ownerId),
      this.prisma.partie.findUnique({
        where: { id: partieId },
        select: { mjId: true },
      }),
    ]);
    return { pseudo: owner?.pseudo ?? '', isMj: partie?.mjId === ownerId };
  }

  private async getOwnCharacterOrThrow(id: string, userId: string) {
    const character = await this.prisma.character.findUnique({
      where: { id },
    });
    if (!character) throw new NotFoundException('Personnage introuvable');
    if (character.userId !== userId) {
      throw new ForbiddenException(
        'Seul le propriétaire du personnage peut modifier son portrait',
      );
    }
    return character;
  }

  private async deletePortraitFile(portraitUrl: string): Promise<void> {
    const filename = extractPortraitFilename(portraitUrl);
    if (!filename) {
      this.logger.warn(
        `portraitUrl inattendu, suppression ignorée : ${portraitUrl}`,
      );
      return;
    }
    await this.unlinkPortraitFile(filename);
  }

  private async unlinkPortraitFile(filename: string): Promise<void> {
    try {
      await unlink(join(PORTRAITS_DIR, filename));
    } catch (e) {
      this.logger.warn(
        `Échec de suppression du portrait ${filename}`,
        e as Error,
      );
    }
  }
}

function toDto(
  character: any,
  ownerPseudo: string,
  ownerIsMj: boolean,
  viewerIsMj: boolean,
): CharacterDto {
  return {
    id: character.id,
    userId: character.userId,
    partieId: character.partieId,
    gameSystemId: character.gameSystemId,
    sheetData: character.sheetData,
    derived: character.derived,
    portraitUrl: character.portraitUrl ?? null,
    portraitCropData: character.portraitCropData ?? null,
    pdfPortraitCropData: character.pdfPortraitCropData ?? null,
    createdAt: character.createdAt.toISOString(),
    updatedAt: character.updatedAt.toISOString(),
    ownerPseudo,
    ownerIsMj,
    viewerIsMj,
    xp: character.xp ?? 0,
    // Niveau réellement appliqué (nombre de montées de niveau validées + 1), PAS le niveau
    // potentiel dérivé de l'xp (`levelForXp`) — sinon la fiche afficherait un niveau non encore
    // acquis tant que le joueur n'a pas traité son `LevelUpBanner` (cf. `pendingLevels`).
    level:
      1 + ((character.sheetData?.levelUps?.length as number | undefined) ?? 0),
  };
}

function toNoteDto(note: {
  id: string;
  characterId: string;
  text: string;
  shared: boolean;
  createdAt: Date;
}): CharacterNoteDto {
  return {
    id: note.id,
    characterId: note.characterId,
    text: note.text,
    shared: note.shared,
    createdAt: note.createdAt.toISOString(),
  };
}
