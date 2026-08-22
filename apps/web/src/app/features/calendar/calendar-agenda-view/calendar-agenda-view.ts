import { Component, computed, inject, input, output } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { DaySlot } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import {
  type RailTarget,
  composeSeanceInfo,
  dateKeyToLocalMidnight,
  toDateKey,
} from '../day-detail.utils';
import type { GroupAvailability } from '../group-availability.utils';
import {
  participationAriaLabel,
  type VoteOptionActivatedEvent,
  type VoteParticipation,
} from '../poll-track.utils';
import { PollTrack } from '../poll-track/poll-track';
import {
  SLOT_LABELS,
  type AgendaBadge,
  type AgendaSectionId,
  badgeFor,
  sectionIdFor,
} from '../agenda-badge.utils';

/** Type d'entrée affichée dans la vue Agenda (Story 30.6, AC2) — un par couche pertinente.
 *
 *  ⚠️ Story 36.11 : trois de ces types n'ont plus de section dans l'Agenda
 *  (`mes-disponibilites`, `mes-indisponibilites`, `disponibilite-groupe`). Ils restent des types
 *  d'entrée valides — le rail, la vue Mois et la vue Semaine les consomment — mais la LISTE ne
 *  les rend plus. Le retrait est à l'affichage, jamais à la source. */
export type AgendaEntryType =
  | 'mes-seances'
  | 'votes-en-cours'
  | 'inscriptions-ouvertes'
  | 'mes-disponibilites'
  | 'mes-indisponibilites'
  | 'disponibilite-groupe';

/** Entrée déjà résolue par `CalendarView` (sources différentes selon le contexte personnel/partie,
 *  cf. encadré n°1 de la story) — ce composant ne fait QUE ranger et afficher, aucune dérivation
 *  ici. */
export interface AgendaEntry {
  /** Clé stable pour @for — pas forcément un id serveur (options de vote, créneaux agrégés). */
  key: string;
  type: AgendaEntryType;
  /** `YYYY-MM-DD`, ou chaîne vide si l'entrée n'a pas de date propre (inscriptions ouvertes) —
   *  rangée en fin de section dans ce cas, jamais traitée comme une anomalie (Story 36.11, AC3). */
  date: string;
  label: string;
  detail?: string;
  /** Story 36.1, Task 2 : créneau TYPÉ de l'entrée. `detail` porte déjà cette information sous
   *  forme de texte libre destiné à l'affichage ; le rail de détail a besoin d'une valeur
   *  exploitable pour ranger l'entrée dans la bonne ligne. `undefined` = créneau inconnu, traité
   *  comme `FULL_DAY` en lecture (même convention que `compute-display-status.ts`). */
  slot?: DaySlot;
  /** Story 36.1, Task 4 bis : identifiants de navigation. Renseignés uniquement pour les entrées
   *  ouvrables — aujourd'hui les séances, dont on ouvre le SCÉNARIO qui les porte (aucun écran de
   *  séance n'existe). Absents pour toute entrée non ouvrable. */
  partieId?: string;
  scenarioId?: string;
  seanceId?: string;
  /** Story 36.5 — informations pratiques d'une séance, gardées SEPAREES jusqu'à l'affichage :
   *  c'est ce qui permet d'en lâcher une quand la place manque (AC3). Une chaîne pré-composée
   *  rendrait l'ordre de repli impossible à appliquer en aval.
   *  ⚠️ Ne jamais les verser dans `detail`, qui porte déjà trois usages distincts.
   *  `seanceHeure` est une ETIQUETTE `"HH:MM"` : rien ne la parse, ne la compare ni ne la trie. */
  seanceHeure?: string | null;
  seanceLieu?: string | null;
  seanceNote?: string | null;
  /** Story 36.6 — la participation à l'option de vote portée par cette entrée.
   *
   *  ⚠️ **Depuis cette story, une entrée `votes-en-cours` représente UNE OPTION, pas un sondage.**
   *  Un vote proposant deux créneaux produit deux entrées, à deux dates — sans quoi seul le
   *  premier créneau serait marqué dans la grille (défaut pré-existant, encadré n°1 de la story).
   *
   *  Sous-objet plutôt que sept champs plats : `AgendaEntry` est déjà chargé, et la story 36.7 en
   *  ajoutera. Renseigné pour les seules entrées `votes-en-cours`. */
  vote?: VoteParticipation;
  /** Story 36.8 — la disponibilité du groupe sur ce créneau, en charge utile STRUCTURÉE.
   *
   *  ⚠️ `label` et `detail` portaient déjà cette information en texte libre (« Soir — 2/4
   *  disponibles ») : cela suffisait à une liste, jamais à une jauge, qui a besoin des nombres.
   *
   *  Renseigné pour les seules entrées `disponibilite-groupe`, qui n'existent qu'en contexte de
   *  partie (AD-16 : la couche n'a aucun sens dans le calendrier personnel). Depuis la 36.11 ces
   *  entrées ne sont plus rendues par l'Agenda ; le champ sert la grille et le rail. */
  group?: GroupAvailability;
  /** Story 36.11 — le compte-rendu de la séance manque, donc elle a encore quelque chose à me
   *  demander une fois jouée (« C'est passé »).
   *
   *  🚨 **Renseigné en contexte de PARTIE uniquement** : `SeanceDto.compteRendu` n'a aucun
   *  équivalent sur `MyCalendarSeanceEntry`. `undefined` signifie « on ne sait pas », et une
   *  séance dont on ne sait pas n'entre pas dans « C'est passé » — la section reste alors vide,
   *  donc absente. Ne pas confondre avec `false`, qui affirme que le compte-rendu existe. */
  compteRenduManquant?: boolean;
  /** Story 36.11 — je figure déjà parmi les inscrits de cette séance à inscription ouverte.
   *  Renseigné pour les seules entrées `inscriptions-ouvertes` ; commande le badge (« S'inscrire »
   *  contre « Inscrit »), jamais l'appartenance à une section. */
  jeSuisInscrit?: boolean;
}

