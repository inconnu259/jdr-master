import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { Partie } from '@prisma/client';
import type { GameSystemFamily, PartieRole, PermissionAction } from '@master-jdr/shared';
// Import RUNTIME du registre des systèmes (Story 37.5) : la famille du système de la partie choisit
// la politique de droits. Jamais `import type` sur une valeur.
import { familyOf } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Cible d'une décision de droit (Story 37.6, AD-6). Pour un événement ou une séance, la partie est
 * TOUJOURS résolue depuis la cible elle-même — jamais lue dans un paramètre de route : un
 * identifiant de séance d'une autre partie ne peut donc pas être « rattaché » à la partie de l'URL.
 */
export type PermissionTarget =
  // Membres mutuellement exclusifs : une cible mixte (`{ partieId, seanceId }`) ne compile pas —
  // sans quoi l'identifiant de partie (souvent lu dans la route) primerait sur la séance visée.
  | { partieId: string; eventId?: never; seanceId?: never }
  | { eventId: string; partieId?: never; seanceId?: never }
  | { seanceId: string; partieId?: never; eventId?: never };

/** Cible telle que résolue par `assert()` : la partie, plus l'événement et la séance quand la
 *  cible les désignait (une séance donne aussi son événement). */
export interface ResolvedTarget {
  readonly partieId: string;
  readonly eventId?: string;
  readonly seanceId?: string;
}

/** Marque de l'autorisation : non exportée, aucun autre module ne peut fabriquer un `PartieGrant`
 *  sans passer par `PermissionService.assert()` (hors transtypage explicite, réservé aux tests). */
declare const GRANT_BRAND: unique symbol;

/**
 * Autorisation délivrée par `PermissionService.assert()` : la preuve, vérifiée par le compilateur,
 * qu'un droit a été contrôlé avant l'appel (`EventsService` n'accepte qu'elle — pas d'autorisation,
 * pas d'appel). Elle porte l'action contrôlée et la cible résolue : `EventsService` refuse d'écrire
 * une séance ou un événement qui n'appartient pas à la partie de l'autorisation.
 */
export interface PartieGrant {
  readonly partieId: string;
  readonly role: PartieRole;
  readonly action: PermissionAction;
  readonly target: ResolvedTarget;
  /** La partie telle que lue pour décider — l'appelant n'a pas à la relire. */
  readonly partie: Partie;
  readonly [GRANT_BRAND]: true;
}

/** Un participant d'une partie (propriétaire compris), identité = pseudo + nom affiché. */
export interface PartieMember {
  userId: string;
  pseudo: string;
  displayName: string;
}

/** Refus d'une action réservée au propriétaire, opposé à un membre. */
export const MJ_ONLY_MESSAGE = 'Action réservée au MJ de la partie';
/** Refus opposé à quelqu'un qui n'a aucun rôle sur la partie. */
export const NO_ACCESS_MESSAGE = "Vous n'avez pas accès à cette partie";

const OWNER_ONLY: readonly PartieRole[] = ['mj'];
const OWNER_AND_MEMBERS: readonly PartieRole[] = ['mj', 'player'];

/**
 * Politique de la famille `jdr` : le propriétaire (MJ) seul organise et administre, les membres
 * (joueurs) lisent et participent. Table COMPLÈTE par construction (`Record` sur l'union fermée
 * `PermissionAction`) : une action ajoutée sans sa ligne ne compile pas.
 */
