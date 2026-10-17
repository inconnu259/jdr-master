import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { CreateEventDto } from './create-event.dto';

const valid = { title: 'Catane et galettes', date: '2031-10-10', slot: 'EVENING' };

async function check(payload: object) {
  return validate(plainToInstance(CreateEventDto, payload));
}

/** Propriétés en erreur et messages (toujours en français). */
async function errorsOf(payload: object) {
  const errors = await check(payload);
  return {
    properties: errors.map((e) => e.property).sort(),
    messages: errors.flatMap((e) => Object.values(e.constraints ?? {})),
  };
}

describe('CreateEventDto (Story 40.1)', () => {
  it('le minimum (nom, jour, créneau) → valide ; « tous les membres » par défaut', async () => {
    expect(await check(valid)).toHaveLength(0);
    expect(await check({ ...valid, capacity: null })).toHaveLength(0);
  });

  it('tous les champs renseignés → valide, sans plafond de places', async () => {
    expect(
      await check({
        ...valid,
        lieu: 'Lyon 3e',
        heureRdv: '20:30',
        notePratique: 'On mange sur place.',
        capacity: 8,
      }),
    ).toHaveLength(0);
    expect(await check({ ...valid, capacity: 500 })).toHaveLength(0);
  });

  it.each(['', '   '])('nom vide (« %s ») → refusé, message en français', async (title) => {
    const { properties, messages } = await errorsOf({ ...valid, title });
    expect(properties).toEqual(['title']);
    expect(messages).toContain('Le nom ne peut pas être vide');
  });

  it.each(['FULL_DAY', '', undefined, 'NIGHT'])('créneau « %s » → refusé', async (slot) => {
    const { properties, messages } = await errorsOf({ ...valid, slot });
    expect(properties).toEqual(['slot']);
    expect(messages).toContain('Le créneau doit être le matin, l’après-midi ou le soir');
  });

  it.each(['10/10/2031', '2031-1-1', '', 'demain'])('date « %s » → refusée', async (date) => {
    const { properties } = await errorsOf({ ...valid, date });
    expect(properties).toEqual(['date']);
  });

  it.each(['8:30', '24:00', '20h30', '20:30:00'])('heure « %s » → refusée', async (heureRdv) => {
    const { properties, messages } = await errorsOf({ ...valid, heureRdv });
    expect(properties).toEqual(['heureRdv']);
    expect(messages).toContain("L'heure de rendez-vous doit être au format HH:MM (24 h)");
  });

  it('lieu > 80 et note > 200 caractères → refusés', async () => {
    const { properties } = await errorsOf({
      ...valid,
      lieu: 'x'.repeat(81),
      notePratique: 'x'.repeat(201),
    });
    expect(properties).toEqual(['lieu', 'notePratique']);
    expect(await check({ ...valid, lieu: 'x'.repeat(80), notePratique: 'x'.repeat(200) })).toHaveLength(0);
  });

  it.each([1, 0, -3, 2.5])('places limitées à %s → refusées (au moins 2, hôte compris)', async (capacity) => {
    const { properties } = await errorsOf({ ...valid, capacity });
    expect(properties).toEqual(['capacity']);
  });

  it('places limitées à 2 → valide', async () => {
    expect(await check({ ...valid, capacity: 2 })).toHaveLength(0);
  });
});
