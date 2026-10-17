import request from 'supertest';
import { EventsService } from '../../src/events/events.service';
import { PartiesService } from '../../src/parties/parties.service';
import {
  RealtimeEventsService,
  partieTopic,
  userTopic,
} from '../../src/realtime/realtime-events.service';
import { Harness, body, isoDay, type TestUser } from './harness';

// Story 38.2 — création et droits d'un ralliement, au niveau HTTP : les deux formes (rencontre
// isolée, groupe), le rôle `admin`/`member` dérivé de `Membership.role`, la politique « voir /
// modifier la partie », le type définitif, l'exclusion des listes par rôle.

type PartieDtoLike = Record<string, unknown> & {
  id: string;
  role: string;
  status: string;
  kind: string;
  gameSystemId: string;
  name: string;
  ownerId: string;
};
type MemberLike = { userId: string };
type SignalsDto = Record<string, { role: string; status: string; signals: string[] }>;

const UNAVAILABLE = "Cette action n'est pas disponible pour ce type de partie";
const ADMIN_ONLY = 'Action réservée aux administrateurs de la partie';
const NO_ACCESS = "Vous n'avez pas accès à cette partie";

describe('Ralliement — création et droits (Story 38.2)', () => {
  let h: Harness;
  let admin: TestUser;
  let member: TestUser;
  let stranger: TestUser;

  beforeAll(async () => {
    h = await Harness.start();
    [admin, member, stranger] = await Promise.all([
      h.createUser('admin'),
      h.createUser('membre'),
      h.createUser('etranger'),
    ]);
  });

  afterAll(async () => {
    await h?.close();
  });

  describe('création', () => {
    it('rencontre isolée : un événement, une séance non datée, aucun scénario, créateur membre ADMIN', async () => {
      const { res, id, name } = await h.createPartie(admin, 'ONE_SHOT', 'isole', 'ralliement');
      expect(res.status).toBe(201);
      const partie = body<PartieDtoLike>(res);
      expect(partie.role).toBe('admin');
      expect(partie.kind).toBe('ONE_SHOT');
      expect(partie.gameSystemId).toBe('ralliement');
      expect(partie.ownerId).toBe(admin.id);
      // Aucun Scenario : le statut de la réponse de création est celui de GET /parties/:id.
      expect(partie.status).toBe('A_VENIR');
      const got = await admin.agent.get(`/parties/${id}`).expect(200);
      expect(body<PartieDtoLike>(got).status).toBe(partie.status);

      const events = await h.prisma.event.findMany({
        where: { partieId: id },
        include: { seances: true },
      });
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe(name);
      expect(events[0].seances).toHaveLength(1);
      expect(events[0].seances[0].startDate).toBeNull();
      expect(await h.prisma.scenario.count({ where: { event: { partieId: id } } })).toBe(0);

      const memberships = await h.prisma.membership.findMany({ where: { partieId: id } });
      expect(memberships).toHaveLength(1);
      expect(memberships[0]).toMatchObject({ userId: admin.id, role: 'ADMIN' });
    });

    it('groupe : membership ADMIN du créateur, aucun événement', async () => {
      const { res, id } = await h.createPartie(
        admin,
        'CAMPAGNE_EPISODIQUE',
        'groupe',
        'ralliement',
      );
      expect(res.status).toBe(201);
      const partie = body<PartieDtoLike>(res);
      expect(partie.role).toBe('admin');
      expect(partie.status).toBe('A_VENIR');

      expect(await h.prisma.event.count({ where: { partieId: id } })).toBe(0);
      const memberships = await h.prisma.membership.findMany({ where: { partieId: id } });
      expect(memberships).toHaveLength(1);
      expect(memberships[0]).toMatchObject({ userId: admin.id, role: 'ADMIN' });
    });

    it('CAMPAGNE_LINEAIRE refusée en 400, rien écrit', async () => {
      const name = `C38 lineaire ${h.suffix}`;
      const res = await admin.agent
        .post('/parties')
        .send({ name, kind: 'CAMPAGNE_LINEAIRE', gameSystemId: 'ralliement' });
      expect(res.status).toBe(400);
      expect(await h.prisma.partie.count({ where: { name } })).toBe(0);
    });

    it('une quête reste inchangée : aucun membership créé, rôle mj', async () => {
      const { res, id } = await h.createPartie(admin, 'ONE_SHOT', 'quete');
      expect(res.status).toBe(201);
      expect(body<PartieDtoLike>(res).role).toBe('mj');
      expect(await h.prisma.membership.count({ where: { partieId: id } })).toBe(0);
    });
  });

  describe('droits', () => {
    let partieId: string;

    beforeAll(async () => {
      ({ id: partieId } = await h.createPartie(
        admin,
        'CAMPAGNE_EPISODIQUE',
        'droits',
        'ralliement',
      ));
      await h.addMember(partieId, member);
    });

    it('voir : admin et membre lisent la partie, avec leur rôle', async () => {
      const asAdmin = await admin.agent.get(`/parties/${partieId}`).expect(200);
      expect(body<PartieDtoLike>(asAdmin).role).toBe('admin');
      const asMember = await member.agent.get(`/parties/${partieId}`).expect(200);
      expect(body<PartieDtoLike>(asMember).role).toBe('member');
    });

    it('voir : la liste des membres compte le créateur une seule fois', async () => {
      const res = await member.agent.get(`/parties/${partieId}/members`).expect(200);
      const ids = body<MemberLike[]>(res).map((m) => m.userId);
      expect([...ids].sort()).toEqual([admin.id, member.id].sort());
    });

    it('un étranger est refusé en 403 « pas accès » (lecture et modification)', async () => {
      const read = await stranger.agent.get(`/parties/${partieId}`).expect(403);
      expect(body<{ message: string }>(read).message).toBe(NO_ACCESS);
      const write = await stranger.agent
        .patch(`/parties/${partieId}`)
        .send({ name: 'Tentative' })
        .expect(403);
      expect(body<{ message: string }>(write).message).toBe(NO_ACCESS);
    });

    it('un membre ne modifie pas la partie : 403 « réservée aux administrateurs », rien écrit', async () => {
      const res = await member.agent
        .patch(`/parties/${partieId}`)
        .send({ name: 'Tentative' })
        .expect(403);
      expect(body<{ message: string }>(res).message).toBe(ADMIN_ONLY);
      const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id: partieId } });
      expect(stored.name).not.toBe('Tentative');
    });

    it('un admin renomme son ralliement', async () => {
      const res = await admin.agent
        .patch(`/parties/${partieId}`)
        .send({ name: `C38 renomme ${h.suffix}` })
        .expect(200);
      expect(body<PartieDtoLike>(res).role).toBe('admin');
    });

    it('renommer une rencontre isolée renomme son événement unique', async () => {
      const { id } = await h.createPartie(admin, 'ONE_SHOT', 'renom', 'ralliement');
      const newName = `C38 renomme isole ${h.suffix}`;
      await admin.agent.patch(`/parties/${id}`).send({ name: newName }).expect(200);
      const events = await h.prisma.event.findMany({ where: { partieId: id } });
      expect(events).toHaveLength(1);
      expect(events[0].title).toBe(newName);
    });

    it('une quête de JDR ne devient pas un ralliement par PATCH (400), rien écrit', async () => {
      const { id } = await h.createPartie(admin, 'CAMPAGNE_EPISODIQUE', 'quete-vers-ralliement');
      await admin.agent.patch(`/parties/${id}`).send({ gameSystemId: 'ralliement' }).expect(400);
      const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id } });
      expect(stored.gameSystemId).toBe('ryuutama');
      expect(await h.prisma.membership.count({ where: { partieId: id } })).toBe(0);
    });

    it('le type est définitif : kind ou système différent → 400, rien écrit', async () => {
      const kindRes = await admin.agent
        .patch(`/parties/${partieId}`)
        .send({ kind: 'ONE_SHOT' })
        .expect(400);
      expect(body<{ message: string }>(kindRes).message).toBe(
        "Le type d'un ralliement ne peut pas être modifié",
      );
      await admin.agent
        .patch(`/parties/${partieId}`)
        .send({ gameSystemId: 'ryuutama' })
        .expect(400);
      const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id: partieId } });
      expect(stored.kind).toBe('CAMPAGNE_EPISODIQUE');
      expect(stored.gameSystemId).toBe('ralliement');
    });

    it('PATCH /parties/:id/kind refusé par la politique (même à l’admin)', async () => {
      const res = await admin.agent
        .patch(`/parties/${partieId}/kind`)
        .send({ kind: 'ONE_SHOT' })
        .expect(403);
      expect(body<{ message: string }>(res).message).toBe(UNAVAILABLE);
    });

    it('les actions de JDR sont refusées à tous les rôles (scénarios)', async () => {
      for (const user of [admin, member]) {
        const list = await user.agent.get(`/parties/${partieId}/scenarios`).expect(403);
        expect(body<{ message: string }>(list).message).toBe(UNAVAILABLE);
        await user.agent
          .post(`/parties/${partieId}/scenarios`)
          .send({ title: 'Un scénario' })
          .expect(403);
      }
      expect(await h.prisma.scenario.count({ where: { event: { partieId } } })).toBe(0);
    });

    // Story 39.1 : clore, rouvrir et brûler un ralliement sont des droits d'administrateur.
    it('un membre ni ne clôt, ni ne rouvre, ni ne brûle : 403 « réservée aux administrateurs », rien écrit', async () => {
      for (const route of [
        () => member.agent.patch(`/parties/${partieId}/close`),
        () => member.agent.patch(`/parties/${partieId}/reopen`),
        () => member.agent.delete(`/parties/${partieId}`),
      ]) {
        const res = await route();
        expect(res.status).toBe(403);
        expect(body<{ message: string }>(res).message).toBe(ADMIN_ONLY);
      }
      const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id: partieId } });
      expect(stored.closedAt).toBeNull();
    });

    it('un étranger ni ne clôt, ni ne rouvre, ni ne brûle : 403 « pas accès », rien écrit', async () => {
      for (const route of [
        () => stranger.agent.patch(`/parties/${partieId}/close`),
        () => stranger.agent.patch(`/parties/${partieId}/reopen`),
        () => stranger.agent.delete(`/parties/${partieId}`),
      ]) {
        const res = await route();
        expect(res.status).toBe(403);
        expect(body<{ message: string }>(res).message).toBe(NO_ACCESS);
      }
      const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id: partieId } });
      expect(stored.closedAt).toBeNull();
    });

    it('un admin clôt puis rouvre son groupe (même état terminé que le JDR, réversible)', async () => {
      const { id } = await h.createPartie(admin, 'CAMPAGNE_EPISODIQUE', 'clore', 'ralliement');
      await h.addMember(id, member);
      const closed = await admin.agent.patch(`/parties/${id}/close`).expect(200);
      expect(body<PartieDtoLike>(closed).status).toBe('TERMINEE');
      expect(body<PartieDtoLike>(closed).role).toBe('admin');
      expect((await h.prisma.partie.findUniqueOrThrow({ where: { id } })).closedAt).not.toBeNull();
      const asMember = await member.agent.get(`/parties/${id}`).expect(200);
      expect(body<PartieDtoLike>(asMember).status).toBe('TERMINEE');
      const reopened = await admin.agent.patch(`/parties/${id}/reopen`).expect(200);
      expect(body<PartieDtoLike>(reopened).status).not.toBe('TERMINEE');
      expect((await h.prisma.partie.findUniqueOrThrow({ where: { id } })).closedAt).toBeNull();
    });

    it('un admin brûle son groupe : la partie et ses adhésions disparaissent', async () => {
      const { id } = await h.createPartie(admin, 'CAMPAGNE_EPISODIQUE', 'bruler', 'ralliement');
      await h.addMember(id, member);
      expect(await h.prisma.membership.count({ where: { partieId: id } })).toBeGreaterThan(0);
      await admin.agent.delete(`/parties/${id}`).expect(200);
      expect(await h.prisma.partie.findUnique({ where: { id } })).toBeNull();
      expect(await h.prisma.membership.count({ where: { partieId: id } })).toBe(0);
      await member.agent.get(`/parties/${id}`).expect(404);
    });
  });

  describe('listes', () => {
    it('absent de ?role=mj et ?role=player, présent dans la liste sans rôle avec admin / member', async () => {
      const owner = await h.createUser('liste-admin');
      const guest = await h.createUser('liste-membre');
      const { id } = await h.createPartie(owner, 'CAMPAGNE_EPISODIQUE', 'liste', 'ralliement');
      await h.addMember(id, guest);

      const mjList = body<PartieDtoLike[]>(await owner.agent.get('/parties').query({ role: 'mj' }));
      expect(mjList.map((p) => p.id)).not.toContain(id);
      const ownerPlayerList = body<PartieDtoLike[]>(
        await owner.agent.get('/parties').query({ role: 'player' }),
      );
      expect(ownerPlayerList.map((p) => p.id)).not.toContain(id);
      const guestPlayerList = body<PartieDtoLike[]>(
        await guest.agent.get('/parties').query({ role: 'player' }),
      );
      expect(guestPlayerList.map((p) => p.id)).not.toContain(id);

      const ownerAll = body<PartieDtoLike[]>(await owner.agent.get('/parties').expect(200));
      expect(ownerAll.find((p) => p.id === id)?.role).toBe('admin');
      const guestAll = body<PartieDtoLike[]>(await guest.agent.get('/parties').expect(200));
      expect(guestAll.find((p) => p.id === id)?.role).toBe('member');
    });

    it('un ralliement tout juste créé figure dans GET /parties (sans rôle) avec le rôle admin et sa famille (Story 38.5)', async () => {
      const owner = await h.createUser('liste-neuve');
      const { id } = await h.createPartie(owner, 'ONE_SHOT', 'liste-neuve', 'ralliement');
      const all = body<PartieDtoLike[]>(await owner.agent.get('/parties').expect(200));
      const created = all.find((p) => p.id === id);
      expect(created?.role).toBe('admin');
      expect(created?.gameSystemId).toBe('ralliement');
      expect(created?.kind).toBe('ONE_SHOT');
      // Aucun signal pour lui : la liste des signaux est bâtie sur les listes par rôle seulement.
      const signals = body<SignalsDto>(await owner.agent.get('/me/party-signals').expect(200));
      expect(Object.keys(signals)).not.toContain(id);
    });

    it('party-signals n’émet aucune entrée pour un ralliement', async () => {
      const owner = await h.createUser('signaux');
      const { id } = await h.createPartie(owner, 'ONE_SHOT', 'signaux', 'ralliement');
      // Témoin JDR du même utilisateur : il DOIT apparaître, sans quoi l'absence ne prouve rien.
      const { id: jdrId } = await h.createPartie(owner, 'CAMPAGNE_EPISODIQUE', 'signaux-jdr');
      const res = await owner.agent.get('/me/party-signals').expect(200);
      const signals = body<SignalsDto>(res);
      expect(signals[jdrId]).toEqual(
        expect.objectContaining({ role: 'mj', signals: expect.any(Array) as string[] }),
      );
      expect(Object.keys(signals)).not.toContain(id);
    });
  });

  // Story 38.4 (AD-1) : la page d'un ralliement n'affiche aucune section de JDR, et le serveur refuse
  // ces mêmes routes en direct — l'écran n'est jamais la seule barrière.
  describe('capacités de JDR absentes : refus en direct (Story 38.4)', () => {
    const ZERO = '00000000-0000-4000-8000-000000000000';
    // Un PNG 1×1 : octets valides, de sorte que la validation du fichier ne précède pas le refus.
    const PNG_1X1 = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
      'base64',
    );
    let partieId: string;
    /** Séance unique de la rencontre isolée : seul vrai identifiant de séance atteignable ici. */
    let seanceId: string;

    beforeAll(async () => {
      // Rencontre isolée : elle porte un événement et une séance réels, de quoi sonder les routes
      // de séance avec un vrai identifiant (un identifiant aléatoire ne prouverait qu'un 404).
      ({ id: partieId } = await h.createPartie(admin, 'ONE_SHOT', 'refus-jdr', 'ralliement'));
      await h.addMember(partieId, member);
      const seance = await h.prisma.seance.findFirstOrThrow({ where: { event: { partieId } } });
      seanceId = seance.id;
    });

    type Probe = {
      label: string;
      /** Statuts admis : 403 par défaut ; 403 ou 404 pour un identifiant aléatoire (rien à agir). */
      allowed?: number[];
      send: (user: TestUser) => Promise<{ status: number }>;
    };
    const p = (id: string) => `/parties/${id}`;
    const probes = (): Probe[] => [
      {
        label: 'POST xp-distributions',
        send: (u) =>
          u.agent
            .post(`${p(partieId)}/xp-distributions`)
            .send({ entries: [{ characterId: ZERO, amount: 1 }] }),
      },
      {
        label: 'GET xp-distributions',
        send: (u) => u.agent.get(`${p(partieId)}/xp-distributions`),
      },
      {
        label: 'POST homme-dragon',
        send: (u) =>
          u.agent
            .post(`${p(partieId)}/homme-dragon`)
            .send({ race: 'DRAGON_VERT', artefact: { key: 'x' }, nom: 'Nom' }),
      },
      { label: 'GET homme-dragon', send: (u) => u.agent.get(`${p(partieId)}/homme-dragon`) },
      {
        label: 'PUT homme-dragon/:id',
        send: (u) => u.agent.put(`${p(partieId)}/homme-dragon/${ZERO}`),
      },
      {
        label: 'DELETE homme-dragon/:id',
        send: (u) => u.agent.delete(`${p(partieId)}/homme-dragon/${ZERO}`),
      },
      {
        label: 'POST announcements',
        send: (u) => u.agent.post(`${p(partieId)}/announcements`).send({ text: 'Une annonce' }),
      },
      { label: 'GET announcements', send: (u) => u.agent.get(`${p(partieId)}/announcements`) },
      {
        label: 'PUT visibility-locks',
        send: (u) => u.agent.put(`${p(partieId)}/visibility-locks`).send({ paths: [] }),
      },
      {
        label: 'GET visibility-locks',
        send: (u) => u.agent.get(`${p(partieId)}/visibility-locks`),
      },
      { label: 'GET characters', send: (u) => u.agent.get(`${p(partieId)}/characters`) },
      {
        label: 'POST characters',
        send: (u) =>
          u.agent
            .post(`${p(partieId)}/characters`)
            .send({ gameSystemId: 'ralliement', sheetData: { a: 1 } }),
      },
      // Invitations, liens et retrait d'un membre : ouverts à l'administrateur depuis la Story 39.3
      // (describe « inviter » ci-dessous) — retirés de cette liste de capacités absentes.
      // Story 40.1 : une rencontre isolée n'accueille pas de nouvelle conjonction (réservé au groupe).
      {
        label: 'POST events (conjonction)',
        send: (u) =>
          u.agent
            .post(`${p(partieId)}/events`)
            .send({ title: 'Une conjonction', date: '2030-01-01', slot: 'EVENING' }),
      },
      { label: 'GET poll', send: (u) => u.agent.get(`${p(partieId)}/poll`) },
      {
        label: 'POST poll/:id/vote',
        send: (u) =>
          u.agent.post(`${p(partieId)}/poll/${ZERO}/vote`).send({ optionId: ZERO, answer: 'YES' }),
      },
      {
        label: 'PATCH poll/:id/choose',
        send: (u) => u.agent.patch(`${p(partieId)}/poll/${ZERO}/choose`).send({ optionId: ZERO }),
      },
      {
        label: 'PUT poll/:id/options',
        send: (u) =>
          u.agent.put(`${p(partieId)}/poll/${ZERO}/options`).send({
            options: [
              { date: '2030-01-01', slot: 'EVENING' },
              { date: '2030-01-02', slot: 'EVENING' },
            ],
          }),
      },
      { label: 'DELETE poll/:id', send: (u) => u.agent.delete(`${p(partieId)}/poll/${ZERO}`) },
      { label: 'GET available-slots', send: (u) => u.agent.get(`${p(partieId)}/available-slots`) },
      {
        label: 'GET heatmap',
        send: (u) =>
          u.agent.get(`${p(partieId)}/heatmap`).query({ from: '2030-01-01', to: '2030-01-07' }),
      },
      // Scénarios : aucun n'existe dans un ralliement, les routes de la partie sont refusées.
      { label: 'GET scenarios', send: (u) => u.agent.get(`${p(partieId)}/scenarios`) },
      {
        label: 'GET scenarios/drafts',
        send: (u) => u.agent.get(`${p(partieId)}/scenarios/drafts`),
      },
      {
        label: 'POST scenarios',
        send: (u) => u.agent.post(`${p(partieId)}/scenarios`).send({ title: 'Un scénario' }),
      },
      { label: 'GET documents', send: (u) => u.agent.get(`${p(partieId)}/documents`) },
      // Routes d'un scénario : identifiant aléatoire (aucun scénario possible) → 403 ou 404, jamais d'action.
      ...(
        [
          ['PATCH scenarios/:id', 'patch', '', { title: 'X' }],
          ['PATCH scenarios/:id/open', 'patch', '/open', undefined],
          ['PATCH scenarios/:id/courant', 'patch', '/courant', undefined],
          ['PATCH scenarios/:id/passe', 'patch', '/passe', undefined],
          ['PATCH scenarios/:id/resume-fin', 'patch', '/resume-fin', { resumeFin: 'x' }],
          ['POST scenarios/:id/participate', 'post', '/participate', undefined],
          ['POST scenarios/:id/seances', 'post', '/seances', undefined],
          ['GET scenarios/:id/documents', 'get', '/documents', undefined],
        ] as const
      ).map(([label, method, suffix, payload]): Probe => ({
        label,
        allowed: [403, 404],
        send: (u) => {
          const req = u.agent[method](`/scenarios/${ZERO}${suffix}`);
          return payload ? req.send(payload) : req;
        },
      })),
      // Séances : vraie séance de la rencontre isolée → refusées (la politique ne les ouvre à personne).
      {
        label: 'DELETE seances/:id',
        send: (u) => u.agent.delete(`/scenarios/seances/${seanceId}`),
      },
      {
        label: 'POST seances/:id/poll',
        send: (u) =>
          u.agent.post(`/scenarios/seances/${seanceId}/poll`).send({
            options: [
              { date: '2030-01-01', slot: 'EVENING' },
              { date: '2030-01-02', slot: 'EVENING' },
            ],
          }),
      },
      {
        label: 'PATCH seances/:id/reset-date',
        send: (u) => u.agent.patch(`/scenarios/seances/${seanceId}/reset-date`),
      },
      {
        label: 'PATCH seances/:id/capacite',
        send: (u) =>
          u.agent
            .patch(`/scenarios/seances/${seanceId}/capacite`)
            .send({ inscriptionMin: 1, inscriptionMax: 4 }),
      },
      {
        label: 'POST seances/:id/inscription',
        send: (u) => u.agent.post(`/scenarios/seances/${seanceId}/inscription`),
      },
      {
        label: 'DELETE seances/:id/inscription',
        send: (u) => u.agent.delete(`/scenarios/seances/${seanceId}/inscription`),
      },
      {
        label: 'PATCH seances/:id/compte-rendu',
        send: (u) =>
          u.agent.patch(`/scenarios/seances/${seanceId}/compte-rendu`).send({ compteRendu: 'x' }),
      },
      {
        label: 'PATCH seances/:id/infos-pratiques',
        send: (u) =>
          u.agent
            .patch(`/scenarios/seances/${seanceId}/infos-pratiques`)
            .send({ heureRdv: '20:00', lieu: 'Salle', notePratique: null }),
      },
      // Rôles de groupe et ressources d'un système de jeu.
      {
        label: 'GET character-roles',
        send: (u) => u.agent.get(`${p(partieId)}/character-roles`),
      },
      {
        label: 'POST characters/:id/role',
        send: (u) => u.agent.post(`${p(partieId)}/characters/${ZERO}/role`).send({ roleKey: 'x' }),
      },
      {
        label: 'DELETE characters/:id/role',
        send: (u) => u.agent.delete(`${p(partieId)}/characters/${ZERO}/role`),
      },
      {
        label: 'GET game-systems/ryuutama/assets/journal',
        send: (u) => u.agent.get(`${p(partieId)}/game-systems/ryuutama/assets/journal`),
      },
    ];

    /** Instantané de tout ce que ces routes pourraient écrire, pour prouver qu'aucune ne l'a fait. */
    const snapshot = async () => {
      const where = { partieId };
      return {
        announcements: await h.prisma.announcement.count({ where }),
        xpDistributions: await h.prisma.xpDistribution.count({ where }),
        visibilityLocks: await h.prisma.partieVisibilityLock.count({ where }),
        invitations: await h.prisma.invitation.count({ where }),
        inviteLinks: await h.prisma.inviteLink.count({ where }),
        characters: await h.prisma.character.count({ where }),
        scenarios: await h.prisma.scenario.count({ where: { event: { partieId } } }),
        memberships: (await h.prisma.membership.findMany({ where }))
          .map((m) => `${m.userId}:${m.role}`)
          .sort(),
        // La séance entière, champ par champ : date, capacité, compte rendu, infos pratiques, vote.
        seances: JSON.stringify(
          await h.prisma.seance.findMany({
            where: { event: { partieId } },
            orderBy: { id: 'asc' },
          }),
        ),
        partie: JSON.stringify(
          await h.prisma.partie.findUniqueOrThrow({ where: { id: partieId } }),
        ),
      };
    };

    it.each(['admin', 'membre', 'étranger'])(
      '%s : chaque route d’une capacité absente est refusée en 403',
      async (who) => {
        const user = who === 'admin' ? admin : who === 'membre' ? member : stranger;
        // Jest n'accepte pas de message : on collecte les écarts pour nommer la route fautive.
        const ecarts: string[] = [];
        for (const probe of probes()) {
          const res = await probe.send(user);
          if (!(probe.allowed ?? [403]).includes(res.status)) {
            ecarts.push(`${probe.label} → ${res.status}`);
          }
        }
        expect(ecarts).toEqual([]);
      },
    );

    it('aucune écriture n’a eu lieu : on sonde toutes les routes puis on compare l’état avant / après', async () => {
      const avant = await snapshot();
      for (const user of [admin, member, stranger]) {
        for (const probe of probes()) await probe.send(user);
      }
      expect(await snapshot()).toEqual(avant);
    });

    it('témoin positif : admin et membre lisent la partie et ses membres (créateur une fois), un étranger est refusé', async () => {
      for (const user of [admin, member]) {
        await user.agent.get(p(partieId)).expect(200);
        const res = await user.agent.get(`${p(partieId)}/members`).expect(200);
        const ids = body<MemberLike[]>(res).map((m) => m.userId);
        expect([...ids].sort()).toEqual([admin.id, member.id].sort());
      }
      await stranger.agent.get(p(partieId)).expect(403);
      await stranger.agent.get(`${p(partieId)}/members`).expect(403);
    });

    it('un membre ne change pas la couverture (403 « réservée aux administrateurs »), un étranger non plus', async () => {
      const asMember = await member.agent
        .put(`${p(partieId)}/cover`)
        .attach('file', PNG_1X1, { filename: 'c.png', contentType: 'image/png' });
      expect(asMember.status).toBe(403);
      expect(body<{ message: string }>(asMember).message).toBe(ADMIN_ONLY);
      const asStranger = await stranger.agent
        .put(`${p(partieId)}/cover`)
        .attach('file', PNG_1X1, { filename: 'c.png', contentType: 'image/png' });
      expect(asStranger.status).toBe(403);
      const removed = await member.agent.delete(`${p(partieId)}/cover`);
      expect(removed.status).toBe(403);
      const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id: partieId } });
      expect(stored.coverImageUrl).toBeNull();
    });
  });
});

