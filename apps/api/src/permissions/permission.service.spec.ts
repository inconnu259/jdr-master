import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { GameSystemCapability, PermissionAction } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { objectLike } from '../common/test-utils/jest-typed';
import {
  ACTION_CAPABILITY,
  CAPABILITY_UNAVAILABLE_MESSAGE,
  JDR_POLICY,
  MJ_ONLY_MESSAGE,
  NO_ACCESS_MESSAGE,
  PermissionService,
} from './permission.service';

// Story 37.6 (AD-6) — service UNIQUE de décision des droits. Un test de refus par cellule
// actions × rôles (`player`, non-membre) de la politique `jdr`, plus les 404 de chaque cible, la
// partie sans propriétaire, l'IDOR par séance/événement d'une autre partie et la lecture en lot.

const MJ = 'mj-a';
const PLAYER = 'joueur-a';
const STRANGER = 'etranger';

function partie(id: string, ownerId: string | null, gameSystemId = 'ryuutama') {
  return { id, ownerId, gameSystemId, name: `Partie ${id}`, kind: 'CAMPAGNE_EPISODIQUE' };
}

const PARTIE_A = partie('A', MJ);
const PARTIE_B = partie('B', 'mj-b');
// Partie d'un système sans aucune capacité JDR (famille jdr, fermé à la création).
const PARTIE_D = partie('D', MJ, 'draconis');