/** Une section de l'Agenda, prête à rendre. Construite par `sections()`, jamais à la main. */
export interface AgendaSection {
  id: AgendaSectionId;
  /** Clé de ton — le libellé dépend du thème actif, comme tout titre de l'application. */
  titleKey: string;
  /** Teinte de la palette de statut portée par le liseré et l'en-tête. */
  tint: 'todo' | 'soon' | 'done';
  entries: AgendaEntry[];
}

/** L'ordre des trois sections est **contractuel** et ne dépend d'aucune donnée : ce qu'on attend
 *  de moi d'abord, ce qui est programmé ensuite, ce qui traîne derrière en dernier.
 *  [Source: EXPERIENCE.md §4.4 bis] */
const SECTION_ORDER: readonly Omit<AgendaSection, 'entries'>[] = [
  { id: 'awaiting', titleKey: 'calendar.agenda.section_awaiting', tint: 'todo' },
  { id: 'scheduled', titleKey: 'calendar.agenda.section_scheduled', tint: 'soon' },
  { id: 'past', titleKey: 'calendar.agenda.section_past', tint: 'done' },
];

/** Clés de ton des badges, par nature. L'imminence n'y figure pas : c'est un décompte calculé,
 *  pas un libellé de registre. */
const BADGE_KEYS: Record<Exclude<AgendaBadge['kind'], 'imminence'>, string> = {
  'answer-poll': 'calendar.agenda.badge_answer_poll',
  'poll-open': 'calendar.agenda.badge_poll_open',
  signup: 'calendar.agenda.badge_signup',
  'signed-up': 'calendar.agenda.badge_signed_up',
  debrief: 'calendar.agenda.badge_debrief',
};

/** Une entrée sans date propre se range en FIN de section. Une clé sentinelle plutôt qu'un test
 *  dans le comparateur : le tri reste une comparaison de chaînes, comme partout ailleurs. */
const NO_DATE_SORT_KEY = '9999-12-31';

const AGENDA_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});

/**
 * Vue Agenda (Story 36.11, FR-56) — troisième présentation du calendrier.
 *
 * 🚨 **Elle n'a pas d'axe temporel.** Elle ne trie pas par date : elle range par **ce qu'on
 * attend du lecteur**, en trois sections, et **aucun jour ne figure en en-tête** — la date
 * redevient une propriété de la ligne. C'est ce qui la distingue des deux grilles, qui portent
 * déjà le temps. [Source: EXPERIENCE.md §4.4 bis, `contrat-ui-calendrier.html` planche 3]
 *
 * Composant de rendu pur : la dérivation par couche/contexte (personnel via `GET /me/calendar`,
 * partie via les signaux déjà chargés) reste dans `CalendarView`. Aucun appel réseau n'existe ni
 * ne doit exister ici.
 */
