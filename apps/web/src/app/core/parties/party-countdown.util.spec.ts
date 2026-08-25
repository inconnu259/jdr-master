import { COUNTDOWN_WINDOW_DAYS, countdownProgress } from './party-countdown.util';

/** Instant de référence figé : `now` est un paramètre précisément pour que ces tests ne dépendent
 *  jamais de l'heure réelle. */
const NOW = new Date('2026-08-12T10:00:00.000Z');

function inDays(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}

describe('countdownProgress (Story 29.11, AC4)', () => {
  it('aucune date → null (pas de compte à rebours, et non un compte à rebours vide)', () => {
    expect(countdownProgress(null, NOW)).toBeNull();
  });

  it('séance au-delà de la fenêtre de sept jours → null (« au-delà, au repos »)', () => {
    expect(countdownProgress(inDays(COUNTDOWN_WINDOW_DAYS + 1), NOW)).toBeNull();
    expect(countdownProgress(inDays(30), NOW)).toBeNull();
  });

  it('à exactement sept jours → 0, le jour même → 1', () => {
    expect(countdownProgress(inDays(COUNTDOWN_WINDOW_DAYS), NOW)).toBe(0);
    expect(countdownProgress(inDays(0), NOW)).toBe(1);
  });

  it('progression monotone croissante à mesure que la date approche', () => {
    const values = [7, 6, 5, 4, 3, 2, 1, 0].map((d) => countdownProgress(inDays(d), NOW)!);
    for (let i = 1; i < values.length; i++) {
      expect(values[i]).toBeGreaterThan(values[i - 1]);
    }
  });

  it('toujours borné dans [0, 1]', () => {
    for (let d = -30; d <= COUNTDOWN_WINDOW_DAYS; d++) {
      const value = countdownProgress(inDays(d), NOW)!;
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThanOrEqual(1);
    }
  });

  it('séance passée → 1, jamais une valeur négative', () => {
    expect(countdownProgress(inDays(-1), NOW)).toBe(1);
    expect(countdownProgress(inDays(-45), NOW)).toBe(1);
  });

  it('date invalide → null, jamais un NaN propagé jusqu’à un transform', () => {
    expect(countdownProgress('pas-une-date', NOW)).toBeNull();
    expect(countdownProgress('', NOW)).toBeNull();
  });

  it('raisonne en jours UTC, comme le libellé de date affiché à côté', () => {
    // Deux instants du même jour UTC donnent la même progression : c'est le JOUR qui compte, pas
    // l'heure — sinon le compte à rebours et le badge pourraient se contredire d'un jour.
    const morning = countdownProgress('2026-08-15T01:00:00.000Z', NOW);
    const evening = countdownProgress('2026-08-15T23:00:00.000Z', NOW);
    expect(morning).toBe(evening);
  });

  it('ne dépend pas de l’heure de `now` au sein d’une même journée', () => {
    const early = countdownProgress(inDays(3), new Date('2026-08-12T00:30:00.000Z'));
    const late = countdownProgress(inDays(3), new Date('2026-08-12T23:30:00.000Z'));
    expect(early).toBe(late);
  });
});