// Story 39.3 — inviter quelqu'un dans un groupe : l'administrateur invite par pseudo, par e-mail et
// par lien, retire un simple membre ; un membre ou un étranger est refusé en 403 sur chaque route.
describe('Ralliement — inviter dans un groupe (Story 39.3)', () => {
  let h: Harness;
  let admin: TestUser;
  let admin2: TestUser;
  let member: TestUser;
  let stranger: TestUser;
  let partieId: string;
  const registeredEmails: string[] = [];

  type InvitationLike = { id: string; partie?: { gameSystemId: string } };
  type LinkLike = { id: string; token: string };

  beforeAll(async () => {
    h = await Harness.start();
    [admin, admin2, member, stranger] = await Promise.all([
      h.createUser('inv-admin'),
      h.createUser('inv-admin2'),
      h.createUser('inv-membre'),
      h.createUser('inv-etranger'),
    ]);
    ({ id: partieId } = await h.createPartie(
      admin,
      'CAMPAGNE_EPISODIQUE',
      'inviter',
      'ralliement',
    ));
    await h.addMember(partieId, admin2, 'ADMIN');
    await h.addMember(partieId, member);
  });

  afterAll(async () => {
    // Comptes créés par l'inscription par lien : le banc ne les connaît pas.
    if (registeredEmails.length > 0) {
      await h.prisma.user.deleteMany({ where: { email: { in: registeredEmails } } });
    }
    await h?.close();
  });

  const membershipOf = (userId: string) =>
    h.prisma.membership.findUnique({ where: { userId_partieId: { userId, partieId } } });

  describe('refus', () => {
    let invitationId: string;
    let linkId: string;

    beforeAll(async () => {
      const target = await h.createUser('inv-cible-refus');
      const inv = await admin.agent
        .post(`/parties/${partieId}/invitations`)
        .send({ inviteeUserId: target.id })
        .expect(201);
      invitationId = body<InvitationLike>(inv).id;
      const link = await admin.agent.post(`/parties/${partieId}/invite-links`).send({}).expect(201);
      linkId = body<LinkLike>(link).id;
    });

    const routes = (user: TestUser) => [
      {
        label: 'POST invitations',
        send: () =>
          user.agent.post(`/parties/${partieId}/invitations`).send({ inviteeUserId: stranger.id }),
      },
      {
        label: 'POST invitations/by-email',
        send: () =>
          user.agent
            .post(`/parties/${partieId}/invitations/by-email`)
            .send({ email: `refus-${h.suffix}@test.local` }),
      },
      { label: 'GET invitations', send: () => user.agent.get(`/parties/${partieId}/invitations`) },
      {
        label: 'DELETE invitations/:id',
        send: () => user.agent.delete(`/invitations/${invitationId}`),
      },
      {
        label: 'POST invite-links',
        send: () => user.agent.post(`/parties/${partieId}/invite-links`).send({}),
      },
      {
        label: 'GET invite-links',
        send: () => user.agent.get(`/parties/${partieId}/invite-links`),
      },
      {
        label: 'DELETE invite-links/:id',
        send: () => user.agent.delete(`/invite-links/${linkId}`),
      },
      {
        label: 'DELETE members/:userId',
        send: () => user.agent.delete(`/parties/${partieId}/members/${admin2.id}`),
      },
    ];

    const snapshot = async () => ({
      invitations: await h.prisma.invitation.findMany({
        where: { partieId },
        orderBy: { id: 'asc' },
      }),
      links: await h.prisma.inviteLink.findMany({ where: { partieId }, orderBy: { id: 'asc' } }),
      memberships: (await h.prisma.membership.findMany({ where: { partieId } }))
        .map((m) => `${m.userId}:${m.role}`)
        .sort(),
    });

    it.each([
      ['un membre', 'member', ADMIN_ONLY],
      ['un étranger', 'stranger', NO_ACCESS],
    ] as const)(
      '%s : chaque route d’invitation, de lien et de retrait est refusée en 403, rien écrit',
      async (_label, who, message) => {
        const user = who === 'member' ? member : stranger;
        const avant = await snapshot();
        const ecarts: string[] = [];
        for (const route of routes(user)) {
          const res = await route.send();
          if (res.status !== 403 || body<{ message: string }>(res).message !== message) {
            ecarts.push(`${route.label} → ${res.status}`);
          }
        }
        expect(ecarts).toEqual([]);
        expect(await snapshot()).toEqual(avant);
      },
    );
  });

  describe('par pseudo', () => {
    it('un admin invite, l’invité (carte « groupe ») accepte et devient MEMBER ; les autres membres le voient', async () => {
      const invitee = await h.createUser('inv-pseudo');
      const notify = jest.spyOn(h.app.get(PartiesService), 'notifyPartieSignalsChanged');
      try {
        // Un second administrateur invite : le signal part vers le propriétaire, pas l'invitant.
        const created = await admin2.agent
          .post(`/parties/${partieId}/invitations`)
          .send({ inviteeUserId: invitee.id })
          .expect(201);
        const invitationId = body<InvitationLike>(created).id;

        const received = body<InvitationLike[]>(
          await invitee.agent.get('/invitations').expect(200),
        );
        expect(received.find((i) => i.id === invitationId)?.partie?.gameSystemId).toBe(
          'ralliement',
        );

        await invitee.agent.post(`/invitations/${invitationId}/accept`).expect(201);
        expect(await membershipOf(invitee.id)).toMatchObject({ role: 'MEMBER' });
        expect(notify).toHaveBeenCalledWith(partieId, admin.id);

        const asMember = await member.agent.get(`/parties/${partieId}/members`).expect(200);
        expect(body<MemberLike[]>(asMember).map((m) => m.userId)).toContain(invitee.id);
      } finally {
        notify.mockRestore();
      }
    });

    it('un utilisateur déjà membre : 409 « du groupe »', async () => {
      const res = await admin.agent
        .post(`/parties/${partieId}/invitations`)
        .send({ inviteeUserId: member.id })
        .expect(409);
      expect(body<{ message: string }>(res).message).toBe(
        'Cet utilisateur est déjà membre du groupe.',
      );
    });

    it('l’admin révoque une invitation en attente', async () => {
      const target = await h.createUser('inv-revoque');
      const created = await admin.agent
        .post(`/parties/${partieId}/invitations`)
        .send({ inviteeUserId: target.id })
        .expect(201);
      const id = body<InvitationLike>(created).id;
      await admin.agent.delete(`/invitations/${id}`).expect(200);
      const stored = await h.prisma.invitation.findUniqueOrThrow({ where: { id } });
      expect(stored.status).toBe('REVOKED');
    });
  });

  describe('par e-mail', () => {
    it('adresse inconnue : e-mail « group-invitation » au nom de l’invitant, avec un lien de jonction', async () => {
      const to = `inconnu-${h.suffix}@test.local`;
      const res = await admin.agent
        .post(`/parties/${partieId}/invitations/by-email`)
        .send({ email: to })
        .expect(201);
      expect(body<{ ok: boolean }>(res).ok).toBe(true);
      const sent = h.email.calls.filter((c) => c.to === to);
      expect(sent).toHaveLength(1);
      expect(sent[0].template).toBe('group-invitation');
      expect(sent[0].data).toMatchObject({ inviterName: admin.displayName });
      expect(String(sent[0].data.link)).toContain('/join/');
    });

    it('adresse d’un compte existant : invitation en attente + e-mail de groupe vers le tableau de bord', async () => {
      const known = await h.createUser('inv-connu');
      const res = await admin.agent
        .post(`/parties/${partieId}/invitations/by-email`)
        .send({ email: known.email })
        .expect(201);
      expect(body<{ ok: boolean }>(res).ok).toBe(true);
      const sent = h.email.calls.filter((c) => c.to === known.email);
      expect(sent.map((c) => c.template)).toEqual(['group-invitation']);
      expect(
        await h.prisma.invitation.count({
          where: { partieId, inviteeUserId: known.id, status: 'PENDING' },
        }),
      ).toBe(1);
    });
  });

  describe('par lien', () => {
    it('l’invité connecté rejoint en MEMBER ; un second essai, comme le créateur, est refusé en 409 neutre', async () => {
      const joiner = await h.createUser('inv-lien');
      const link = await admin.agent.post(`/parties/${partieId}/invite-links`).send({}).expect(201);
      const { token } = body<LinkLike>(link);

      const preview = await joiner.agent.get(`/invite-links/${token}`).expect(200);
      expect(body<{ gameSystemId: string }>(preview).gameSystemId).toBe('ralliement');

      await joiner.agent.post(`/invite-links/${token}/join`).expect(201);
      expect(await membershipOf(joiner.id)).toMatchObject({ role: 'MEMBER' });

      for (const user of [joiner, admin]) {
        const again = await user.agent.post(`/invite-links/${token}/join`).expect(409);
        const message = body<{ message: string }>(again).message;
        expect(message).toBe('Vous êtes déjà membre de ce groupe.');
        expect(message).not.toMatch(/MJ|partie/);
      }
    });

    it('l’inscription par lien crée un MEMBER ; un lien révoqué est refusé', async () => {
      const link = await admin.agent.post(`/parties/${partieId}/invite-links`).send({}).expect(201);
      const { token, id } = body<LinkLike>(link);
      const email = `inscrit-${h.suffix}@test.local`;
      registeredEmails.push(email);
      await request
        .agent(h.app.getHttpServer())
        .post('/auth/register')
        .send({ email, pseudo: `inscrit-${h.suffix}`, password: 'MotDePasse-123', token })
        .expect(201);
      const created = await h.prisma.user.findUniqueOrThrow({ where: { email } });
      expect(await membershipOf(created.id)).toMatchObject({ role: 'MEMBER' });

      await admin.agent.delete(`/invite-links/${id}`).expect(200);
      const late = await h.createUser('inv-revoque-lien');
      await late.agent.post(`/invite-links/${token}/join`).expect(403);
    });
  });

  describe('retrait', () => {
    it('l’admin retire un simple membre : adhésion supprimée', async () => {
      const leaver = await h.createUser('inv-retire');
      await h.addMember(partieId, leaver);
      await admin.agent.delete(`/parties/${partieId}/members/${leaver.id}`).expect(200);
      expect(await membershipOf(leaver.id)).toBeNull();
      await leaver.agent.get(`/parties/${partieId}`).expect(403);
    });

    it.each([
      ['le créateur resté administrateur', 'admin2', 'admin'],
      ['un autre administrateur', 'admin', 'admin2'],
      ['soi-même', 'admin', 'admin'],
    ] as const)('refuse de retirer %s : 409, adhésion intacte', async (_label, caller, target) => {
      const users = { admin, admin2 };
      const res = await users[caller].agent
        .delete(`/parties/${partieId}/members/${users[target].id}`)
        .expect(409);
      expect(body<{ message: string }>(res).message).toContain('membre ordinaire');
      expect(await membershipOf(users[target].id)).not.toBeNull();
    });

    // Story 39.5 : c'est le rôle qui décide, plus `ownerId` — le créateur redevenu simple membre se
    // retire comme les autres, et le groupe n'a plus de propriétaire.
    it('le créateur devenu simple membre est retirable : adhésion supprimée, ownerId vide', async () => {
      const { id } = await h.createPartie(
        admin,
        'CAMPAGNE_EPISODIQUE',
        'retrait-createur',
        'ralliement',
      );
      await h.addMember(id, admin2, 'ADMIN');
      await admin.agent
        .patch(`/parties/${id}/members/${admin.id}/role`)
        .send({ role: 'MEMBER' })
        .expect(200);

      await admin2.agent.delete(`/parties/${id}/members/${admin.id}`).expect(200);

      const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id } });
      expect(stored.ownerId).toBeNull();
      expect(
        await h.prisma.membership.findUnique({
          where: { userId_partieId: { userId: admin.id, partieId: id } },
        }),
      ).toBeNull();
      // Sans adhésion ni propriété, l'ancien créateur n'a plus aucun accès.
      await admin.agent.get(`/parties/${id}`).expect(403);
    });

    it('membre inconnu du groupe : 404', async () => {
      await admin.agent.delete(`/parties/${partieId}/members/${stranger.id}`).expect(404);
    });
  });

  // Comportement ACCEPTÉ, à réviser avec l'epic 41 : la politique d'invitation est posée pour la
  // FAMILLE entière (décision de la Story 39.3), donc l'admin d'une rencontre isolée (ONE_SHOT) peut
  // créer un lien d'invitation alors que l'interface en est réservée aux groupes. L'invitation à
  // usage unique de l'epic 41 devra trancher (restreindre la cellule ou l'assumer) et ce test avec.
  it('rencontre isolée : l’admin crée un lien (accepté jusqu’à l’epic 41), le membre et l’étranger sont refusés', async () => {
    const { id } = await h.createPartie(admin, 'ONE_SHOT', 'inviter-isolee', 'ralliement');
    await h.addMember(id, member);

    const asAdmin = await admin.agent.post(`/parties/${id}/invite-links`).send({});
    expect(asAdmin.status).toBeGreaterThanOrEqual(200);
    expect(asAdmin.status).toBeLessThan(300);

    const asMember = await member.agent.post(`/parties/${id}/invite-links`).send({}).expect(403);
    expect(body<{ message: string }>(asMember).message).toBe(ADMIN_ONLY);
    const asStranger = await stranger.agent
      .post(`/parties/${id}/invite-links`)
      .send({})
      .expect(403);
    expect(body<{ message: string }>(asStranger).message).toBe(NO_ACCESS);
  });
});

