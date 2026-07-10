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
import type { CharacterDto, CharacterSnapshotDto } from '@master-jdr/shared';
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
type InventoryItemEntry = NonNullable<RyuutamaSheetData['equipment']>['individual'][number];

function normalizeInventoryIndividual(
  individual: (InventoryItemEntry | string)[] | undefined,
): InventoryItemEntry[] {
  return (individual ?? []).map((item) =>
    typeof item === 'string'
      ? { id: randomUUID(), name: item, weight: 0, addedBy: 'player' as const }
      : item,
  );
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
      return toDto(character, owner?.pseudo ?? '', partie.mjId === userId);
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

    // Le MJ a déjà été résolu par getOwned() pour un viewer non-propriétaire — pas besoin
    // de re-requêter la partie via resolveOwnerInfo() dans ce cas.
    let mjId: string | undefined;
    if (character.userId !== userId) {
      mjId = (await this.parties.getOwned(character.partieId, userId)).mjId;
    } else {
      mjId = (
        await this.prisma.partie.findUnique({
          where: { id: character.partieId },
          select: { mjId: true },
        })
      )?.mjId;
    }
    const owner = await this.users.findById(character.userId);
    return toDto(character, owner?.pseudo ?? '', mjId === character.userId);
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

    return characters.map((c) =>
      toDto(c, pseudoById.get(c.userId) ?? '', c.userId === partie.mjId),
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
    return toDto(updated, owner.pseudo, owner.isMj);
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
    return toDto(updated, owner.pseudo, owner.isMj);
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
    return toDto(updated, owner.pseudo, owner.isMj);
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
    if (character.userId !== userId) {
      await this.parties.getOwned(character.partieId, userId);
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

    const sheetData = updated.sheetData as unknown as RyuutamaSheetData & {
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
    // try/catch supplémentaire ici, un échec d'envoi ne doit jamais faire échouer la distribution.
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
        sheetData.attributes[
          attribute as keyof typeof sheetData.attributes
        ] += 2;
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
    return toDto(updated, owner.pseudo, owner.isMj);
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
      { id: randomUUID(), name: dto.name, weight: dto.weight ?? 0, addedBy: 'player' as const },
    ];
    sheetData.equipment = { ...equipment, individual };
    return this.writeInventoryChange(characterId, character.updatedAt, sheetData, userId);
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
    const individual = normalizeInventoryIndividual(sheetData.equipment?.individual);
    const index = individual.findIndex((i) => i.id === itemId);
    if (index === -1) throw new NotFoundException("Objet d'inventaire introuvable");

    const updated = [...individual];
    updated[index] = {
      ...updated[index],
      name: dto.name ?? updated[index].name,
      weight: dto.weight ?? updated[index].weight,
    };
    sheetData.equipment = { ...sheetData.equipment!, individual: updated };
    return this.writeInventoryChange(characterId, character.updatedAt, sheetData, userId);
  }

  /** Retire un objet existant de l'inventaire individuel — mêmes règles que `updateInventoryItem`. */
  async removeInventoryItem(
    characterId: string,
    userId: string,
    itemId: string,
  ): Promise<CharacterDto> {
    const character = await this.getOwnCharacterOrThrow(characterId, userId);
    const sheetData = character.sheetData as unknown as RyuutamaSheetData;
    const individual = normalizeInventoryIndividual(sheetData.equipment?.individual);
    if (!individual.some((i) => i.id === itemId)) {
      throw new NotFoundException("Objet d'inventaire introuvable");
    }
    const updated = individual.filter((i) => i.id !== itemId);
    sheetData.equipment = { ...sheetData.equipment!, individual: updated };
    return this.writeInventoryChange(characterId, character.updatedAt, sheetData, userId);
  }

  /**
   * Écriture verrouillée commune aux 3 mutations d'inventaire — pas de recalcul `computeDerived`
   * (le poids d'inventaire n'entre dans aucune formule de `DerivedStats`) et pas de snapshot.
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
    return toDto(updated, owner.pseudo, owner.isMj);
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
    xp: character.xp ?? 0,
    // Niveau réellement appliqué (nombre de montées de niveau validées + 1), PAS le niveau
    // potentiel dérivé de l'xp (`levelForXp`) — sinon la fiche afficherait un niveau non encore
    // acquis tant que le joueur n'a pas traité son `LevelUpBanner` (cf. `pendingLevels`).
    level:
      1 +
      (((character.sheetData as any)?.levelUps?.length as number | undefined) ??
        0),
  };
}