function makePrisma() {
  return {
    partie: { findUnique: jest.fn(), findMany: jest.fn() },
    event: { findUnique: jest.fn() },
    seance: { findUnique: jest.fn() },
    character: { findUnique: jest.fn() },
    invitation: { findUnique: jest.fn() },
    inviteLink: { findUnique: jest.fn() },
    announcement: { findUnique: jest.fn() },
    membership: { findUnique: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
    user: { findUnique: jest.fn() },
  };
}

/** Membres simulés : `PLAYER` est membre de A, personne d'autre n'est membre de rien. */
function membershipsOf(members: Record<string, string[]>) {
  return ({ where }: { where: { userId_partieId: { userId: string; partieId: string } } }) => {
    const { userId, partieId } = where.userId_partieId;
    return Promise.resolve(
      (members[partieId] ?? []).includes(userId) ? { userId, partieId } : null,
    );
  };
}

// Politique `jdr` ÉCRITE EN DUR, jamais dérivée de `JDR_POLICY` : c'est la référence contre
// laquelle la table de production est comparée. Basculer une seule cellule de `JDR_POLICY` fait
// échouer le test d'égalité ET les tests par cellule ci-dessous.

/** Actions réservées au propriétaire (MJ) : organiser et administrer. */
const MJ_ONLY: PermissionAction[] = [
  'PARTIE_UPDATE',
  'PARTIE_CONVERT_KIND',
  'PARTIE_CLOSE',
  'PARTIE_REOPEN',
  'PARTIE_DELETE',
  'PARTIE_MEMBER_REMOVE',
  'PARTIE_VISIBILITY_LOCKS_READ',
  'PARTIE_VISIBILITY_LOCKS_UPDATE',
  'PARTIE_COVER_UPDATE',
  'PARTIE_REFERENCE_ASSET_MJ_READ',
  'SCENARIO_CREATE',
  'SCENARIO_UPDATE',
  'SCENARIO_STATUS_CHANGE',
  'SCENARIO_DRAFTS_READ',
  'SCENARIO_DOCUMENT_UPLOAD',
  'SEANCE_ADD',
  'SEANCE_DELETE',
  'SEANCE_DATE_RESET',
  'SEANCE_CAPACITY_SET',
  'SEANCE_COMPTE_RENDU_SET',
  'SEANCE_PRACTICAL_INFO_SET',
  'SEANCE_POLL_CREATE',
  'POLL_CHOOSE',
  'POLL_OPTIONS_SET',
  'POLL_CLOSE',
  // Story 37.7 : capacités JDR et invitations
  'CHARACTER_XP_SET',
  'CHARACTER_SHEET_FIELD_SET',
  'CHARACTER_HISTORY_READ',
  'XP_DISTRIBUTION_CREATE',
  'XP_DISTRIBUTION_READ',
  'HOMME_DRAGON_MANAGE',
  'HOMME_DRAGON_READ',
  'HOMME_DRAGON_UNLINK',
  'GROUP_ROLE_ASSIGN',
  'GROUP_ROLE_UNASSIGN',
  'ANNOUNCEMENT_CREATE',
  'INVITATION_CREATE',
  'INVITATION_READ',
  'INVITATION_REVOKE',
  'INVITE_LINK_CREATE',
  'INVITE_LINK_READ',
  'INVITE_LINK_REVOKE',
];

/** Actions ouvertes au MJ ET aux membres : lire et participer. */
const MEMBER_ACTIONS: PermissionAction[] = [
  'PARTIE_READ',
  'PARTIE_MEMBERS_READ',
  'PARTIE_AVAILABILITY_READ',
  'PARTIE_COVER_READ',
  'SCENARIO_READ',
  'SCENARIO_DOCUMENTS_READ',
  'SCENARIO_PARTICIPATE',
  'SEANCE_INSCRIBE',
  'SEANCE_UNSUBSCRIBE',
  'POLL_READ',
  'POLL_VOTE',
  // Story 37.7
  'PARTIE_REFERENCE_ASSET_READ',
  'CHARACTER_CREATE',
  'CHARACTER_LIST',
  'CHARACTER_READ',
  'CHARACTER_PORTRAIT_READ',
  'CHARACTER_NOTES_READ',
  'GROUP_ROLE_READ',
  'ANNOUNCEMENT_READ',
  'ANNOUNCEMENT_MARK_READ',
];

/** Table action → capacité ÉCRITE EN DUR (Story 37.7), référence de `ACTION_CAPABILITY`. */
const CAPABILITY_BY_ACTION: Partial<Record<PermissionAction, GameSystemCapability>> = {
  CHARACTER_CREATE: 'characters',
  CHARACTER_XP_SET: 'xp',
  CHARACTER_SHEET_FIELD_SET: 'characters',
  XP_DISTRIBUTION_CREATE: 'xp',
  HOMME_DRAGON_MANAGE: 'hommeDragon',
  GROUP_ROLE_ASSIGN: 'groupRoles',
  ANNOUNCEMENT_CREATE: 'announcements',
};

/**
 * Actions de couche 3 qui n'exigent VOLONTAIREMENT aucune capacité (décision du 2026-10-10) : les
 * lectures renvoient vide / null sur un système sans la capacité, le retrait d'un lien et le
 * marquage d'une annonce lue restent possibles. Toute nouvelle action de couche 3 doit figurer soit
 * dans `CAPABILITY_BY_ACTION`, soit ici — jamais nulle part.
 */
const CAPABILITY_OPT_OUT: PermissionAction[] = [
  'CHARACTER_LIST',
  'CHARACTER_READ',
  'CHARACTER_PORTRAIT_READ',
  'CHARACTER_NOTES_READ',
  'CHARACTER_HISTORY_READ',
  'XP_DISTRIBUTION_READ',
  'HOMME_DRAGON_READ',
  'HOMME_DRAGON_UNLINK',
  'GROUP_ROLE_UNASSIGN',
  'GROUP_ROLE_READ',
  'ANNOUNCEMENT_READ',
  'ANNOUNCEMENT_MARK_READ',
];

/** Préfixes des actions de couche 3 (capacités JDR). */
const LAYER3_PREFIXES = ['CHARACTER_', 'XP_', 'HOMME_DRAGON_', 'GROUP_ROLE_', 'ANNOUNCEMENT_'];

const ACTIONS: PermissionAction[] = [...MJ_ONLY, ...MEMBER_ACTIONS];

describe('PermissionService', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let service: PermissionService;

  beforeEach(() => {
    prisma = makePrisma();
    prisma.partie.findUnique.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ A: PARTIE_A, B: PARTIE_B, D: PARTIE_D }[where.id] ?? null),
    );
    prisma.membership.findUnique.mockImplementation(membershipsOf({ A: [PLAYER], D: [PLAYER] }));
    service = new PermissionService(prisma as unknown as PrismaService);
  });

  describe('politique jdr — table complète', () => {
    it('JDR_POLICY est exactement la politique écrite en dur (aucune action en plus ni en moins)', () => {
      const expected: Record<string, string[]> = {};
      for (const action of MJ_ONLY) expected[action] = ['mj'];
      for (const action of MEMBER_ACTIONS) expected[action] = ['mj', 'player'];
      expect(JDR_POLICY).toEqual(expected);
    });

    it('ACTION_CAPABILITY est exactement la table écrite en dur (aucune action en plus ni en moins)', () => {
      expect(ACTION_CAPABILITY).toEqual(CAPABILITY_BY_ACTION);
    });

    it('toute action de couche 3 de la politique a une capacité OU figure dans la liste de dérogations nommée', () => {
      const layer3 = (Object.keys(JDR_POLICY) as PermissionAction[]).filter((action) =>
        LAYER3_PREFIXES.some((prefix) => action.startsWith(prefix)),
      );
      const unclassified = layer3.filter(
        (action) => !(action in ACTION_CAPABILITY) && !CAPABILITY_OPT_OUT.includes(action),
      );
      // Une action ajoutée à la politique sans choix explicite (capacité ou dérogation) échoue ici.
      expect(unclassified).toEqual([]);
    });

    it('une dérogation n’est jamais aussi dans ACTION_CAPABILITY, et désigne une action existante', () => {
      expect(CAPABILITY_OPT_OUT.filter((action) => action in ACTION_CAPABILITY)).toEqual([]);
      expect(CAPABILITY_OPT_OUT.filter((action) => !(action in JDR_POLICY))).toEqual([]);
    });

    it('la table de capacités ne contient que des écritures de couche 3', () => {
      const outside = (Object.keys(ACTION_CAPABILITY) as PermissionAction[]).filter(
        (action) => !LAYER3_PREFIXES.some((prefix) => action.startsWith(prefix)),
      );
      expect(outside).toEqual([]);
    });
  });

  describe('assert() — rôle mj', () => {
    it.each(ACTIONS)('%s : accordé au propriétaire, avec le rôle mj', async (action) => {
      const grant = await service.assert(MJ, action, { partieId: 'A' });
      expect(grant).toEqual(objectLike({ partieId: 'A', role: 'mj', partie: PARTIE_A }));
      // Le propriétaire n'a jamais besoin d'une ligne Membership.
      expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('assert() — rôle player (membre)', () => {
    it.each(MJ_ONLY)('%s : refusé à un membre — 403 « réservée au MJ »', async (action) => {
      const refusal = service.assert(PLAYER, action, { partieId: 'A' });
      await expect(refusal).rejects.toBeInstanceOf(ForbiddenException);
      await expect(refusal).rejects.toThrow(MJ_ONLY_MESSAGE);
    });

    it.each(MEMBER_ACTIONS)('%s : accordé à un membre, avec le rôle player', async (action) => {
      const grant = await service.assert(PLAYER, action, { partieId: 'A' });
      expect(grant).toEqual(objectLike({ partieId: 'A', role: 'player' }));
    });
  });

  describe('assert() — non-membre', () => {
    it.each(ACTIONS)('%s : refusé à un non-membre — 403 « pas accès »', async (action) => {
      const refusal = service.assert(STRANGER, action, { partieId: 'A' });
      await expect(refusal).rejects.toBeInstanceOf(ForbiddenException);
      await expect(refusal).rejects.toThrow(NO_ACCESS_MESSAGE);
    });
  });

  describe('assert() — cible introuvable (404, message historique)', () => {
    it('partie inconnue → 404 « Partie introuvable »', async () => {
      await expect(service.assert(MJ, 'PARTIE_READ', { partieId: 'zzz' })).rejects.toThrow(
        new NotFoundException('Partie introuvable'),
      );
    });

    it('événement inconnu → 404 « Scénario introuvable »', async () => {
      prisma.event.findUnique.mockResolvedValue(null);
      await expect(service.assert(MJ, 'SCENARIO_UPDATE', { eventId: 'zzz' })).rejects.toThrow(
        new NotFoundException('Scénario introuvable'),
      );
    });

    it.each([
      ['CHARACTER_READ', 'characterId', 'character', 'Personnage introuvable'],
      ['INVITATION_REVOKE', 'invitationId', 'invitation', 'Invitation introuvable'],
      ['INVITE_LINK_REVOKE', 'inviteLinkId', 'inviteLink', 'Lien introuvable'],
      ['ANNOUNCEMENT_MARK_READ', 'announcementId', 'announcement', 'Annonce introuvable'],
    ] as const)('%s : %s inconnu → 404 « %s »', async (action, key, model, message) => {
      prisma[model].findUnique.mockResolvedValue(null);
      await expect(service.assert(MJ, action, { [key]: 'zzz' } as never)).rejects.toThrow(
        new NotFoundException(message),
      );
    });

    it('séance inconnue → 404 « Séance introuvable »', async () => {
      prisma.seance.findUnique.mockResolvedValue(null);
      await expect(service.assert(MJ, 'SEANCE_DELETE', { seanceId: 'zzz' })).rejects.toThrow(
        new NotFoundException('Séance introuvable'),
      );
    });
  });

  describe('assert() — partie résolue depuis la cible (aucun IDOR)', () => {
    it('séance de la partie B visée par le MJ de A → 403, la partie B étant lue depuis la séance', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: 'seance-b',
        event: { id: 'event-b', partie: PARTIE_B },
      });

      const refusal = service.assert(MJ, 'SEANCE_DELETE', { seanceId: 'seance-b' });
      await expect(refusal).rejects.toBeInstanceOf(ForbiddenException);
      await expect(refusal).rejects.toThrow(NO_ACCESS_MESSAGE);
      expect(prisma.seance.findUnique).toHaveBeenCalledWith(
        objectLike({ where: { id: 'seance-b' } }),
      );
      // Jamais la partie A : aucune lecture par identifiant de partie.
      expect(prisma.partie.findUnique).not.toHaveBeenCalled();
    });

    it('événement de la partie B visé par le MJ de A → 403', async () => {
      prisma.event.findUnique.mockResolvedValue({ id: 'event-b', partie: PARTIE_B });

      await expect(
        service.assert(MJ, 'SCENARIO_STATUS_CHANGE', { eventId: 'event-b' }),
      ).rejects.toThrow(NO_ACCESS_MESSAGE);
    });

    it.each([
      ['CHARACTER_XP_SET', 'characterId', 'character'],
      ['INVITATION_REVOKE', 'invitationId', 'invitation'],
      ['INVITE_LINK_REVOKE', 'inviteLinkId', 'inviteLink'],
      ['ANNOUNCEMENT_MARK_READ', 'announcementId', 'announcement'],
    ] as const)(
      '%s : %s d’une autre partie visé par le MJ de A → 403, la partie B étant lue depuis la cible',
      async (action, key, model) => {
        prisma[model].findUnique.mockResolvedValue({ id: 'cible-b', partie: PARTIE_B });

        const refusal = service.assert(MJ, action, { [key]: 'cible-b' } as never);
        await expect(refusal).rejects.toBeInstanceOf(ForbiddenException);
        await expect(refusal).rejects.toThrow(NO_ACCESS_MESSAGE);
        // Jamais lue par identifiant de partie : la route n'a aucune part dans la décision.
        expect(prisma.partie.findUnique).not.toHaveBeenCalled();
      },
    );

    it.each([
      ['CHARACTER_XP_SET', 'characterId', 'character'],
      ['INVITATION_REVOKE', 'invitationId', 'invitation'],
      ['INVITE_LINK_REVOKE', 'inviteLinkId', 'inviteLink'],
      ['ANNOUNCEMENT_MARK_READ', 'announcementId', 'announcement'],
    ] as const)(
      '%s : %s de sa propre partie → autorisation portant la cible résolue',
      async (action, key, model) => {
        prisma[model].findUnique.mockResolvedValue({ id: 'cible-a', partie: PARTIE_A });

        const grant = await service.assert(MJ, action, { [key]: 'cible-a' } as never);
        expect(grant).toEqual(
          objectLike({ partieId: 'A', role: 'mj', target: { partieId: 'A', [key]: 'cible-a' } }),
        );
      },
    );

    it('séance de sa propre partie → autorisation portant la partie résolue', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: 'seance-a',
        event: { id: 'event-a', partie: PARTIE_A },
      });

      const grant = await service.assert(MJ, 'SEANCE_DELETE', { seanceId: 'seance-a' });
      // L'autorisation porte l'action contrôlée et la cible résolue (séance → son événement).
      expect(grant).toEqual(
        objectLike({
          partieId: 'A',
          role: 'mj',
          action: 'SEANCE_DELETE',
          target: { partieId: 'A', eventId: 'event-a', seanceId: 'seance-a' },
        }),
      );
    });

    it('membre de A, séance de A : action de membre accordée, action MJ refusée', async () => {
      prisma.seance.findUnique.mockResolvedValue({
        id: 'seance-a',
        event: { id: 'event-a', partie: PARTIE_A },
      });

      await expect(
        service.assert(PLAYER, 'SEANCE_INSCRIBE', { seanceId: 'seance-a' }),
      ).resolves.toEqual(objectLike({ partieId: 'A', role: 'player' }));
      await expect(
        service.assert(PLAYER, 'SEANCE_CAPACITY_SET', { seanceId: 'seance-a' }),
      ).rejects.toThrow(MJ_ONLY_MESSAGE);
    });
  });

  describe('assert() — garde de capacité (Story 37.7, AD-1)', () => {
    const CAPABILITY_ACTIONS = Object.entries(CAPABILITY_BY_ACTION) as [
      PermissionAction,
      GameSystemCapability,
    ][];

    it.each(CAPABILITY_ACTIONS)(
      '%s : le MJ d’une partie dont le système n’a pas la capacité « %s » → 400, avant toute écriture',
      async (action) => {
        const refusal = service.assert(MJ, action, { partieId: 'D' });
        await expect(refusal).rejects.toBeInstanceOf(BadRequestException);
        await expect(refusal).rejects.toThrow(CAPABILITY_UNAVAILABLE_MESSAGE);
      },
    );

    it.each(CAPABILITY_ACTIONS)(
      '%s : le rôle est contrôlé AVANT la capacité (un étranger reçoit « pas accès », pas 400)',
      async (action) => {
        await expect(service.assert(STRANGER, action, { partieId: 'D' })).rejects.toThrow(
          NO_ACCESS_MESSAGE,
        );
      },
    );

    it('un membre sur une action MJ d’une partie sans capacité reçoit « réservée au MJ », pas 400', async () => {
      await expect(
        service.assert(PLAYER, 'XP_DISTRIBUTION_CREATE', { partieId: 'D' }),
      ).rejects.toThrow(MJ_ONLY_MESSAGE);
    });

    it('une action sans capacité requise reste accordée sur une partie sans capacité (scénario, invitations)', async () => {
      await expect(service.assert(MJ, 'SCENARIO_CREATE', { partieId: 'D' })).resolves.toEqual(
        objectLike({ partieId: 'D', role: 'mj' }),
      );
      await expect(service.assert(MJ, 'INVITATION_CREATE', { partieId: 'D' })).resolves.toEqual(
        objectLike({ partieId: 'D', role: 'mj' }),
      );
    });

    it.each(CAPABILITY_OPT_OUT)(
      '%s : accordé à son rôle sur une partie sans capacité (lecture, retrait, marquage)',
      async (action) => {
        // Le MJ a toujours le droit ; les actions ouvertes aux membres le sont aussi à un joueur.
        await expect(service.assert(MJ, action, { partieId: 'D' })).resolves.toEqual(
          objectLike({ partieId: 'D', role: 'mj' }),
        );
        if (JDR_POLICY[action].includes('player')) {
          await expect(service.assert(PLAYER, action, { partieId: 'D' })).resolves.toEqual(
            objectLike({ partieId: 'D', role: 'player' }),
          );
        }
      },
    );

    it('un système de la famille ralliement (aucune capacité) refuse aussi', async () => {
      prisma.partie.findUnique.mockResolvedValue(partie('R', MJ, 'ralliement'));
      await expect(service.assert(MJ, 'CHARACTER_CREATE', { partieId: 'R' })).rejects.toThrow(
        CAPABILITY_UNAVAILABLE_MESSAGE,
      );
    });
  });

  describe('partie sans propriétaire (ownerId null, AD-5)', () => {
    const ORPHAN = partie('O', null);

    beforeEach(() => {
      prisma.partie.findUnique.mockResolvedValue(ORPHAN);
      prisma.membership.findUnique.mockImplementation(membershipsOf({ O: [PLAYER] }));
    });

    it('un membre garde ses droits de membre, mais n’est jamais mj', async () => {
      await expect(service.assert(PLAYER, 'PARTIE_READ', { partieId: 'O' })).resolves.toEqual(
        objectLike({ role: 'player' }),
      );
      await expect(service.assert(PLAYER, 'PARTIE_UPDATE', { partieId: 'O' })).rejects.toThrow(
        MJ_ONLY_MESSAGE,
      );
    });

    it('personne n’est mj : un non-membre est refusé, même pour une action MJ', async () => {
      await expect(service.assert(STRANGER, 'PARTIE_UPDATE', { partieId: 'O' })).rejects.toThrow(
        NO_ACCESS_MESSAGE,
      );
    });

    it('roleOf : membre → player, autre → null', async () => {
      prisma.partie.findUnique.mockResolvedValueOnce({
        ownerId: null,
        memberships: [{ userId: PLAYER }],
      });
      expect(await service.roleOf('O', PLAYER)).toBe('player');

      prisma.partie.findUnique.mockResolvedValueOnce({ ownerId: null, memberships: [] });
      expect(await service.roleOf('O', STRANGER)).toBeNull();
    });
  });

  describe('roleOf()', () => {
    it('propriétaire → mj, membre → player, autre → null, partie inconnue → null (une requête)', async () => {
      prisma.partie.findUnique.mockImplementation(
        ({ where }: { where: { id: string; memberships?: unknown } }) =>
          Promise.resolve(where.id === 'A' ? { ownerId: MJ, memberships: [] } : null),
      );
      expect(await service.roleOf('A', MJ)).toBe('mj');
      expect(await service.roleOf('A', STRANGER)).toBeNull();
      expect(await service.roleOf('zzz', MJ)).toBeNull();

      prisma.partie.findUnique.mockResolvedValue({
        ownerId: MJ,
        memberships: [{ userId: PLAYER }],
      });
      expect(await service.roleOf('A', PLAYER)).toBe('player');
      // Une seule requête par appel : l'appartenance est jointe, jamais relue à part.
      expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    });
  });

  describe('rolesOf() — lecture en lot', () => {
    it('{A: mj, B: player}, C absente — UNE seule requête', async () => {
      prisma.partie.findMany.mockResolvedValue([
        { id: 'A', ownerId: 'u' },
        { id: 'B', ownerId: 'quelqu-un' },
      ]);

      const roles = await service.rolesOf('u', ['A', 'B', 'C']);

      expect(Object.fromEntries(roles)).toEqual({ A: 'mj', B: 'player' });
      expect(roles.has('C')).toBe(false);
      expect(prisma.partie.findMany).toHaveBeenCalledTimes(1);
      expect(prisma.partie.findMany).toHaveBeenCalledWith({
        where: {
          id: { in: ['A', 'B', 'C'] },
          OR: [{ ownerId: 'u' }, { memberships: { some: { userId: 'u' } } }],
        },
        select: { id: true, ownerId: true },
      });
      expect(prisma.partie.findUnique).not.toHaveBeenCalled();
      expect(prisma.membership.findUnique).not.toHaveBeenCalled();
    });

    it('partie sans propriétaire retenue par le filtre → player, jamais mj', async () => {
      prisma.partie.findMany.mockResolvedValue([{ id: 'O', ownerId: null }]);
      expect(Object.fromEntries(await service.rolesOf('u', ['O']))).toEqual({ O: 'player' });
    });

    it('lot vide → aucune requête', async () => {
      expect((await service.rolesOf('u', [])).size).toBe(0);
      expect(prisma.partie.findMany).not.toHaveBeenCalled();
    });
  });

  describe('ownerOf()', () => {
    it('identité du propriétaire ; null sans propriétaire ou si son compte est absent', async () => {
      prisma.user.findUnique.mockResolvedValueOnce({ id: MJ, pseudo: 'mj', displayName: 'Le MJ' });
      expect(await service.ownerOf(PARTIE_A)).toEqual({
        userId: MJ,
        pseudo: 'mj',
        displayName: 'Le MJ',
      });

      expect(await service.ownerOf(partie('O', null))).toBeNull();

      prisma.user.findUnique.mockResolvedValueOnce(null);
      expect(await service.ownerOf(PARTIE_A)).toBeNull();
    });
  });

  describe('membersOf()', () => {
    it('propriétaire d’abord, puis membres dans l’ordre fixe de la troupe, dédoublonnés', async () => {
      prisma.user.findUnique.mockResolvedValue({ id: MJ, pseudo: 'mj', displayName: 'Le MJ' });
      prisma.membership.findMany.mockResolvedValue([
        { user: { id: 'u1', pseudo: 'alice', displayName: 'Alice' } },
        { user: { id: MJ, pseudo: 'mj', displayName: 'Le MJ' } },
        { user: { id: 'u2', pseudo: 'bob', displayName: 'Bob' } },
      ]);

      const members = await service.membersOf(PARTIE_A);

      expect(members.map((m) => m.userId)).toEqual([MJ, 'u1', 'u2']);
      expect(prisma.membership.findMany).toHaveBeenCalledWith(
        objectLike({
          where: { partieId: 'A' },
          orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }],
        }),
      );
    });

    it('partie sans propriétaire → ses seuls membres, sans lecture d’utilisateur', async () => {
      prisma.membership.findMany.mockResolvedValue([
        { user: { id: 'u1', pseudo: 'alice', displayName: 'Alice' } },
      ]);

      const members = await service.membersOf(partie('O', null));

      expect(members).toEqual([{ userId: 'u1', pseudo: 'alice', displayName: 'Alice' }]);
      expect(prisma.user.findUnique).not.toHaveBeenCalled();
    });
  });
});