// Story 39.4 — nommer des administrateurs et quitter l'office : mouvements autorisés, refus (membre,
// étranger, JDR, rencontre isolée), dernier administrateur sous confirmation explicite, et deux
// départs simultanés sous le verrou de la partie.
describe("Ralliement — nommer des admins et quitter l'office (Story 39.4)", () => {
  let h: Harness;
  let admin: TestUser;
  let admin2: TestUser;
  let member: TestUser;
  let member2: TestUser;
  let stranger: TestUser;

  type MemberRoleLike = { userId: string; role: string };
  const LAST_ADMIN = 'dernier administrateur';

  beforeAll(async () => {
    h = await Harness.start();
    [admin, admin2, member, member2, stranger] = await Promise.all([
      h.createUser('role-admin'),
      h.createUser('role-admin2'),
      h.createUser('role-membre'),
      h.createUser('role-membre2'),
      h.createUser('role-etranger'),
    ]);
  });

  afterAll(async () => {
    await h?.close();
  });

  /** Un groupe neuf : `admin` (créateur) + les membres demandés. */
  const newGroup = async (label: string, members: [TestUser, 'ADMIN' | 'MEMBER'][] = []) => {
    const { id } = await h.createPartie(admin, 'CAMPAGNE_EPISODIQUE', label, 'ralliement');
    for (const [user, role] of members) await h.addMember(id, user, role);
    return id;
  };
  const roleOf = async (partieId: string, userId: string) =>
    (await h.prisma.membership.findUnique({ where: { userId_partieId: { userId, partieId } } }))
      ?.role ?? null;
  const setRole = (
    who: TestUser,
    partieId: string,
    targetId: string,
    payload: Record<string, unknown>,
  ) => who.agent.patch(`/parties/${partieId}/members/${targetId}/role`).send(payload);

  it('un admin nomme un membre ordinaire : il devient ADMIN, la liste des membres le dit', async () => {
    const id = await newGroup('role-nommer', [[member, 'MEMBER']]);
    await setRole(admin, id, member.id, { role: 'ADMIN' }).expect(200);
    expect(await roleOf(id, member.id)).toBe('ADMIN');

    const list = body<MemberRoleLike[]>(
      await member.agent.get(`/parties/${id}/members`).expect(200),
    );
    expect(list.find((m) => m.userId === member.id)?.role).toBe('ADMIN');
    expect(list.find((m) => m.userId === admin.id)?.role).toBe('ADMIN');
    // Le nouvel administrateur voit ses droits changer.
    const got = await member.agent.get(`/parties/${id}`).expect(200);
    expect(body<PartieDtoLike>(got).role).toBe('admin');
  });

  it('la propriété ne bouge jamais : ownerId reste le créateur après nomination et départ', async () => {
    const id = await newGroup('role-owner', [[admin2, 'MEMBER']]);
    await setRole(admin, id, admin2.id, { role: 'ADMIN' }).expect(200);
    await setRole(admin, id, admin.id, { role: 'MEMBER' }).expect(200);
    const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id } });
    expect(stored.ownerId).toBe(admin.id);
  });

  it("quitter l'office alors qu'un autre admin reste : devient MEMBER, reste dans le groupe, perd les droits d'admin", async () => {
    const id = await newGroup('role-quitter', [[admin2, 'ADMIN']]);
    await setRole(admin, id, admin.id, { role: 'MEMBER' }).expect(200);
    expect(await roleOf(id, admin.id)).toBe('MEMBER');
    expect(await h.prisma.partie.count({ where: { id } })).toBe(1);
    const got = await admin.agent.get(`/parties/${id}`).expect(200);
    expect(body<PartieDtoLike>(got).role).toBe('member');
    const refused = await admin.agent
      .patch(`/parties/${id}`)
      .send({ name: 'Plus admin' })
      .expect(403);
    expect(body<{ message: string }>(refused).message).toBe(ADMIN_ONLY);
  });

  it('dernier administrateur sans confirmation : 409, rien ne change ; avec confirmation, le groupe disparaît pour tous', async () => {
    const id = await newGroup('role-dernier', [[member, 'MEMBER']]);
    const sans = await setRole(admin, id, admin.id, { role: 'MEMBER' }).expect(409);
    expect(body<{ message: string }>(sans).message).toContain(LAST_ADMIN);
    await setRole(admin, id, admin.id, { role: 'MEMBER', deleteIfLastAdmin: false }).expect(409);
    expect(await roleOf(id, admin.id)).toBe('ADMIN');
    expect(await h.prisma.partie.count({ where: { id } })).toBe(1);

    await setRole(admin, id, admin.id, { role: 'MEMBER', deleteIfLastAdmin: true }).expect(200);
    expect(await h.prisma.partie.count({ where: { id } })).toBe(0);
    expect(await h.prisma.membership.count({ where: { partieId: id } })).toBe(0);
    await member.agent.get(`/parties/${id}`).expect(404);
  });

  it('un membre ordinaire : 403 « réservée aux administrateurs » (nommer et se nommer), rien écrit', async () => {
    const id = await newGroup('role-membre', [
      [member, 'MEMBER'],
      [member2, 'MEMBER'],
    ]);
    for (const target of [member2.id, member.id]) {
      const res = await setRole(member, id, target, { role: 'ADMIN' }).expect(403);
      expect(body<{ message: string }>(res).message).toBe(ADMIN_ONLY);
    }
    const down = await setRole(member, id, member.id, { role: 'MEMBER' }).expect(403);
    expect(body<{ message: string }>(down).message).toBe(ADMIN_ONLY);
    expect(await roleOf(id, member.id)).toBe('MEMBER');
    expect(await roleOf(id, member2.id)).toBe('MEMBER');
  });

  it('un étranger : 403 « pas accès »', async () => {
    const id = await newGroup('role-etranger', [[member, 'MEMBER']]);
    const res = await setRole(stranger, id, member.id, { role: 'ADMIN' }).expect(403);
    expect(body<{ message: string }>(res).message).toBe(NO_ACCESS);
    expect(await roleOf(id, member.id)).toBe('MEMBER');
  });

  it("mouvements inexistants : retirer l'office à un autre, nommer un admin, se nommer → 409 ; membre inconnu → 404", async () => {
    const id = await newGroup('role-mauvais', [
      [admin2, 'ADMIN'],
      [member, 'MEMBER'],
    ]);
    await setRole(admin, id, admin2.id, { role: 'MEMBER' }).expect(409);
    await setRole(admin, id, admin2.id, { role: 'ADMIN' }).expect(409);
    await setRole(admin, id, admin.id, { role: 'ADMIN' }).expect(409);
    await setRole(admin, id, stranger.id, { role: 'ADMIN' }).expect(404);
    expect(await roleOf(id, admin2.id)).toBe('ADMIN');
    expect(await roleOf(id, member.id)).toBe('MEMBER');
  });

  it('corps invalide : 400', async () => {
    const id = await newGroup('role-corps', [[member, 'MEMBER']]);
    await setRole(admin, id, member.id, { role: 'SUPER' }).expect(400);
    await setRole(admin, id, member.id, {}).expect(400);
    await setRole(admin, id, member.id, { role: 'ADMIN', deleteIfLastAdmin: 'oui' }).expect(400);
  });

  it('rencontre isolée (ONE_SHOT) : refusée en 403 même à son administrateur', async () => {
    const { id } = await h.createPartie(admin, 'ONE_SHOT', 'role-isolee', 'ralliement');
    await h.addMember(id, member);
    const res = await setRole(admin, id, member.id, { role: 'ADMIN' }).expect(403);
    expect(body<{ message: string }>(res).message).toBe(UNAVAILABLE);
    expect(await roleOf(id, member.id)).toBe('MEMBER');
  });

  it('partie de JDR : la route est fermée à tous, y compris au MJ', async () => {
    const { id } = await h.createPartie(admin, 'CAMPAGNE_EPISODIQUE', 'role-jdr');
    await h.addMember(id, member);
    await setRole(admin, id, member.id, { role: 'ADMIN' }).expect(403);
    await setRole(member, id, member.id, { role: 'MEMBER' }).expect(403);
    await setRole(stranger, id, member.id, { role: 'ADMIN' }).expect(403);
    expect(await roleOf(id, member.id)).toBe('MEMBER');
    const list = body<MemberRoleLike[]>(
      await admin.agent.get(`/parties/${id}/members`).expect(200),
    );
    expect(list.map((m) => m.role)).toEqual(['MEMBER']);
  });

  it('« Retirer » : un administrateur nommé n’est plus retirable (409), même par le créateur', async () => {
    const id = await newGroup('role-retirer', [[member, 'MEMBER']]);
    await setRole(admin, id, member.id, { role: 'ADMIN' }).expect(200);
    await admin.agent.delete(`/parties/${id}/members/${member.id}`).expect(409);
    expect(await roleOf(id, member.id)).toBe('ADMIN');
  });

  it("deux administrateurs quittent l'office en même temps, avec confirmation : le groupe disparaît une seule fois, jamais zéro admin sans suppression", async () => {
    const id = await newGroup('role-concurrent', [[admin2, 'ADMIN']]);
    const [a, b] = await Promise.all([
      setRole(admin, id, admin.id, { role: 'MEMBER', deleteIfLastAdmin: true }),
      setRole(admin2, id, admin2.id, { role: 'MEMBER', deleteIfLastAdmin: true }),
    ]);
    // Le verrou sérialise : le premier quitte l'office, le second voit le recomptage (dernier
    // administrateur, suppression confirmée). Les deux réussissent, le groupe disparaît UNE fois.
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(await h.prisma.partie.count({ where: { id } })).toBe(0);
  });

  it("deux départs simultanés sans confirmation : un seul réussit, l'autre est refusé, un admin reste", async () => {
    const id = await newGroup('role-concurrent-sans', [[admin2, 'ADMIN']]);
    const [a, b] = await Promise.all([
      setRole(admin, id, admin.id, { role: 'MEMBER' }),
      setRole(admin2, id, admin2.id, { role: 'MEMBER' }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await h.prisma.partie.count({ where: { id } })).toBe(1);
    expect(await h.prisma.membership.count({ where: { partieId: id, role: 'ADMIN' } })).toBe(1);
  });
});