export const JDR_POLICY: Readonly<Record<PermissionAction, readonly PartieRole[]>> = {
  // Partie
  PARTIE_READ: OWNER_AND_MEMBERS,
  PARTIE_MANAGE: OWNER_ONLY,
  PARTIE_UPDATE: OWNER_ONLY,
  PARTIE_CONVERT_KIND: OWNER_ONLY,
  PARTIE_CLOSE: OWNER_ONLY,
  PARTIE_REOPEN: OWNER_ONLY,
  PARTIE_DELETE: OWNER_ONLY,
  PARTIE_MEMBERS_READ: OWNER_AND_MEMBERS,
  PARTIE_MEMBER_REMOVE: OWNER_ONLY,
  PARTIE_AVAILABILITY_READ: OWNER_AND_MEMBERS,
  PARTIE_VISIBILITY_LOCKS_READ: OWNER_ONLY,
  PARTIE_VISIBILITY_LOCKS_UPDATE: OWNER_ONLY,
  PARTIE_COVER_READ: OWNER_AND_MEMBERS,
  PARTIE_COVER_UPDATE: OWNER_ONLY,
  // Scénario
  SCENARIO_CREATE: OWNER_ONLY,
  SCENARIO_UPDATE: OWNER_ONLY,
  SCENARIO_STATUS_CHANGE: OWNER_ONLY,
  // Anti-spoil : un membre lit encore les brouillons par l'API (rendu front seulement — reporté).
  SCENARIO_READ: OWNER_AND_MEMBERS,
  SCENARIO_DRAFTS_READ: OWNER_ONLY,
  SCENARIO_DOCUMENT_UPLOAD: OWNER_ONLY,
  SCENARIO_DOCUMENTS_READ: OWNER_AND_MEMBERS,
  SCENARIO_PARTICIPATE: OWNER_AND_MEMBERS,
  // Séance
  SEANCE_ADD: OWNER_ONLY,
  SEANCE_DELETE: OWNER_ONLY,
  SEANCE_DATE_RESET: OWNER_ONLY,
  SEANCE_CAPACITY_SET: OWNER_ONLY,
  SEANCE_COMPTE_RENDU_SET: OWNER_ONLY,
  SEANCE_PRACTICAL_INFO_SET: OWNER_ONLY,
  SEANCE_POLL_CREATE: OWNER_ONLY,
  SEANCE_INSCRIBE: OWNER_AND_MEMBERS,
  SEANCE_UNSUBSCRIBE: OWNER_AND_MEMBERS,
  // Vote de date
  POLL_READ: OWNER_AND_MEMBERS,
  POLL_VOTE: OWNER_AND_MEMBERS,
  POLL_CHOOSE: OWNER_ONLY,
  POLL_OPTIONS_SET: OWNER_ONLY,
  POLL_CLOSE: OWNER_ONLY,
};

/** Politique applicable à une famille. Le ralliement n'a pas encore la sienne (épic 38, fermé à
 *  la création) : il retombe, comme un système inconnu du registre, sur la politique `jdr`. */
function policyFor(
  family: GameSystemFamily | null,
): Readonly<Record<PermissionAction, readonly PartieRole[]>> {
  switch (family) {
    case 'jdr':
    case 'ralliement':
    case null:
      return JDR_POLICY;
    default: {
      const exhaustive: never = family;
      throw new Error(`Famille de système sans politique de droits : ${String(exhaustive)}`);
    }
  }
}

/** Règle de rôle de la famille `jdr` : le propriétaire est `mj`, un membre est `player`. Un
 *  propriétaire nul (AD-5) n'est jamais `mj` — la comparaison est faite sur une valeur non nulle. */
function jdrRole(ownerId: string | null, userId: string, isMember: boolean): PartieRole | null {
  if (ownerId !== null && ownerId === userId) return 'mj';
  return isMember ? 'player' : null;
}

/**
 * Service UNIQUE de décision des droits sur une partie, ses événements et ses séances (Story
 * 37.6, AD-6). Transverse : n'importe que `PrismaService` et le registre des systèmes — aucun
 * module métier, pour que toutes les couches puissent l'injecter sans cycle.
 */
