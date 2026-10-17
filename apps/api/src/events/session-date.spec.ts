import { formatSessionDate } from './session-date';

describe('formatSessionDate (Story 40.4)', () => {
  it('jour en toutes lettres et créneau entre parenthèses', () => {
    const day = new Date('2026-10-24T00:00:00.000Z');
    expect(formatSessionDate(day, 'EVENING')).toBe('samedi 24 octobre (soir)');
    expect(formatSessionDate(day, 'MORNING')).toBe('samedi 24 octobre (matin)');
    expect(formatSessionDate(day, 'AFTERNOON')).toBe('samedi 24 octobre (après-midi)');
    expect(formatSessionDate(day, 'FULL_DAY')).toBe('samedi 24 octobre (toute la journée)');
  });

  it('sans créneau : la date seule', () => {
    expect(formatSessionDate(new Date('2026-10-24T00:00:00.000Z'), null)).toBe('samedi 24 octobre');
  });

  it('le jour UTC stocké n’est jamais décalé, quel que soit le fuseau', () => {
    expect(formatSessionDate(new Date('2026-10-24T23:59:59.000Z'), null)).toBe('samedi 24 octobre');
    expect(formatSessionDate(new Date('2026-01-01T00:00:00.000Z'), 'EVENING')).toBe(
      'jeudi 1 janvier (soir)',
    );
  });
});
