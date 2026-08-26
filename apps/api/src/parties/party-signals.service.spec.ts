import type { PartieDto } from '@master-jdr/shared';
import { PartySignalsService } from './party-signals.service';
import { objectLike } from '../common/test-utils/jest-typed';

describe('PartySignalsService', () => {
  let service: PartySignalsService;
  let prisma: {
    character: { findMany: jest.Mock };
    hommeDragon: { findMany: jest.Mock };
    membership: { groupBy: jest.Mock };
    scenario: { groupBy: jest.Mock; findMany: jest.Mock };
    seance: { findMany: jest.Mock };
    sessionPoll: { findMany: jest.Mock };
  };
  let parties: { listForUser: jest.Mock };

  function makePartie(overrides: Partial<PartieDto> = {}): PartieDto {
    return {
      id: 'p1',
      name: 'La Nuit',
      kind: 'ONE_SHOT',
      gameSystemId: 'draconis',
      description: null,
      mjId: 'mj1',
      createdAt: '2026-01-01T00:00:00.000Z',
      nextSessionDate: null,
      nextSessionSlot: null,
      role: 'mj',
      status: 'EN_COURS',
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      character: { findMany: jest.fn().mockResolvedValue([]) },
      hommeDragon: { findMany: jest.fn().mockResolvedValue([]) },
      membership: { groupBy: jest.fn().mockResolvedValue([]) },
      scenario: {
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([]),
      },
      seance: { findMany: jest.fn().mockResolvedValue([]) },
      sessionPoll: { findMany: jest.fn().mockResolvedValue([]) },
    };
    parties = { listForUser: jest.fn().mockResolvedValue([]) };
    service = new PartySignalsService(prisma as any, parties as any);
  });

  it('deferred-work (2026-08-24) : un utilisateur sans aucune Partie (ni MJ ni joueur) → objet vide, aucune erreur Prisma sur les requêtes groupées avec in: []', async () => {
    // `parties.listForUser` renvoie déjà [] par défaut (beforeEach) — simule directement le cas.
    const result = await service.getSignals('sans-partie');
    expect(result).toEqual({});
  });

  it('une partie sans aucun signal actif porte signals: [] (jamais une entrée absente, AC2)', async () => {
    // nextSessionDate null MAIS un poll OPEN existe déjà : ni PROCHAINE_SEANCE_CONNUE (pas de
    // date) ni AUCUNE_DATE_NI_VOTE (un vote est en cours) ne doivent se déclencher.
    parties.listForUser.mockImplementation((_userId: string, role: string) =>
      Promise.resolve(
        role === 'mj'
          ? [
              makePartie({
                id: 'p1',
                status: 'EN_COURS',
                nextSessionDate: null,
              }),
            ]
          : [],
      ),
    );
    prisma.hommeDragon.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.membership.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.scenario.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.sessionPoll.findMany.mockResolvedValue([{ partieId: 'p1', options: [] }]);

    const map = await service.getSignals('u1');
    expect(map['p1']).toEqual({ role: 'mj', status: 'EN_COURS', signals: [] });
  });

  it('PERSONNAGE_A_CREER (joueur) : actif si aucun Character pour cette partie', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'player' ? [makePartie({ id: 'p1', role: 'player' })] : []),
    );
    prisma.character.findMany.mockResolvedValue([]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).toContain('PERSONNAGE_A_CREER');
  });

  it('PERSONNAGE_A_CREER : absent si un Character existe déjà pour cette partie', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'player' ? [makePartie({ id: 'p1', role: 'player' })] : []),
    );
    prisma.character.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).not.toContain('PERSONNAGE_A_CREER');
  });

  it('VOTE_EN_COURS_SANS_REPONSE (joueur) : actif si un poll OPEN a une option sans vote de cet utilisateur', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'player' ? [makePartie({ id: 'p1', role: 'player' })] : []),
    );
    prisma.character.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.sessionPoll.findMany.mockResolvedValue([{ partieId: 'p1', options: [{ votes: [] }] }]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).toContain('VOTE_EN_COURS_SANS_REPONSE');
  });

  it('VOTE_EN_COURS_SANS_REPONSE : absent si toutes les options ont déjà le vote de cet utilisateur', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'player' ? [makePartie({ id: 'p1', role: 'player' })] : []),
    );
    prisma.character.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.sessionPoll.findMany.mockResolvedValue([
      { partieId: 'p1', options: [{ votes: [{ userId: 'u1' }] }] },
    ]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).not.toContain('VOTE_EN_COURS_SANS_REPONSE');
  });

  it('HOMME_DRAGON_A_CREER (MJ) : actif si aucun HommeDragon pour cette partie', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'mj' ? [makePartie({ id: 'p1' })] : []),
    );
    prisma.membership.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.scenario.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.hommeDragon.findMany.mockResolvedValue([]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).toContain('HOMME_DRAGON_A_CREER');
  });

  it('AUCUN_MEMBRE_INVITE (MJ) : actif si groupBy ne renvoie aucune ligne pour cette partie', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'mj' ? [makePartie({ id: 'p1' })] : []),
    );
    prisma.hommeDragon.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.scenario.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.membership.groupBy.mockResolvedValue([]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).toContain('AUCUN_MEMBRE_INVITE');
  });

  it('AUCUN_SCENARIO_EN_COURS (MJ) : actif si aucun scénario COURANT', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'mj' ? [makePartie({ id: 'p1' })] : []),
    );
    prisma.hommeDragon.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.membership.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.scenario.groupBy.mockResolvedValue([]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).toContain('AUCUN_SCENARIO_EN_COURS');
  });

  it('AUCUNE_DATE_NI_VOTE (MJ) : actif si nextSessionDate null et aucun poll OPEN', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'mj' ? [makePartie({ id: 'p1', nextSessionDate: null })] : []),
    );
    prisma.hommeDragon.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.membership.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.scenario.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.sessionPoll.findMany.mockResolvedValue([]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).toContain('AUCUNE_DATE_NI_VOTE');
  });

  it('AUCUNE_DATE_NI_VOTE : absent si un poll OPEN existe déjà, même sans nextSessionDate', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'mj' ? [makePartie({ id: 'p1', nextSessionDate: null })] : []),
    );
    prisma.hommeDragon.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.membership.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.scenario.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.sessionPoll.findMany.mockResolvedValue([{ partieId: 'p1', options: [] }]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).not.toContain('AUCUNE_DATE_NI_VOTE');
  });

  it('RAPPORT_FIN_MANQUANT (MJ) : actif si un scénario PASSE a resumeFin null', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'mj' ? [makePartie({ id: 'p1' })] : []),
    );
    prisma.hommeDragon.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.membership.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.scenario.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.scenario.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).toContain('RAPPORT_FIN_MANQUANT');
  });

  it('COMPTE_RENDU_NON_REDIGE (MJ) : actif si une séance validée a compteRendu null', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'mj' ? [makePartie({ id: 'p1' })] : []),
    );
    prisma.hommeDragon.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.membership.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.scenario.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.seance.findMany.mockResolvedValue([{ scenario: { partieId: 'p1' } }]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).toContain('COMPTE_RENDU_NON_REDIGE');
  });

  it('PROCHAINE_SEANCE_CONNUE : actif (informatif) si nextSessionDate renseigné', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(
        role === 'mj'
          ? [
              makePartie({
                id: 'p1',
                nextSessionDate: '2026-09-01T00:00:00.000Z',
              }),
            ]
          : [],
      ),
    );
    prisma.hommeDragon.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.membership.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.scenario.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).toContain('PROCHAINE_SEANCE_CONNUE');
  });

  it('deferred-work (2026-08-25) : nextSessionDate PASSÉ (jamais effacé après la date) → PROCHAINE_SEANCE_CONNUE absent, AUCUNE_DATE_NI_VOTE actif sans poll OPEN', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(
        role === 'mj'
          ? [
              makePartie({
                id: 'p1',
                nextSessionDate: '2020-01-01T00:00:00.000Z',
              }),
            ]
          : [],
      ),
    );
    prisma.hommeDragon.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.membership.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    prisma.scenario.groupBy.mockResolvedValue([{ partieId: 'p1', _count: { _all: 1 } }]);
    const map = await service.getSignals('u1');
    expect(map['p1'].signals).not.toContain('PROCHAINE_SEANCE_CONNUE');
    expect(map['p1'].signals).toContain('AUCUNE_DATE_NI_VOTE');
  });

  it('PARTIE_TERMINEE : seul avec les signaux de fin (AC5) — aucun signal AUCUN_MEMBRE_INVITE/AUCUN_SCENARIO_EN_COURS/etc.', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'mj' ? [makePartie({ id: 'p1', status: 'TERMINEE' })] : []),
    );
    // Conditions qui activeraient normalement HOMME_DRAGON_A_CREER/AUCUN_MEMBRE_INVITE/
    // AUCUN_SCENARIO_EN_COURS/AUCUNE_DATE_NI_VOTE si la partie n'était pas clôturée.
    prisma.hommeDragon.findMany.mockResolvedValue([]);
    prisma.membership.groupBy.mockResolvedValue([]);
    prisma.scenario.groupBy.mockResolvedValue([]);
    prisma.scenario.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.seance.findMany.mockResolvedValue([{ scenario: { partieId: 'p1' } }]);

    const map = await service.getSignals('u1');
    expect(map['p1'].signals.sort()).toEqual(
      ['COMPTE_RENDU_NON_REDIGE', 'RAPPORT_FIN_MANQUANT', 'PARTIE_TERMINEE'].sort(),
    );
  });

  it('PARTIE_TERMINEE (joueur) : garde explicite MJ-only — même si les requêtes groupées incluaient à tort une partie joueur, aucun signal de fin ne fuite (revue de code)', async () => {
    // Simule le scénario que la garde protège : les requêtes groupées renvoient p1 comme si elle
    // était dans le lot (elles sont normalement filtrées sur mjPartieIds) alors que l'utilisateur
    // n'a que le rôle player sur cette partie.
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(
        role === 'player' ? [makePartie({ id: 'p1', role: 'player', status: 'TERMINEE' })] : [],
      ),
    );
    prisma.scenario.findMany.mockResolvedValue([{ partieId: 'p1' }]);
    prisma.seance.findMany.mockResolvedValue([{ scenario: { partieId: 'p1' } }]);

    const map = await service.getSignals('u1');
    expect(map['p1'].signals).toEqual(['PARTIE_TERMINEE']);
  });

  it("scoping par rôle : un signal MJ n'apparaît jamais sur une partie où le rôle est player, et inversement", async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(role === 'player' ? [makePartie({ id: 'p-player', role: 'player' })] : []),
    );
    // Ne devrait jamais être consulté pour une partie player-only, mais on le renseigne quand
    // même pour vérifier qu'aucune fuite ne se produit si jamais il l'était.
    prisma.hommeDragon.findMany.mockResolvedValue([]);
    prisma.membership.groupBy.mockResolvedValue([]);
    prisma.scenario.groupBy.mockResolvedValue([]);
    prisma.character.findMany.mockResolvedValue([{ partieId: 'p-player' }]);

    const map = await service.getSignals('u1');
    expect(map['p-player'].signals).not.toContain('HOMME_DRAGON_A_CREER');
    expect(map['p-player'].signals).not.toContain('AUCUN_MEMBRE_INVITE');
    expect(map['p-player'].signals).not.toContain('AUCUN_SCENARIO_EN_COURS');
  });

  it('lecture en lot : chaque requête groupée est appelée une seule fois pour N parties (AD-3, pas de N+1)', async () => {
    parties.listForUser.mockImplementation((_u: string, role: string) =>
      Promise.resolve(
        role === 'mj'
          ? [makePartie({ id: 'p1' }), makePartie({ id: 'p2' })]
          : [makePartie({ id: 'p3', role: 'player' }), makePartie({ id: 'p4', role: 'player' })],
      ),
    );
    await service.getSignals('u1');

    expect(prisma.character.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.hommeDragon.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.membership.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.scenario.groupBy).toHaveBeenCalledTimes(1);
    expect(prisma.scenario.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.seance.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sessionPoll.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.sessionPoll.findMany).toHaveBeenCalledWith(
      objectLike({
        where: objectLike({
          partieId: { in: ['p1', 'p2', 'p3', 'p4'] },
        }),
      }),
    );
  });
});