// Story 39.5 — quitter un groupe : `DELETE /parties/:id/members/me`, même procédure `leave()` que le
// retrait. Départ d'un membre, du créateur, d'un administrateur ; dernier administrateur sous
// confirmation explicite ; refus (étranger, JDR, rencontre isolée) ; départs simultanés sous verrou.
describe('Ralliement — quitter un groupe (Story 39.5)', () => {
  let h: Harness;
  let admin: TestUser;
  let admin2: TestUser;
  let member: TestUser;
  let stranger: TestUser;

  const LAST_ADMIN = 'dernier administrateur';

  beforeAll(async () => {
    h = await Harness.start();
    [admin, admin2, member, stranger] = await Promise.all([
      h.createUser('quit-admin'),
      h.createUser('quit-admin2'),
      h.createUser('quit-membre'),
      h.createUser('quit-etranger'),
    ]);
  });

  afterAll(async () => {
    await h?.close();
  });

  /** Un groupe neuf : `admin` (créateur, ADMIN) + les membres demandés. */
  const newGroup = async (label: string, members: [TestUser, 'ADMIN' | 'MEMBER'][] = []) => {
    const { id } = await h.createPartie(admin, 'CAMPAGNE_EPISODIQUE', label, 'ralliement');
    for (const [user, role] of members) await h.addMember(id, user, role);
    return id;
  };
  const leave = (who: TestUser, partieId: string, query = '') =>
    who.agent.delete(`/parties/${partieId}/members/me${query}`);
  const membershipOf = (partieId: string, userId: string) =>
    h.prisma.membership.findUnique({ where: { userId_partieId: { userId, partieId } } });

  it('un membre quitte : adhésion supprimée, le groupe sort de sa liste, les autres sont notifiés', async () => {
    const id = await newGroup('quit-membre', [[member, 'MEMBER']]);
    const emit = jest.spyOn(h.app.get(RealtimeEventsService), 'emit');
    try {
      const res = await leave(member, id).expect(200);
      expect(body<{ ok: boolean; deleted: boolean }>(res)).toEqual({ ok: true, deleted: false });
      // Sa propre liste perd le groupe ; les listes de membres ouvertes se rafraîchissent.
      expect(emit).toHaveBeenCalledWith(userTopic(member.id));
      expect(emit).toHaveBeenCalledWith(userTopic(admin.id));
      expect(emit).toHaveBeenCalledWith(partieTopic(id));
    } finally {
      emit.mockRestore();
    }
    expect(await membershipOf(id, member.id)).toBeNull();
    const mine = body<PartieDtoLike[]>(await member.agent.get('/parties').expect(200));
    expect(mine.map((p) => p.id)).not.toContain(id);
    await member.agent.get(`/parties/${id}`).expect(403);
    const others = body<MemberLike[]>(await admin.agent.get(`/parties/${id}/members`).expect(200));
    expect(others.map((m) => m.userId)).toEqual([admin.id]);
  });

  it('le créateur redevenu simple membre quitte : ownerId vide, le groupe reste', async () => {
    const id = await newGroup('quit-createur', [[admin2, 'ADMIN']]);
    await admin.agent
      .patch(`/parties/${id}/members/${admin.id}/role`)
      .send({ role: 'MEMBER' })
      .expect(200);
    await leave(admin, id).expect(200);
    const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id } });
    expect(stored.ownerId).toBeNull();
    expect(await membershipOf(id, admin.id)).toBeNull();
    // Plus de propriétaire fantôme : l'ancien créateur n'a plus aucun accès.
    await admin.agent.get(`/parties/${id}`).expect(403);
    const got = await admin2.agent.get(`/parties/${id}`).expect(200);
    expect(body<PartieDtoLike>(got).role).toBe('admin');
  });

  it("un administrateur part alors qu'un autre reste : il quitte simplement, le groupe reste", async () => {
    const id = await newGroup('quit-admin', [
      [admin2, 'ADMIN'],
      [member, 'MEMBER'],
    ]);
    await leave(admin2, id).expect(200);
    expect(await membershipOf(id, admin2.id)).toBeNull();
    expect(await h.prisma.partie.count({ where: { id } })).toBe(1);
    // Le créateur n'est pas celui qui part : la propriété ne bouge pas.
    const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id } });
    expect(stored.ownerId).toBe(admin.id);
  });

  it('dernier administrateur : 409 sans confirmation, rien ne change ; confirmé, le groupe disparaît pour tous', async () => {
    const id = await newGroup('quit-dernier', [[member, 'MEMBER']]);
    for (const query of ['', '?deleteIfLastAdmin=false', '?deleteIfLastAdmin=1']) {
      const res = await leave(admin, id, query).expect(409);
      expect(body<{ message: string }>(res).message).toContain(LAST_ADMIN);
    }
    expect(await membershipOf(id, admin.id)).toMatchObject({ role: 'ADMIN' });
    expect(await h.prisma.partie.count({ where: { id } })).toBe(1);

    const res = await leave(admin, id, '?deleteIfLastAdmin=true').expect(200);
    expect(body<{ ok: boolean; deleted: boolean }>(res)).toEqual({ ok: true, deleted: true });
    expect(await h.prisma.partie.count({ where: { id } })).toBe(0);
    expect(await h.prisma.membership.count({ where: { partieId: id } })).toBe(0);
    await member.agent.get(`/parties/${id}`).expect(404);
  });

  it('refus : un étranger (403 « pas accès »), rien écrit', async () => {
    const id = await newGroup('quit-etranger', [[member, 'MEMBER']]);
    const res = await leave(stranger, id).expect(403);
    expect(body<{ message: string }>(res).message).toBe(NO_ACCESS);
    expect(await h.prisma.membership.count({ where: { partieId: id } })).toBe(2);
  });

  it('refus : partie de JDR — ni le joueur ni le MJ ne la quittent par cette route (403)', async () => {
    const { id } = await h.createPartie(admin, 'CAMPAGNE_EPISODIQUE', 'quit-jdr');
    await h.addMember(id, member);
    await leave(member, id).expect(403);
    await leave(admin, id).expect(403);
    expect(await membershipOf(id, member.id)).not.toBeNull();
    // Le retrait d'un joueur par le MJ, lui, est inchangé.
    await admin.agent.delete(`/parties/${id}/members/${member.id}`).expect(200);
    expect(await membershipOf(id, member.id)).toBeNull();
    const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id } });
    expect(stored.ownerId).toBe(admin.id);
  });

  it('refus : rencontre isolée (ONE_SHOT) — 403 « indisponible », à son membre comme à son administrateur', async () => {
    const { id } = await h.createPartie(admin, 'ONE_SHOT', 'quit-isolee', 'ralliement');
    await h.addMember(id, member);
    for (const who of [member, admin]) {
      const res = await leave(who, id).expect(403);
      expect(body<{ message: string }>(res).message).toBe(UNAVAILABLE);
    }
    expect(await h.prisma.membership.count({ where: { partieId: id } })).toBe(2);
  });

  it('les deux derniers administrateurs partent en même temps, confirmés : le groupe disparaît une seule fois', async () => {
    const id = await newGroup('quit-concurrent', [
      [admin2, 'ADMIN'],
      [member, 'MEMBER'],
    ]);
    const [a, b] = await Promise.all([
      leave(admin, id, '?deleteIfLastAdmin=true'),
      leave(admin2, id, '?deleteIfLastAdmin=true'),
    ]);
    // Le verrou sérialise : le premier part simplement, le second se recompte dernier
    // administrateur et supprime le groupe (confirmé). Jamais un groupe sans administrateur.
    expect([a.status, b.status]).toEqual([200, 200]);
    const deleted = [a, b].map((r) => body<{ deleted: boolean }>(r).deleted).sort();
    expect(deleted).toEqual([false, true]);
    expect(await h.prisma.partie.count({ where: { id } })).toBe(0);
  });

  it("deux derniers administrateurs partent en même temps, sans confirmation : l'un part, l'autre est refusé", async () => {
    const id = await newGroup('quit-concurrent-sans', [
      [admin2, 'ADMIN'],
      [member, 'MEMBER'],
    ]);
    const [a, b] = await Promise.all([leave(admin, id), leave(admin2, id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await h.prisma.partie.count({ where: { id } })).toBe(1);
    expect(await h.prisma.membership.count({ where: { partieId: id, role: 'ADMIN' } })).toBe(1);
  });
});

