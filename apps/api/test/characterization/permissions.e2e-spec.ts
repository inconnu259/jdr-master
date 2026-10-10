import { randomUUID } from 'node:crypto';
import { objectLike } from '../../src/common/test-utils/jest-typed';
import { Harness, body, isoDay, type TestUser } from './harness';

// Story 37.6 (AD-6) — les droits sur une partie, ses scénarios (événements), ses séances et ses
// votes sont décidés par un service unique. Vérifié au niveau HTTP : un membre est refusé sur une
// route réservée au MJ de chaque module (403, message français, aucune écriture), un étranger est
// refusé sur une route de séance, et une séance d'une AUTRE partie ne s'atteint jamais en passant
// par la partie dont on est MJ (la partie est résolue depuis la séance, pas depuis la route).

const MJ_ONLY_MESSAGE = 'Action réservée au MJ de la partie';
const NO_ACCESS_MESSAGE = "Vous n'avez pas accès à cette partie";

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
});
