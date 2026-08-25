import { Component, computed, inject, input } from '@angular/core';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { PollTrack } from '../poll-track/poll-track';
import { GroupGauge } from '../group-gauge/group-gauge';
import type { VoteParticipation } from '../poll-track.utils';
import type { GroupAvailability } from '../group-availability.utils';

/** Le rang de bande qu'une entrée illustre, ou la forme composite qu'elle instancie. */
type LegendShape = 'available' | 'unavailable' | 'seance' | 'vote' | 'none' | 'track' | 'group';

interface LegendEntry {
  shape: LegendShape;
  labelKey: string;
}

/**
 * Une participation de démonstration : 5 votants, 2 oui, 1 peut-être — assez pour que la piste
 * montre ses trois segments ET sa part tramée, qui est précisément ce que la légende explique.
 *
 * 🚨 Les identifiants sont vides à dessein : cette piste est une ILLUSTRATION, elle ne désigne
 * aucun vote réel. `PollTrack` ne s'en sert pas pour rendre — seules les surfaces cliquables
 * construisent une URL à partir du triplet d'identité, et la légende n'est pas cliquable.
 */
const DEMO_VOTE: VoteParticipation = {
  partieId: '',
  pollId: '',
  optionId: '',
  yes: 2,
  maybe: 1,
  no: 0,
  total: 5,
  myAnswer: null,
};

/** Un groupe de démonstration : 3 disponibles sur 5, donc une jauge à 60 % — la proportion que le
 *  contrat dessine (`contrat-ui-calendrier.html:663`). `members: null` force la JAUGE et non les
 *  pastilles : c'est la forme agrégée que l'entrée nomme. */
const DEMO_GROUP: GroupAvailability = {
  available: 3,
  unavailable: 1,
  unknown: 1,
  total: 5,
  members: null,
};

const OBVIOUS_ENTRIES: LegendEntry[] = [
  { shape: 'available', labelKey: 'calendar.legend.entry.available' },
  { shape: 'unavailable', labelKey: 'calendar.legend.entry.unavailable' },
];

const NEEDS_LEGEND_ENTRIES: LegendEntry[] = [
  { shape: 'seance', labelKey: 'calendar.legend.entry.seance' },
  { shape: 'vote', labelKey: 'calendar.legend.entry.vote' },
  { shape: 'track', labelKey: 'calendar.legend.entry.poll_track' },
  { shape: 'group', labelKey: 'calendar.legend.entry.group' },
  { shape: 'none', labelKey: 'calendar.legend.entry.none' },
];

/**
 * La légende du calendrier (Story 36.14, FR-54 — AC5/AC6/AC13/AC14).
 *
 * **Deux groupes, et la règle qui les sépare** : « Vert et rouge se passent d'explication. Tout ce
 * qui code par l'intensité, la trame, ou une teinte sans sens partagé en demande une. »
 * [Source: EXPERIENCE.md:384 ; annotation 30 du contrat.]
 *
 * 🚨 **ELLE NE REDESSINE RIEN** (AC13). Chaque pastille porte le vrai `data-winner` de la bande,
 * dont les traitements viennent du partial partagé `_band-ranks.scss` ; la participation et la
 * disponibilité du groupe instancient les VRAIS composants, `PollTrack` et `GroupGauge`.
 * L'annotation 31 exige « exactement le traitement réel de la case — pas une approximation », et
 * la seule façon d'y satisfaire durablement est de ne pas avoir de seconde copie à maintenir :
 * trois valeurs divergentes circulaient déjà pour la seule trame au moment d'écrire cette story.
 *
 * Effet gratuit et voulu : la forme du groupe est choisie par `GroupGauge` lui-même. Le trou
 * relevé pendant la rédaction — un MJ à six membres ou moins voit des PASTILLES là où la planche
 * ne légende qu'une jauge — se referme donc structurellement le jour où l'on voudra l'illustrer
 * dans le contexte du lecteur, sans toucher à ce composant.
 *
 * ⚠️ **La vue Semaine ne rend pas encore ces formes** (observation n°16 de la story 36.13 : la
 * cellule NOMME l'événement mais ne le MARQUE pas). La légende décrit donc fidèlement le Mois et
 * le rail, et partiellement la Semaine. Écart connu, consigné, hors périmètre de cette story.
 */
@Component({
  selector: 'app-calendar-legend',
  standalone: true,
  imports: [PollTrack, GroupGauge],
  templateUrl: './calendar-legend.html',
  styleUrl: './calendar-legend.scss',
})
export class CalendarLegend {
  /** AC14 — « la disponibilité du groupe » n'a de sens que dans une partie. */
  readonly partieContext = input(false);

  protected readonly theme = inject(ThemeToneService);
  protected readonly DEMO_VOTE = DEMO_VOTE;
  protected readonly DEMO_GROUP = DEMO_GROUP;

  protected readonly obviousEntries = OBVIOUS_ENTRIES;

  protected readonly needsLegendEntries = computed<LegendEntry[]>(() =>
    this.partieContext()
      ? NEEDS_LEGEND_ENTRIES
      : NEEDS_LEGEND_ENTRIES.filter((e) => e.shape !== 'group'),
  );
}