// Story 40.1 — proposer une conjonction à date fixée : tout membre d'un groupe propose, il en est
// l'hôte ; l'événement et sa séance datée unique sont écrits ensemble ; le groupe passe « en cours » ;
// la carte, l'agenda de l'hôte et ses indisponibilités suivent. Refus : partie de JDR, étranger,
// membre d'un autre groupe, rencontre isolée ; saisies invalides en 400, rien écrit.
describe('Ralliement — proposer une conjonction à date fixée (Story 40.1)', () => {
  let h: Harness;
  let admin: TestUser;
  let member: TestUser;
  let stranger: TestUser;
  let otherAdmin: TestUser;
  let groupId: string;
  let otherGroupId: string;

  type CardLike = {
    id: string;
    title: string;
    hostId: string | null;
    hostDisplayName: string | null;
    seance: {
      id: string;
      date: string | null;
      slot: string | null;
      lieu: string | null;
      heureRdv: string | null;
      notePratique: string | null;
      capacity: number | null;
    } | null;
  };
  type ErrorLike = { statusCode: number; message: string | string[] };
  type CalendarLike = { 'mes-seances': { seanceId: string }[] };
  type DatedPartieLike = PartieDtoLike & {
    nextSessionDate: string | null;
    nextSessionSlot: string | null;
  };

  const payload = (over: Record<string, unknown> = {}) => ({
    title: 'Catane et galettes',
    date: isoDay(5),
    slot: 'EVENING',
    ...over,
  });
  const propose = (who: TestUser, partieId: string, sent: Record<string, unknown>) =>
    who.agent.post(`/parties/${partieId}/events`).send(sent);
  const eventCount = (partieId: string) => h.prisma.event.count({ where: { partieId } });

  beforeAll(async () => {
    h = await Harness.start();
    [admin, member, stranger, otherAdmin] = await Promise.all([
      h.createUser('conj-admin'),
      h.createUser('conj-membre'),
      h.createUser('conj-etranger'),
      h.createUser('conj-autre-admin'),
    ]);
    ({ id: groupId } = await h.createPartie(admin, 'CAMPAGNE_EPISODIQUE', 'conj', 'ralliement'));
    await h.addMember(groupId, member);
    ({ id: otherGroupId } = await h.createPartie(
      otherAdmin,
      'CAMPAGNE_EPISODIQUE',
      'conj-autre',
      'ralliement',
    ));
  });

  afterAll(async () => {
    await h?.close();
  });

  it('avant toute conjonction : le groupe est « À venir », la liste est vide', async () => {
    const partie = body<PartieDtoLike>(await admin.agent.get(`/parties/${groupId}`).expect(200));
    expect(partie.status).toBe('A_VENIR');
    const list = await member.agent.get(`/parties/${groupId}/events/list`).expect(200);
    expect(body<CardLike[]>(list)).toEqual([]);
  });

  it('un simple membre propose : 201, il est l’hôte ; événement + séance datée unique ; groupe EN_COURS, prochaine date posée ; tous sont prévenus', async () => {
    const day = isoDay(5);
    const emit = jest.spyOn(h.app.get(RealtimeEventsService), 'emit');
    let card: CardLike;
    try {
      const res = await propose(
        member,
        groupId,
        payload({ lieu: ' Lyon 3e ', heureRdv: '20:30', notePratique: 'On mange sur place.' }),
      ).expect(201);
      card = body<CardLike>(res);
      // Carte en temps réel pour tous les membres, liste d'accueil (statut, date) de chacun.
      expect(emit).toHaveBeenCalledWith(partieTopic(groupId));
      expect(emit).toHaveBeenCalledWith(userTopic(admin.id));
      expect(emit).toHaveBeenCalledWith(userTopic(member.id));
    } finally {
      emit.mockRestore();
    }

    expect(card).toEqual({
      id: card.id,
      title: 'Catane et galettes',
      hostId: member.id,
      hostDisplayName: member.displayName,
      seance: {
        id: card.seance!.id,
        date: day,
        slot: 'EVENING',
        lieu: 'Lyon 3e',
        heureRdv: '20:30',
        notePratique: 'On mange sur place.',
        capacity: null,
      },
    });

    const events = await h.prisma.event.findMany({
      where: { partieId: groupId },
      include: { seances: true, scenario: true },
    });
    expect(events).toHaveLength(1);
    expect(events[0].ownerId).toBe(member.id);
    expect(events[0].scenario).toBeNull();
    expect(events[0].seances).toHaveLength(1);
    const seance = events[0].seances[0];
    expect(seance.startDate?.toISOString()).toBe(`${day}T00:00:00.000Z`);
    expect(seance.endDate?.toISOString()).toBe(`${day}T00:00:00.000Z`);
    expect([seance.startSlot, seance.endSlot]).toEqual(['EVENING', 'EVENING']);
    expect(seance.inscriptionMax).toBeNull();
    // Aucune inscription : l'hôte occupe sa place sans ligne `Inscription` (AD-15).
    expect(await h.prisma.inscription.count({ where: { seanceId: seance.id } })).toBe(0);

    // Statut et prochaine date, vus par chacun (détail et liste d'accueil).
    for (const who of [admin, member]) {
      const partie = body<DatedPartieLike>(await who.agent.get(`/parties/${groupId}`).expect(200));
      expect(partie.status).toBe('EN_COURS');
      expect(partie.nextSessionDate).toBe(`${day}T00:00:00.000Z`);
      expect(partie.nextSessionSlot).toBe('EVENING');
      const mine = body<PartieDtoLike[]>(await who.agent.get('/parties').expect(200));
      expect(mine.find((p) => p.id === groupId)?.status).toBe('EN_COURS');
    }

    // La liste des conjonctions, lue par l'administrateur.
    const list = body<CardLike[]>(
      await admin.agent.get(`/parties/${groupId}/events/list`).expect(200),
    );
    expect(list).toEqual([card]);
  });

  it('places limitées : N = 8 stocké tel quel (aucun plafond) ; N < 2 → 400, rien écrit', async () => {
    const res = await propose(admin, groupId, payload({ title: 'Huit places', capacity: 8 }));
    expect(res.status).toBe(201);
    expect(body<CardLike>(res).seance?.capacity).toBe(8);
    const seance = await h.prisma.seance.findFirstOrThrow({
      where: { event: { partieId: groupId, title: 'Huit places' } },
    });
    expect(seance.inscriptionMax).toBe(8);

    const before = await eventCount(groupId);
    const refused = await propose(admin, groupId, payload({ title: 'Une place', capacity: 1 }));
    expect(refused.status).toBe(400);
    expect(await eventCount(groupId)).toBe(before);
  });

  it.each([
    ['créneau FULL_DAY', { slot: 'FULL_DAY' }],
    ['créneau absent', { slot: undefined }],
    ['date mal formée', { date: '10/10/2031' }],
    ['date inexistante', { date: '2031-02-31' }],
    ['date passée', { date: isoDay(-1) }],
    ['nom vide', { title: '   ' }],
    ['heure mal formée', { heureRdv: '20h30' }],
    ['lieu trop long', { lieu: 'x'.repeat(81) }],
    ['note trop longue', { notePratique: 'x'.repeat(201) }],
  ])('%s → 400 avec un message en français, rien écrit', async (_label, over) => {
    const before = await eventCount(groupId);
    const res = await propose(member, groupId, payload(over));
    expect(res.status).toBe(400);
    const message = body<ErrorLike>(res).message;
    const text = Array.isArray(message) ? message.join(' ') : message;
    // Français : aucun message de validation par défaut (anglais) de class-validator.
    expect(text).not.toMatch(/must be|should not|is not/i);
    expect(text.length).toBeGreaterThan(0);
    expect(await eventCount(groupId)).toBe(before);
  });

  it('aujourd’hui est accepté', async () => {
    await propose(member, groupId, payload({ title: 'Ce soir', date: isoDay(0) })).expect(201);
  });

  describe('refus (403, rien écrit)', () => {
    it('un étranger : « pas accès », en création comme en lecture', async () => {
      const before = await eventCount(groupId);
      const res = await propose(stranger, groupId, payload());
      expect(res.status).toBe(403);
      expect(body<ErrorLike>(res).message).toBe(NO_ACCESS);
      await stranger.agent.get(`/parties/${groupId}/events/list`).expect(403);
      expect(await eventCount(groupId)).toBe(before);
    });

    it('le membre d’un autre groupe : ni création ni lecture', async () => {
      const before = await eventCount(groupId);
      expect((await propose(otherAdmin, groupId, payload())).status).toBe(403);
      await otherAdmin.agent.get(`/parties/${groupId}/events/list`).expect(403);
      expect(await eventCount(groupId)).toBe(before);
      // Et réciproquement : son propre groupe ne montre rien des conjonctions des autres.
      const own = body<CardLike[]>(
        await otherAdmin.agent.get(`/parties/${otherGroupId}/events/list`).expect(200),
      );
      expect(own).toEqual([]);
    });

    it('une partie de JDR : fermée au MJ comme au joueur, en création comme en lecture', async () => {
      const { id: jdrId } = await h.createPartie(admin, 'CAMPAGNE_EPISODIQUE', 'conj-jdr');
      await h.addMember(jdrId, member);
      for (const who of [admin, member]) {
        expect((await propose(who, jdrId, payload())).status).toBe(403);
        await who.agent.get(`/parties/${jdrId}/events/list`).expect(403);
      }
      expect(await eventCount(jdrId)).toBe(0);
      const partie = body<PartieDtoLike>(await admin.agent.get(`/parties/${jdrId}`).expect(200));
      expect(partie.status).toBe('A_VENIR');
    });

    it('une rencontre isolée (ONE_SHOT) : « indisponible », même à son administrateur', async () => {
      const { id: isoleeId } = await h.createPartie(admin, 'ONE_SHOT', 'conj-isolee', 'ralliement');
      await h.addMember(isoleeId, member);
      for (const who of [admin, member]) {
        const res = await propose(who, isoleeId, payload());
        expect(res.status).toBe(403);
        expect(body<ErrorLike>(res).message).toBe(UNAVAILABLE);
      }
      // Son événement unique, créé avec elle, reste le seul.
      expect(await eventCount(isoleeId)).toBe(1);
    });
  });

  it('calendrier : l’hôte non créateur voit sa conjonction dans son agenda et en est occupé ; les autres membres non', async () => {
    const day = isoDay(9);
    const res = await propose(member, groupId, payload({ title: 'Agenda', date: day, slot: 'MORNING' }));
    expect(res.status).toBe(201);
    const card = body<CardLike>(res);
    const query = { from: isoDay(0), to: isoDay(30) };

    const hostCal = body<CalendarLike>(
      await member.agent.get('/me/calendar').query(query).expect(200),
    );
    expect(hostCal['mes-seances'].map((s) => s.seanceId)).toContain(card.seance!.id);
    const adminCal = body<CalendarLike>(
      await admin.agent.get('/me/calendar').query(query).expect(200),
    );
    expect(adminCal['mes-seances'].map((s) => s.seanceId)).not.toContain(card.seance!.id);

    // Indisponibilités : une plage { date, slot } seulement, sans titre ni identité.
    const spans = await h.app.get(EventsService).occupiedSpansOf([member.id, admin.id]);
    const memberSpans = spans.get(member.id)!.map((s) => [s.date.toISOString(), s.slot]);
    expect(memberSpans).toContainEqual([`${day}T00:00:00.000Z`, 'MORNING']);
    const adminSpans = spans.get(admin.id)!.map((s) => [s.date.toISOString(), s.slot]);
    expect(adminSpans).not.toContainEqual([`${day}T00:00:00.000Z`, 'MORNING']);
    for (const span of spans.get(member.id)!) {
      expect(Object.keys(span).sort()).toEqual(['date', 'slot']);
    }
  });

  it('la liste compte toutes les conjonctions du groupe, triées par date', async () => {
    const list = body<CardLike[]>(
      await member.agent.get(`/parties/${groupId}/events/list`).expect(200),
    );
    expect(list).toHaveLength(await eventCount(groupId));
    const dates = list.map((c) => c.seance?.date ?? '');
    expect(dates).toEqual([...dates].sort());
  });
});
