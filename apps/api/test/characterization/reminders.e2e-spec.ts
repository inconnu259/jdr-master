import { NotificationsService } from '../../src/notifications/notifications.service';
import { Harness, body, isoDay, type TestUser } from './harness';

// Test de caractérisation (Story 37.1) : fige le rappel de la veille, sur des données construites
// par les routes HTTP. Seules ces attentes-ci peuvent changer dans l'épic 37, en 37.9 (rappel par
// séance) — mêmes e-mail et destinataires attendus pour une partie à une seule prochaine séance.

type ScenarioDtoLike = {
  seances: { id: string; poll?: { id: string; options: { id: string; date: string }[] } }[];
};

/** Crée une partie ONE_SHOT, y ajoute `members`, et date son unique séance au jour `day`. */
async function partieDatee(
  h: Harness,
  mj: TestUser,
  members: TestUser[],
  label: string,
  day: string,
  slot: string,
): Promise<{ id: string; name: string }> {
  const { id, name } = await h.createPartie(mj, 'ONE_SHOT', label);
  for (const member of members) await h.addMember(id, member);

  const scenariosRes = await mj.agent.get(`/parties/${id}/scenarios`).expect(200);
  const seanceId = body<ScenarioDtoLike[]>(scenariosRes)[0].seances[0].id;
  const pollRes = await mj.agent
    .post(`/scenarios/seances/${seanceId}/poll`)
    .send({
      options: [
        { date: day, slot },
        { date: isoDay(30), slot },
      ],
    })
    .expect(201);
  const poll = body<ScenarioDtoLike>(pollRes).seances[0].poll!;
  const option = poll.options.find((o) => o.date.startsWith(day))!;
  await mj.agent
    .patch(`/parties/${id}/poll/${poll.id}/choose`)
    .send({ optionId: option.id })
    .expect(200);
  return { id, name };
}

describe('Caractérisation JDR — rappel de la veille (Story 37.1)', () => {
  let h: Harness;
  let notifications: NotificationsService;

  beforeAll(async () => {
    h = await Harness.start();
    notifications = h.app.get(NotificationsService);
  });

  afterAll(async () => {
    await h?.close();
  });

  it('fige : une séance dans les 24 h déclenche un unique `session-reminder` au MJ et aux membres, puis plus rien', async () => {
    const mj = await h.createUser('mj');
    const joueur = await h.createUser('joueur');
    const autreJoueur = await h.createUser('joueur');
    const etranger = await h.createUser('etranger');
    const ours = new Set([mj.email, joueur.email, autreJoueur.email, etranger.email]);

    // Demain à minuit UTC tombe toujours dans les 24 h à venir.
    // Le MJ est aussi membre (Membership) de la partie due : il ne doit recevoir qu'un seul rappel.
    const due = await partieDatee(
      h,
      mj,
      [mj, joueur, autreJoueur],
      'rappel-du',
      isoDay(1),
      'EVENING',
    );
    // Séance dans 5 jours : hors fenêtre, aucun rappel.
    await partieDatee(h, mj, [joueur], 'rappel-pas-encore', isoDay(5), 'EVENING');

    h.email.calls = [];
    await notifications.sendDueReminders();

    const firstRun = h.email.calls.filter((c) => ours.has(c.to));
    expect(firstRun.map((c) => c.to).sort()).toEqual(
      [mj.email, joueur.email, autreJoueur.email].sort(),
    );
    expect(
      firstRun.filter((c) => c.to === mj.email && c.template === 'session-reminder'),
    ).toHaveLength(1);
    for (const call of firstRun) {
      expect(call.template).toBe('session-reminder');
      expect(call.data.partieName).toBe(due.name);
      expect(String(call.data.link)).toContain(`/parties/${due.id}`);
      expect(String(call.data.sessionDate)).toContain('(soir)');
    }

    h.email.calls = [];
    await notifications.sendDueReminders();
    expect(h.email.calls.filter((c) => ours.has(c.to))).toEqual([]);
  });
});