@Component({
  selector: 'app-calendar-agenda-view',
  standalone: true,
  imports: [NgTemplateOutlet, MatProgressSpinnerModule, PollTrack],
  templateUrl: './calendar-agenda-view.html',
  styleUrl: './calendar-agenda-view.scss',
})
export class CalendarAgendaView {
  protected readonly theme = inject(ThemeToneService);

  readonly entries = input<AgendaEntry[]>([]);
  readonly loading = input(false);
  /** Story 36.11 — le « maintenant » de l'écran, **injecté** et jamais lu ici.
   *
   *  🚨 Un `new Date()` interne rendrait tout test indéterministe et pourrait placer deux entrées
   *  de part et d'autre d'une frontière de jour au sein du même rendu. `CalendarView` le fige au
   *  montage, une seule source pour tout l'écran (même patron que `Dashboard.countdownNow`). La
   *  valeur par défaut ne sert qu'à ne casser aucun site d'appel existant. */
  readonly todayKey = input<string>(toDateKey(new Date()));

  /** Story 36.7 — « Idem » de la table 1 d'`EXPERIENCE.md` : l'Agenda ouvre le même sélecteur de
   *  réponse que les grilles. Composant de rendu pur : il signale, il n'écrit pas. */
  readonly voteOptionActivated = output<VoteOptionActivatedEvent>();

  /** Story 36.11, AC5 — activer une ligne portant une séance ouvre **le scénario** qui la porte ;
   *  aucun écran de séance n'existe. Même type d'événement que le rail, pour que `CalendarView`
   *  branche les deux surfaces sur `onScenarioActivated()` — une seule navigation. */
  readonly scenarioActivated = output<RailTarget>();

  /**
   * Les sections à rendre, **dans l'ordre contractuel et sans les vides** (AC10).
   *
   * Une section absente vaut mieux qu'un en-tête suivi de rien : l'en-tête annoncerait un contenu
   * que l'écran ne porte pas.
   */
  protected readonly sections = computed<AgendaSection[]>(() => {
    const today = this.todayKey();
    const buckets = new Map<AgendaSectionId, AgendaEntry[]>([
      ['awaiting', []],
      ['scheduled', []],
      ['past', []],
    ]);

    for (const entry of this.entries()) {
      const id = sectionIdFor(entry, today);
      if (id) buckets.get(id)!.push(entry);
    }

    // « Ça t'attend » : ce qui réclame une action de moi d'abord — l'urgence est le critère de la
    // vue, elle doit valoir aussi À L'INTÉRIEUR d'une section. Puis la date, puis le libellé
    // (départage stable de deux entrées sans date, cf. revue de code de la 30.6).
    buckets
      .get('awaiting')!
      .sort(
        (a, b) =>
          this.actionRank(a, today) - this.actionRank(b, today) ||
          this.dateSortKey(a).localeCompare(this.dateSortKey(b)) ||
          a.label.localeCompare(b.label),
      );
    buckets
      .get('scheduled')!
      .sort((a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label));
    // « C'est passé » se lit du plus récent au plus ancien : un compte-rendu oublié hier prime
    // sur celui d'il y a trois mois.
    buckets
      .get('past')!
      .sort((a, b) => b.date.localeCompare(a.date) || a.label.localeCompare(b.label));

    return SECTION_ORDER.filter((s) => buckets.get(s.id)!.length > 0).map((s) => ({
      ...s,
      entries: buckets.get(s.id)!,
    }));
  });

  private actionRank(entry: AgendaEntry, today: string): number {
    return badgeFor(entry, today)?.tone === 'todo' ? 0 : 1;
  }

  private dateSortKey(entry: AgendaEntry): string {
    return entry.date || NO_DATE_SORT_KEY;
  }

  protected sectionTitle(section: AgendaSection): string {
    return this.theme.tone()[section.titleKey];
  }

  protected readonly emptyMessage = computed(() => this.theme.tone()['calendar.agenda.empty']);

  /**
   * AC2 — la date est une propriété de la ligne : elle est rendue **avec** l'entrée, jamais en
   * en-tête de groupe.
   *
   * Le créneau est traduit ici et non repris de `detail`, qui porte le code brut (`EVENING`) pour
   * les séances — un reste que la liste plate laissait fuir à l'écran.
   */
  protected metaLine(entry: AgendaEntry): string {
    const parts: string[] = [];
    if (entry.date) parts.push(this.dateWithSlot(entry.date, entry.slot));
    if (entry.type === 'inscriptions-ouvertes') {
      if (entry.detail) parts.push(entry.detail);
      parts.push('sans date');
    } else if (entry.type === 'votes-en-cours' && entry.detail && !entry.date) {
      parts.push(entry.detail);
    }
    const infos = this.seanceInfo(entry);
    if (infos) parts.push(infos);
    return parts.join(' · ');
  }