@Injectable()
export class PermissionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vérifie que `userId` peut faire `action` sur `target`, et renvoie l'autorisation.
   * Cible inconnue → 404 (message historique de la cible) ; aucun rôle → 403
   * `NO_ACCESS_MESSAGE` ; rôle insuffisant → 403 `MJ_ONLY_MESSAGE`.
   */
  async assert(
    userId: string,
    action: PermissionAction,
    target: PermissionTarget,
  ): Promise<PartieGrant> {
    const { partie, resolved } = await this.resolveTarget(target);
    const role = await this.roleIn(partie, userId);
    if (role === null) throw new ForbiddenException(NO_ACCESS_MESSAGE);
    const allowed = policyFor(familyOf(partie.gameSystemId))[action];
    if (!allowed.includes(role)) throw new ForbiddenException(MJ_ONLY_MESSAGE);
    return { partieId: partie.id, role, action, target: resolved, partie } as PartieGrant;
  }

  /** Rôle de `userId` sur une partie, `null` s'il n'en a aucun (ou si la partie n'existe pas).
   *  Une seule requête. */
  async roleOf(partieId: string, userId: string): Promise<PartieRole | null> {
    const partie = await this.prisma.partie.findUnique({
      where: { id: partieId },
      select: { ownerId: true, memberships: { where: { userId }, select: { userId: true } } },
    });
    if (!partie) return null;
    return jdrRole(partie.ownerId, userId, partie.memberships.length > 0);
  }

  /** Rôles de `userId` sur un lot de parties — UNE seule requête, jamais une par partie. Les
   *  parties où il n'a aucun rôle (ou inexistantes) sont absentes de la table renvoyée. */
  async rolesOf(userId: string, partieIds: string[]): Promise<Map<string, PartieRole>> {
    const roles = new Map<string, PartieRole>();
    if (partieIds.length === 0) return roles;
    const parties = await this.prisma.partie.findMany({
      where: {
        id: { in: partieIds },
        OR: [{ ownerId: userId }, { memberships: { some: { userId } } }],
      },
      select: { id: true, ownerId: true },
    });
    for (const p of parties) {
      // Retenue par le filtre : propriétaire ou membre — donc membre si elle n'est pas à lui.
      const role = jdrRole(p.ownerId, userId, true);
      if (role) roles.set(p.id, role);
    }
    return roles;
  }

  /**
   * Participants d'une partie (famille `jdr` : propriétaire puis membres, dédoublonnés) avec leur
   * pseudo et leur nom affiché. Une partie sans propriétaire (AD-5) ne renvoie que ses membres.
   *
   * Story 36.8 — ORDRE FIXE DE LA TROUPE : la couche « disponibilité du groupe » fait porter
   * l'identité par la POSITION (FR-53) ; tri `joinedAt` puis `userId` en départage (deux membres
   * invités dans le même lot peuvent partager le même `joinedAt`).
   */
  async membersOf(partie: Pick<Partie, 'id' | 'ownerId'>): Promise<PartieMember[]> {
    const [owner, memberships] = await Promise.all([
      partie.ownerId === null
        ? Promise.resolve(null)
        : this.prisma.user.findUnique({
            where: { id: partie.ownerId },
            select: { id: true, pseudo: true, displayName: true },
          }),
      this.prisma.membership.findMany({
        where: { partieId: partie.id },
        orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
        include: {
          user: { select: { id: true, pseudo: true, displayName: true } },
        },
      }),
    ]);

    const seen = new Set<string>();
    const members: PartieMember[] = [];
    // Un compte propriétaire orphelin (ligne `User` absente) est simplement omis.
    if (owner) {
      seen.add(owner.id);
      members.push({ userId: owner.id, pseudo: owner.pseudo, displayName: owner.displayName });
    }
    for (const m of memberships) {
      if (seen.has(m.user.id)) continue;
      seen.add(m.user.id);
      members.push({ userId: m.user.id, pseudo: m.user.pseudo, displayName: m.user.displayName });
    }
    return members;
  }

  /** Résout la partie de la cible (et ce qu'elle désigne), 404 avec le message historique de la
   *  cible si elle n'existe pas. */
  private async resolveTarget(
    target: PermissionTarget,
  ): Promise<{ partie: Partie; resolved: ResolvedTarget }> {
    if (target.partieId !== undefined) {
      const partie = await this.prisma.partie.findUnique({ where: { id: target.partieId } });
      if (!partie) throw new NotFoundException('Partie introuvable');
      return { partie, resolved: { partieId: partie.id } };
    }
    if (target.eventId !== undefined) {
      const event = await this.prisma.event.findUnique({
        where: { id: target.eventId },
        include: { partie: true },
      });
      // Message historique : dans le JDR, un événement est toujours un scénario.
      if (!event) throw new NotFoundException('Scénario introuvable');
      return { partie: event.partie, resolved: { partieId: event.partie.id, eventId: event.id } };
    }
    const seance = await this.prisma.seance.findUnique({
      where: { id: target.seanceId },
      include: { event: { include: { partie: true } } },
    });
    if (!seance) throw new NotFoundException('Séance introuvable');
    return {
      partie: seance.event.partie,
      resolved: { partieId: seance.event.partie.id, eventId: seance.event.id, seanceId: seance.id },
    };
  }

  /** Rôle de `userId` sur une partie déjà lue. La table `Membership` n'est consultée que si
   *  l'utilisateur n'est pas le propriétaire. */
  private async roleIn(partie: Partie, userId: string): Promise<PartieRole | null> {
    const asOwner = jdrRole(partie.ownerId, userId, false);
    if (asOwner) return asOwner;
    const membership = await this.prisma.membership.findUnique({
      where: { userId_partieId: { userId, partieId: partie.id } },
    });
    return jdrRole(partie.ownerId, userId, membership != null);
  }
}
