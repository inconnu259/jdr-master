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

    it('les actions de JDR sont refusées à tous les rôles (scénarios, clôture, suppression…)', async () => {
      for (const user of [admin, member]) {
        const list = await user.agent.get(`/parties/${partieId}/scenarios`).expect(403);
        expect(body<{ message: string }>(list).message).toBe(UNAVAILABLE);
        await user.agent
          .post(`/parties/${partieId}/scenarios`)
          .send({ title: 'Un scénario' })
          .expect(403);
        await user.agent.patch(`/parties/${partieId}/close`).expect(403);
        await user.agent.delete(`/parties/${partieId}`).expect(403);
      }
      expect(await h.prisma.scenario.count({ where: { event: { partieId } } })).toBe(0);
      const stored = await h.prisma.partie.findUniqueOrThrow({ where: { id: partieId } });
      expect(stored.closedAt).toBeNull();
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
});