  private dateWithSlot(dateKey: string, slot: DaySlot | undefined): string {
    const date = AGENDA_DATE_FORMAT.format(dateKeyToLocalMidnight(dateKey));
    return slot && slot !== 'FULL_DAY' ? `${date}, ${SLOT_LABELS[slot].toLowerCase()}` : date;
  }

  /** Story 36.5 — même composition que le rail et la bande (AC10). L'agenda est une liste : il
   *  a la place, donc niveau complet. */
  protected seanceInfo(entry: AgendaEntry): string {
    return composeSeanceInfo(
      {
        seanceHeure: entry.seanceHeure ?? null,
        seanceLieu: entry.seanceLieu ?? null,
        seanceNote: entry.seanceNote ?? null,
      },
      'full',
    );
  }

  protected badge(entry: AgendaEntry): AgendaBadge | null {
    return badgeFor(entry, this.todayKey());
  }

  /** AC8 — le badge porte TOUJOURS un libellé : la teinte double le mot, elle ne le remplace
   *  jamais (P-1). */
  protected badgeLabel(badge: AgendaBadge): string {
    return badge.kind === 'imminence'
      ? (badge.text ?? '')
      : this.theme.tone()[BADGE_KEYS[badge.kind]];
  }

  protected badgeClass(badge: AgendaBadge): string {
    const intensity = badge.intensity ? ` agenda-badge--${badge.intensity}` : '';
    return `agenda-badge agenda-badge--${badge.tone}${intensity}`;
  }

  /**
   * AC5/AC12 — la cible de navigation d'une ligne, ou `null` si elle n'en a aucune.
   *
   * 🚨 Une entrée de vote n'est **jamais** ouvrable, même si elle portait un jour ces
   * identifiants : sa ligne contient déjà un bouton (le sélecteur de réponse), et un bouton dans
   * un bouton est du HTML invalide dont la navigation clavier ne se relève pas. La garde est
   * structurelle, pas une observation sur les données actuelles.
   *
   * Une entrée sans scénario identifiable — l'inscription ouverte du calendrier personnel, dont
   * le DTO ne porte pas de `scenarioId` — n'est pas cliquable **et ne s'en donne pas l'air** :
   * pas de bouton désactivé, pas de bouton du tout.
   */
  protected openTarget(entry: AgendaEntry): RailTarget | null {
    if (entry.vote || !entry.partieId || !entry.scenarioId) return null;
    return { partieId: entry.partieId, scenarioId: entry.scenarioId };
  }

  /** Le libellé accessible annonce l'ouverture du **scénario**, jamais de la séance
   *  [Source: EXPERIENCE.md §6 bis] — même formulation qu'au rail. */
  protected openLabel(entry: AgendaEntry): string {
    const meta = this.metaLine(entry);
    return meta
      ? `Ouvrir le scénario ${entry.label} — ${meta}`
      : `Ouvrir le scénario ${entry.label}`;
  }

  /** Revue de code 36.7 : même repli qu'au rail — `[attr.aria-label]` écrase le contenu du
   *  bouton, y compris le `role="img"`/`aria-label` propre à `<app-poll-track>` qu'il enveloppe. */
  protected voteAriaLabel(entry: AgendaEntry): string {
    const detail = entry.vote ? participationAriaLabel(entry.vote) : null;
    return detail
      ? `Répondre au vote — ${entry.label} — ${detail}`
      : `Répondre au vote — ${entry.label}`;
  }

  /** Date à minuit LOCAL, comme les grilles — jamais UTC (cf. `dateKeyToLocalMidnight`). */
  protected onVoteActivate(entry: AgendaEntry, event: Event): void {
    const vote = entry.vote;
    if (!vote || !entry.date || !(event.currentTarget instanceof HTMLElement)) return;
    this.voteOptionActivated.emit({
      vote,
      date: dateKeyToLocalMidnight(entry.date),
      slot: entry.slot ?? 'FULL_DAY',
      anchor: event.currentTarget,
    });
  }
}
