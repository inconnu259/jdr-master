import { randomUUID } from 'node:crypto';
import { objectLike } from '../../src/common/test-utils/jest-typed';
import { Harness, body, isoDay, type TestUser } from './harness';

// Story 37.7 (AD-6) — les capacités JDR (personnages, XP, rôles de groupe, annonces, Homme Dragon),
// les invitations et liens d'invitation, les favoris, les annonces lues et le flux temps réel sont
// décidés par le même service. Les refus sont vérifiés au niveau HTTP : membre sur une route MJ,
// étranger, identifiant d'une AUTRE partie (la partie est résolue depuis la cible), système sans la
// capacité, plus la liste `GET /parties` avec tous les rôles.
//
// Story 37.6 (AD-6) — les droits sur une partie, ses scénarios (événements), ses séances et ses
// votes sont décidés par un service unique. Vérifié au niveau HTTP : un membre est refusé sur une
// route réservée au MJ de chaque module (403, message français, aucune écriture), un étranger est
// refusé sur une route de séance, et une séance d'une AUTRE partie ne s'atteint jamais en passant
// par la partie dont on est MJ (la partie est résolue depuis la séance, pas depuis la route).

const MJ_ONLY_MESSAGE = 'Action réservée au MJ de la partie';
const NO_ACCESS_MESSAGE = "Vous n'avez pas accès à cette partie";
const CAPABILITY_UNAVAILABLE_MESSAGE =
  "Cette fonctionnalité n'est pas disponible pour le système de jeu de cette partie";

type PollLike = {
  id: string;
  status: string;
  options: { id: string; votes: { userId: string; answer: string }[] }[];
};
type SeanceDtoLike = {
  id: string;
  compteRendu: string | null;
  lieu: string | null;
  poll?: PollLike;
};
type ScenarioDtoLike = { id: string; title: string; seances: SeanceDtoLike[] };
type ErrorLike = { statusCode: number; message: string };

