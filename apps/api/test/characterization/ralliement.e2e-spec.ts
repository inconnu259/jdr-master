import request from 'supertest';
import { PartiesService } from '../../src/parties/parties.service';
import { Harness, body, type TestUser } from './harness';

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
      ['le créateur', 'admin2', 'admin'],
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
