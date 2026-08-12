/**
 * Progression du compte à rebours de séance (Story 29.11, DESIGN.md §7.4).
 *
 * **Ce n'est PAS une animation.** La maquette `palettes-3-pistes-et-rebours-animes.html` montre
 * les trois motifs en boucle de 8 secondes, mais sa propre légende dit pourquoi : *« Démonstration
 * accélérée : les sept derniers jours défilent en huit secondes […] dans l'application, la
 * progression est évidemment imperceptible à l'œil — c'est en revenant le lendemain qu'on voit
 * que ça a avancé. »*
 *
 * La valeur rendue ici est donc une **position statique**, fonction du nombre de jours restants.
 * Ce qui boucle dans le composant, c'est l'ambiance (scintillement, pulsation, oscillation) — et
 * elle, elle ne porte aucune information.
 */

/** Fenêtre du compte à rebours. Au-delà, il est au repos et n'est pas rendu du tout
 *  (DESIGN.md §7.4 : « se remplit sur les sept derniers jours uniquement »). */
export const COUNTDOWN_WINDOW_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Nombre de jours entiers entre deux instants, en **UTC**.
 *
 * Convention alignée sur `Dashboard.badgeLabel()`, qui formate `nextSessionDate` avec
 * `timeZone: 'UTC'` : le compte à rebours et le libellé de date sont affichés côte à côte et ne
 * doivent jamais se contredire d'un jour. L'incohérence de fond UTC/local du projet est un item
 * différé connu (`deferred-work.md`, revue de la Story 29.7) — la traiter ici serait un
 * changement transverse hors périmètre.
 */
function utcDaysBetween(from: Date, to: Date): number {
  const fromDay = Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate());
  const toDay = Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate());
  return Math.round((toDay - fromDay) / MS_PER_DAY);
}

/**
 * Progression vers la séance, dans `[0, 1]`.
 *
 * - `null` — aucune date, date invalide, ou séance à plus de {@link COUNTDOWN_WINDOW_DAYS} jours :
 *   **aucun compte à rebours n'est rendu**, ce n'est pas un compte à rebours vide.
 * - `0` à exactement 7 jours, `1` le jour même.
 * - Une séance passée retourne `1` (bornée), jamais une valeur négative — un `transform` ne doit
 *   jamais recevoir un nombre hors plage.
 *
 * `now` est un **paramètre** et non `new Date()` : sans cela aucun test ne serait déterministe,
 * et l'écran ne pourrait pas garantir que toutes ses tuiles raisonnent sur le même instant.
 */
export function countdownProgress(nextSessionDate: string | null, now: Date): number | null {
  if (!nextSessionDate) return null;

  const session = new Date(nextSessionDate);
  if (Number.isNaN(session.getTime())) return null;

  const daysLeft = utcDaysBetween(now, session);
  if (daysLeft > COUNTDOWN_WINDOW_DAYS) return null;

  const progress = (COUNTDOWN_WINDOW_DAYS - daysLeft) / COUNTDOWN_WINDOW_DAYS;
  return Math.min(1, Math.max(0, progress));
}