describe('Droits sur une partie et ses événements (Story 37.6)', () => {
  let h: Harness;
  let mjA: TestUser;
  let joueurA: TestUser;
  let mjB: TestUser;
  let etranger: TestUser;
  let partieA: string;
  let partieB: string;
  let scenarioA: ScenarioDtoLike;
  let scenarioB: ScenarioDtoLike;
  let pollA: string;
  let optionA: string;

  beforeAll(async () => {
    h = await Harness.start();
    [mjA, joueurA, mjB, etranger] = await Promise.all([
      h.createUser('mj-a'),
      h.createUser('joueur-a'),
      h.createUser('mj-b'),
      h.createUser('etranger'),
    ]);
    ({ id: partieA } = await h.createPartie(mjA, 'CAMPAGNE_EPISODIQUE', 'droits A'));
    ({ id: partieB } = await h.createPartie(mjB, 'CAMPAGNE_EPISODIQUE', 'droits B'));
    await h.addMember(partieA, joueurA);

    scenarioA = body<ScenarioDtoLike>(
      await mjA.agent
        .post(`/parties/${partieA}/scenarios`)
        .send({ title: 'Scénario A' })
        .expect(201),
    );
    scenarioB = body<ScenarioDtoLike>(
      await mjB.agent
        .post(`/parties/${partieB}/scenarios`)
        .send({ title: 'Scénario B' })
        .expect(201),
    );
    // Anti-spoil serveur : un joueur ne voit ni ne vote le vote d'un brouillon — le scénario est
    // donc ouvert avant que les tests de membre n'agissent sur son vote.
    await mjA.agent.patch(`/scenarios/${scenarioA.id}/open`).expect(200);
    const withPoll = body<ScenarioDtoLike>(
      await mjA.agent
        .post(`/scenarios/seances/${scenarioA.seances[0].id}/poll`)
        .send({
          options: [
            { date: isoDay(30), slot: 'EVENING' },
            { date: isoDay(31), slot: 'EVENING' },
          ],
        })
        .expect(201),
    );
    const poll = withPoll.seances[0].poll;
    if (!poll) throw new Error('Vote absent de la séance après création');
    pollA = poll.id;
    optionA = poll.options[0].id;
  });

  /** Vote ouvert de A, relu par le MJ. */
  async function openPollA(): Promise<PollLike> {
    return body<PollLike>(await mjA.agent.get(`/parties/${partieA}/poll`).expect(200));
  }

  afterAll(async () => {
    await h?.close();
  });

  describe('un membre est refusé sur une route réservée au MJ (403, message français, aucune écriture)', () => {
    it('parties : PATCH /parties/:id', async () => {
      const res = await joueurA.agent
        .patch(`/parties/${partieA}`)
        .send({ name: 'Renommée par un joueur' })
        .expect(403);
      expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

      const partie = await mjA.agent.get(`/parties/${partieA}`).expect(200);
      expect(body<{ name: string }>(partie).name).not.toBe('Renommée par un joueur');
    });

    it('scénarios : POST /parties/:id/scenarios', async () => {
      const res = await joueurA.agent
        .post(`/parties/${partieA}/scenarios`)
        .send({ title: 'Scénario de joueur' })
        .expect(403);
      expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

      const list = await mjA.agent.get(`/parties/${partieA}/scenarios`).expect(200);
      expect(body<ScenarioDtoLike[]>(list)).toHaveLength(1);
    });

    it('séances (événements) : POST /scenarios/:id/seances', async () => {
      const res = await joueurA.agent.post(`/scenarios/${scenarioA.id}/seances`).expect(403);
      expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

      const list = await mjA.agent.get(`/parties/${partieA}/scenarios`).expect(200);
      expect(body<ScenarioDtoLike[]>(list)[0].seances).toHaveLength(1);
    });

    it('votes : DELETE /parties/:id/poll/:pollId (clôture)', async () => {
      const res = await joueurA.agent.delete(`/parties/${partieA}/poll/${pollA}`).expect(403);
      expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

      const open = await joueurA.agent.get(`/parties/${partieA}/poll`).expect(200);
      expect(body<{ id: string; status: string }>(open)).toMatchObject({
        id: pollA,
        status: 'OPEN',
      });
    });

    it('votes : PATCH /parties/:id/poll/:pollId/choose (choix de la date)', async () => {
      const res = await joueurA.agent
        .patch(`/parties/${partieA}/poll/${pollA}/choose`)
        .send({ optionId: optionA })
        .expect(403);
      expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

      expect(await openPollA()).toMatchObject({ id: pollA, status: 'OPEN' });
      const partie = await mjA.agent.get(`/parties/${partieA}`).expect(200);
      expect(body<{ nextSessionDate: string | null }>(partie).nextSessionDate).toBeNull();
    });

    it('votes : PUT /parties/:id/poll/:pollId/options (options du vote)', async () => {
      const res = await joueurA.agent
        .put(`/parties/${partieA}/poll/${pollA}/options`)
        .send({
          options: [
            { date: isoDay(40), slot: 'MORNING' },
            { date: isoDay(41), slot: 'MORNING' },
          ],
        })
        .expect(403);
      expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

      const poll = await openPollA();
      expect(poll.options).toHaveLength(2);
      expect(poll.options.map((o) => o.id)).toContain(optionA);
    });

    it('séances : PATCH /scenarios/seances/:id/infos-pratiques', async () => {
      const seanceA = scenarioA.seances[0].id;
      const res = await joueurA.agent
        .patch(`/scenarios/seances/${seanceA}/infos-pratiques`)
        .send({ heureRdv: '20:30', lieu: 'Chez le joueur', notePratique: null })
        .expect(403);
      expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

      const list = await mjA.agent.get(`/parties/${partieA}/scenarios`).expect(200);
      const seance = body<ScenarioDtoLike[]>(list)[0].seances.find((s) => s.id === seanceA);
      expect(seance?.lieu).toBeNull();
    });

    it('parties : PATCH /parties/:id/close (clôture)', async () => {
      const res = await joueurA.agent.patch(`/parties/${partieA}/close`).expect(403);
      expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

      const partie = await mjA.agent.get(`/parties/${partieA}`).expect(200);
      expect(body<{ status: string }>(partie).status).not.toBe('TERMINEE');
    });
  });

  it('un membre garde ses actions de membre : son vote est enregistré (201)', async () => {
    await joueurA.agent
      .post(`/parties/${partieA}/poll/${pollA}/vote`)
      .send({ optionId: optionA, answer: 'YES' })
      .expect(201);

    const option = (await openPollA()).options.find((o) => o.id === optionA);
    expect(option?.votes).toEqual([objectLike({ userId: joueurA.id, answer: 'YES' })]);
  });

  it('un étranger est refusé sur une route de séance (403 « pas accès »)', async () => {
    const res = await etranger.agent
      .post(`/scenarios/seances/${scenarioA.seances[0].id}/inscription`)
      .expect(403);
    expect(body<ErrorLike>(res).message).toBe(NO_ACCESS_MESSAGE);

    const inscriptions = await h.prisma.inscription.count({
      where: { seanceId: scenarioA.seances[0].id },
    });
    expect(inscriptions).toBe(0);
  });

  it("un scénario (événement) d'une autre partie est refusé au MJ de A (403), sans écriture", async () => {
    const res = await mjA.agent
      .patch(`/scenarios/${scenarioB.id}`)
      .send({ title: 'Renommé par le MJ de A' })
      .expect(403);
    expect(body<ErrorLike>(res).message).toBe(NO_ACCESS_MESSAGE);

    const list = await mjB.agent.get(`/parties/${partieB}/scenarios`).expect(200);
    expect(body<ScenarioDtoLike[]>(list)[0].title).toBe('Scénario B');
  });

  it("une séance d'une autre partie est refusée au MJ de A (403), sans écriture", async () => {
    const seanceB = scenarioB.seances[0].id;
    const res = await mjA.agent
      .patch(`/scenarios/seances/${seanceB}/compte-rendu`)
      .send({ compteRendu: 'Écrit par le MJ de A' })
      .expect(403);
    expect(body<ErrorLike>(res).message).toBe(NO_ACCESS_MESSAGE);

    const list = await mjB.agent.get(`/parties/${partieB}/scenarios`).expect(200);
    const seance = body<ScenarioDtoLike[]>(list)[0].seances.find((s) => s.id === seanceB);
    expect(seance?.compteRendu).toBeNull();
  });

  it('une séance inconnue reste un 404 « Séance introuvable »', async () => {
    const res = await mjA.agent
      .patch(`/scenarios/seances/${randomUUID()}/compte-rendu`)
      .send({ compteRendu: 'Inutile' })
      .expect(404);
    expect(body<ErrorLike>(res).message).toBe('Séance introuvable');
  });

  // Story 40.1 : les conjonctions n'existent que dans un groupe de ralliement — sur une partie de
  // JDR, la création et la liste sont fermées au MJ comme au joueur (politique `NOBODY`), et un
  // étranger reçoit « pas accès ». Aucun événement écrit.
  it('conjonctions : POST /parties/:id/events et GET …/events/list refusés sur une partie de JDR (403), sans écriture', async () => {
    const before = await h.prisma.event.count({ where: { partieId: partieA } });
    const sent = { title: 'Une conjonction', date: isoDay(10), slot: 'EVENING' };
    for (const who of [mjA, joueurA]) {
      const res = await who.agent.post(`/parties/${partieA}/events`).send(sent).expect(403);
      expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);
      await who.agent.get(`/parties/${partieA}/events/list`).expect(403);
    }
    const asStranger = await etranger.agent
      .post(`/parties/${partieA}/events`)
      .send(sent)
      .expect(403);
    expect(body<ErrorLike>(asStranger).message).toBe(NO_ACCESS_MESSAGE);
    await etranger.agent.get(`/parties/${partieA}/events/list`).expect(403);
    expect(await h.prisma.event.count({ where: { partieId: partieA } })).toBe(before);
  });

  describe('capacités JDR, invitations et favoris (Story 37.7)', () => {
    let joueurB: TestUser;
    let ami: TestUser;
    let partieAmi: string;
    let partieSansCapacite: string;
    let characterA: string;
    let characterB: string;
    let announcementB: string;
    let invitationB: string;
    let inviteLinkB: string;

    beforeAll(async () => {
      [joueurB, ami] = await Promise.all([h.createUser('joueur-b'), h.createUser('ami')]);
      await h.addMember(partieB, joueurB);
      // « ami » : MJ de sa propre partie ET joueur de A (liste de toutes les parties).
      ({ id: partieAmi } = await h.createPartie(ami, 'ONE_SHOT', 'droits ami'));
      await h.addMember(partieA, ami);

      // Partie legacy d'un système sans aucune capacité JDR : la création est fermée par l'API,
      // le système est donc posé en base (aucune clé étrangère sur `Partie.gameSystemId`).
      ({ id: partieSansCapacite } = await h.createPartie(mjA, 'ONE_SHOT', 'sans capacité'));
      await h.prisma.partie.update({
        where: { id: partieSansCapacite },
        data: { gameSystemId: 'draconis' },
      });

      // Fiches écrites en base (la création par l'API exige tout le catalogue de Ryuutama).
      const sheet = { classId: 'chasseur' };
      characterA = (
        await h.prisma.character.create({
          data: {
            userId: joueurA.id,
            partieId: partieA,
            gameSystemId: 'ryuutama',
            sheetData: sheet,
            derived: {},
          },
        })
      ).id;
      characterB = (
        await h.prisma.character.create({
          data: {
            userId: joueurB.id,
            partieId: partieB,
            gameSystemId: 'ryuutama',
            sheetData: sheet,
            derived: {},
          },
        })
      ).id;

      announcementB = body<{ id: string }>(
        await mjB.agent
          .post(`/parties/${partieB}/announcements`)
          .send({ text: 'Annonce B' })
          .expect(201),
      ).id;
      invitationB = body<{ id: string }>(
        await mjB.agent
          .post(`/parties/${partieB}/invitations`)
          .send({ inviteeUserId: etranger.id })
          .expect(201),
      ).id;
      inviteLinkB = body<{ id: string }>(
        await mjB.agent.post(`/parties/${partieB}/invite-links`).send({}).expect(201),
      ).id;
    });

    describe('un membre est refusé sur une route réservée au MJ (403, message français, aucune écriture)', () => {
      it('distribution d’XP : POST /parties/:id/xp-distributions', async () => {
        const res = await joueurA.agent
          .post(`/parties/${partieA}/xp-distributions`)
          .send({ entries: [{ characterId: characterA, amount: 100 }] })
          .expect(403);
        expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

        expect(await h.prisma.xpDistribution.count({ where: { partieId: partieA } })).toBe(0);
        expect((await h.prisma.character.findUnique({ where: { id: characterA } }))?.xp).toBe(0);
      });

      it('rôles de groupe : POST /parties/:id/characters/:characterId/role', async () => {
        const res = await joueurA.agent
          .post(`/parties/${partieA}/characters/${characterA}/role`)
          .send({ roleKey: 'chef' })
          .expect(403);
        expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

        expect(await h.prisma.characterGroupRole.count({ where: { partieId: partieA } })).toBe(0);
      });

      it('annonces : POST /parties/:id/announcements', async () => {
        const res = await joueurA.agent
          .post(`/parties/${partieA}/announcements`)
          .send({ text: 'Annonce de joueur' })
          .expect(403);
        expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

        expect(await h.prisma.announcement.count({ where: { partieId: partieA } })).toBe(0);
      });

      it('invitations : POST /parties/:id/invitations', async () => {
        const res = await joueurA.agent
          .post(`/parties/${partieA}/invitations`)
          .send({ inviteeUserId: etranger.id })
          .expect(403);
        expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

        expect(await h.prisma.invitation.count({ where: { partieId: partieA } })).toBe(0);
      });

      it('invitations : GET /parties/:id/invitations (liste réservée au MJ)', async () => {
        const member = await joueurA.agent.get(`/parties/${partieA}/invitations`).expect(403);
        expect(body<ErrorLike>(member).message).toBe(MJ_ONLY_MESSAGE);
        const outsider = await etranger.agent.get(`/parties/${partieA}/invitations`).expect(403);
        expect(body<ErrorLike>(outsider).message).toBe(NO_ACCESS_MESSAGE);
        // Le MJ, lui, la lit.
        await mjA.agent.get(`/parties/${partieA}/invitations`).expect(200);
      });

      it('liens d’invitation : POST /parties/:id/invite-links', async () => {
        const res = await joueurA.agent
          .post(`/parties/${partieA}/invite-links`)
          .send({})
          .expect(403);
        expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

        expect(await h.prisma.inviteLink.count({ where: { partieId: partieA } })).toBe(0);
      });

      it('XP d’un personnage : PATCH /characters/:id/xp', async () => {
        const res = await joueurA.agent
          .patch(`/characters/${characterA}/xp`)
          .send({ value: 999 })
          .expect(403);
        expect(body<ErrorLike>(res).message).toBe(MJ_ONLY_MESSAGE);

        expect((await h.prisma.character.findUnique({ where: { id: characterA } }))?.xp).toBe(0);
      });
    });

    describe('un membre garde ses actions de membre', () => {
      it('personnages : GET /parties/:id/characters et GET /characters/:id (fiche d’un autre membre)', async () => {
        const list = await ami.agent.get(`/parties/${partieA}/characters`).expect(200);
        expect(body<{ id: string }[]>(list).map((c) => c.id)).toEqual([characterA]);
        await ami.agent.get(`/characters/${characterA}`).expect(200);
      });

      it('annonces : un membre lit les annonces de sa partie', async () => {
        await mjA.agent
          .post(`/parties/${partieA}/announcements`)
          .send({ text: 'Annonce A' })
          .expect(201);
        const list = await joueurA.agent.get(`/parties/${partieA}/announcements`).expect(200);
        expect(body<{ text: string }[]>(list).map((a) => a.text)).toEqual(['Annonce A']);
      });
    });

    describe('un étranger est refusé (403 « pas accès »)', () => {
      it('personnages : GET /characters/:id et GET /parties/:id/characters', async () => {
        const one = await etranger.agent.get(`/characters/${characterA}`).expect(403);
        expect(body<ErrorLike>(one).message).toBe(NO_ACCESS_MESSAGE);
        const list = await etranger.agent.get(`/parties/${partieA}/characters`).expect(403);
        expect(body<ErrorLike>(list).message).toBe(NO_ACCESS_MESSAGE);
      });

      it('flux temps réel : GET /parties/:id/events', async () => {
        const res = await etranger.agent.get(`/parties/${partieA}/events`).expect(403);
        expect(body<ErrorLike>(res).message).toBe(NO_ACCESS_MESSAGE);
      });

      it('favori : PUT /me/favorites/:partieId — aucune ligne écrite', async () => {
        const res = await etranger.agent.put(`/me/favorites/${partieA}`).expect(403);
        expect(body<ErrorLike>(res).message).toBe(NO_ACCESS_MESSAGE);

        expect(await h.prisma.partieFavorite.count({ where: { userId: etranger.id } })).toBe(0);
      });

      it('favori : une partie inconnue reste un 404', async () => {
        const res = await etranger.agent.put(`/me/favorites/${randomUUID()}`).expect(404);
        expect(body<ErrorLike>(res).message).toBe('Partie introuvable');
      });
    });

    describe('l’identifiant d’une AUTRE partie est refusé au MJ de A (403), sans écriture', () => {
      it('personnage : PATCH /characters/:id/xp', async () => {
        const res = await mjA.agent
          .patch(`/characters/${characterB}/xp`)
          .send({ value: 500 })
          .expect(403);
        expect(body<ErrorLike>(res).message).toBe(NO_ACCESS_MESSAGE);

        expect((await h.prisma.character.findUnique({ where: { id: characterB } }))?.xp).toBe(0);
      });

      it('personnage : GET /characters/:id/history', async () => {
        const res = await mjA.agent.get(`/characters/${characterB}/history`).expect(403);
        expect(body<ErrorLike>(res).message).toBe(NO_ACCESS_MESSAGE);
      });

      it('invitation : DELETE /invitations/:id', async () => {
        const res = await mjA.agent.delete(`/invitations/${invitationB}`).expect(403);
        expect(body<ErrorLike>(res).message).toBe(NO_ACCESS_MESSAGE);

        const invitation = await h.prisma.invitation.findUnique({ where: { id: invitationB } });
        expect(invitation?.status).toBe('PENDING');
      });

      it('lien d’invitation : DELETE /invite-links/:id', async () => {
        const res = await mjA.agent.delete(`/invite-links/${inviteLinkB}`).expect(403);
        expect(body<ErrorLike>(res).message).toBe(NO_ACCESS_MESSAGE);

        const link = await h.prisma.inviteLink.findUnique({ where: { id: inviteLinkB } });
        expect(link?.revoked).toBe(false);
      });

      it('annonce : PUT /me/announcements-read/:id — aucune ligne de lecture écrite', async () => {
        const res = await mjA.agent.put(`/me/announcements-read/${announcementB}`).expect(403);
        expect(body<ErrorLike>(res).message).toBe(NO_ACCESS_MESSAGE);

        expect(
          await h.prisma.announcementRead.count({ where: { announcementId: announcementB } }),
        ).toBe(0);
      });

      it('identifiants inconnus : 404 avec les messages historiques', async () => {
        const character = await mjA.agent
          .patch(`/characters/${randomUUID()}/xp`)
          .send({ value: 1 })
          .expect(404);
        expect(body<ErrorLike>(character).message).toBe('Personnage introuvable');
        const invitation = await mjA.agent.delete(`/invitations/${randomUUID()}`).expect(404);
        expect(body<ErrorLike>(invitation).message).toBe('Invitation introuvable');
        const link = await mjA.agent.delete(`/invite-links/${randomUUID()}`).expect(404);
        expect(body<ErrorLike>(link).message).toBe('Lien introuvable');
        const announcement = await mjA.agent
          .put(`/me/announcements-read/${randomUUID()}`)
          .expect(404);
        expect(body<ErrorLike>(announcement).message).toBe('Annonce introuvable');
      });
    });

    it('le MJ de la partie révoque son invitation et son lien, un membre marque une annonce lue', async () => {
      await mjB.agent.delete(`/invitations/${invitationB}`).expect(200);
      expect((await h.prisma.invitation.findUnique({ where: { id: invitationB } }))?.status).toBe(
        'REVOKED',
      );
      await mjB.agent.delete(`/invite-links/${inviteLinkB}`).expect(200);
      expect((await h.prisma.inviteLink.findUnique({ where: { id: inviteLinkB } }))?.revoked).toBe(
        true,
      );

      await joueurB.agent.put(`/me/announcements-read/${announcementB}`).expect(200);
      expect(
        await h.prisma.announcementRead.count({
          where: { announcementId: announcementB, userId: joueurB.id },
        }),
      ).toBe(1);
    });

    describe('une partie dont le système n’a pas la capacité (décision du 2026-10-10 : écritures seulement)', () => {
      it('les ÉCRITURES de couche 3 sont refusées (400) avant toute écriture', async () => {
        const expectRefused = (res: { body: unknown }) =>
          expect((res.body as ErrorLike).message).toBe(CAPABILITY_UNAVAILABLE_MESSAGE);

        expectRefused(
          await mjA.agent
            .post(`/parties/${partieSansCapacite}/xp-distributions`)
            .send({ entries: [{ characterId: characterA, amount: 100 }] })
            .expect(400),
        );
        expectRefused(
          await mjA.agent
            .post(`/parties/${partieSansCapacite}/announcements`)
            .send({ text: 'Annonce' })
            .expect(400),
        );
        expectRefused(
          await mjA.agent
            .post(`/parties/${partieSansCapacite}/characters/${characterA}/role`)
            .send({ roleKey: 'chef' })
            .expect(400),
        );
        expectRefused(
          await mjA.agent
            .put(`/parties/${partieSansCapacite}/homme-dragon/${randomUUID()}`)
            .expect(400),
        );
        expectRefused(
          await mjA.agent
            .post(`/parties/${partieSansCapacite}/characters`)
            .send({ gameSystemId: 'ryuutama', sheetData: { classId: 'chasseur' } })
            .expect(400),
        );

        expect(
          await h.prisma.xpDistribution.count({ where: { partieId: partieSansCapacite } }),
        ).toBe(0);
        expect(await h.prisma.announcement.count({ where: { partieId: partieSansCapacite } })).toBe(
          0,
        );
        expect(await h.prisma.character.count({ where: { partieId: partieSansCapacite } })).toBe(0);
      });

      it('les LECTURES gardent leur contrôle de rôle et renvoient vide / null comme avant (200)', async () => {
        const announcements = await mjA.agent
          .get(`/parties/${partieSansCapacite}/announcements`)
          .expect(200);
        expect(body<unknown[]>(announcements)).toEqual([]);
        const roles = await mjA.agent
          .get(`/parties/${partieSansCapacite}/character-roles`)
          .expect(200);
        expect(body<unknown[]>(roles)).toEqual([]);
        const characters = await mjA.agent
          .get(`/parties/${partieSansCapacite}/characters`)
          .expect(200);
        expect(body<unknown[]>(characters)).toEqual([]);
        const xp = await mjA.agent
          .get(`/parties/${partieSansCapacite}/xp-distributions`)
          .expect(200);
        expect(body<unknown[]>(xp)).toEqual([]);
        // Aucun Homme Dragon lié : « null » (corps vide ou littéral), jamais un 400.
        const hommeDragon = await mjA.agent
          .get(`/parties/${partieSansCapacite}/homme-dragon`)
          .expect(200);
        expect(['', 'null']).toContain(hommeDragon.text);
      });

      it('le retrait d’un Homme Dragon et le marquage d’une annonce lue ne sont pas bloqués', async () => {
        // Retrait : la permission est accordée, l'Homme Dragon (inconnu) donne son 404 historique.
        const unlink = await mjA.agent
          .delete(`/parties/${partieSansCapacite}/homme-dragon/${randomUUID()}`)
          .expect(404);
        expect(body<ErrorLike>(unlink).message).toBe('Homme Dragon introuvable');

        const announcement = await h.prisma.announcement.create({
          data: { partieId: partieSansCapacite, text: 'Annonce legacy' },
        });
        await mjA.agent.put(`/me/announcements-read/${announcement.id}`).expect(200);
        expect(
          await h.prisma.announcementRead.count({
            where: { announcementId: announcement.id, userId: mjA.id },
          }),
        ).toBe(1);
      });

      it('le rôle est contrôlé avant la capacité : un joueur reçoit « réservée au MJ », un étranger « pas accès »', async () => {
        await h.addMember(partieSansCapacite, joueurA);
        const player = await joueurA.agent
          .post(`/parties/${partieSansCapacite}/announcements`)
          .send({ text: 'Annonce' })
          .expect(403);
        expect(body<ErrorLike>(player).message).toBe(MJ_ONLY_MESSAGE);
        const stranger = await etranger.agent
          .post(`/parties/${partieSansCapacite}/announcements`)
          .send({ text: 'Annonce' })
          .expect(403);
        expect(body<ErrorLike>(stranger).message).toBe(NO_ACCESS_MESSAGE);
      });
    });

    describe('GET /parties — toutes mes parties avec leur rôle', () => {
      type PartieLike = { id: string; role: 'mj' | 'player' };

      it('sans role : MJ de la sienne ET joueur de A, la plus récente d’abord', async () => {
        const res = await ami.agent.get('/parties').expect(200);
        expect(body<PartieLike[]>(res).map((p) => [p.id, p.role])).toEqual([
          [partieAmi, 'mj'],
          [partieA, 'player'],
        ]);
      });

      it('?role=player : seulement les parties où je suis joueur (comportement inchangé)', async () => {
        const res = await ami.agent.get('/parties?role=player').expect(200);
        expect(body<PartieLike[]>(res).map((p) => [p.id, p.role])).toEqual([[partieA, 'player']]);
      });

      it('?role=mj : seulement mes parties de MJ (comportement inchangé)', async () => {
        const res = await ami.agent.get('/parties?role=mj').expect(200);
        expect(body<PartieLike[]>(res).map((p) => [p.id, p.role])).toEqual([[partieAmi, 'mj']]);
      });

      it('toute autre valeur de role garde son sens historique (mj)', async () => {
        const res = await ami.agent.get('/parties?role=n-importe-quoi').expect(200);
        expect(body<PartieLike[]>(res).map((p) => [p.id, p.role])).toEqual([[partieAmi, 'mj']]);
      });
    });
  });
});
