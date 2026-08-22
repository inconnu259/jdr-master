import { Component, computed, input, output } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { DaySlot } from '@master-jdr/shared';
import { composeSeanceInfo, dateKeyToLocalMidnight } from '../day-detail.utils';
import type { GroupAvailability } from '../group-availability.utils';
import {
  participationAriaLabel,
  type VoteOptionActivatedEvent,
  type VoteParticipation,
} from '../poll-track.utils';
import { GroupGauge } from '../group-gauge/group-gauge';
import { PollTrack } from '../poll-track/poll-track';

/** Type d'entrée affichée dans la vue Agenda (Story 30.6, AC2) — un par couche pertinente. Chaque
 *  entrée reste identifiable comme telle (badge de type), jamais une liste indifférenciée. */
export type AgendaEntryType =
  | 'mes-seances'
  | 'votes-en-cours'
  | 'inscriptions-ouvertes'
  | 'mes-disponibilites'
  | 'mes-indisponibilites'
  | 'disponibilite-groupe';

/** Entrée déjà résolue par `CalendarView` (sources différentes selon le contexte personnel/partie,
 *  cf. encadré n°1 de la story) — ce composant ne fait QUE trier et afficher, aucune dérivation ici. */
export interface AgendaEntry {
  /** Clé stable pour @for — pas forcément un id serveur (options de vote, créneaux agrégés). */
  key: string;
  type: AgendaEntryType;
  /** `YYYY-MM-DD`, ou chaîne vide si l'entrée n'a pas de date propre (inscriptions ouvertes) —
   *  triée en tête de liste dans ce cas. */
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
   *  Le texte reste, pour l'Agenda ; ce champ est ce que la grille et le rail consomment.
   *
   *  Renseigné pour les seules entrées `disponibilite-groupe`, qui n'existent qu'en contexte de
   *  partie (AD-16 : la couche n'a aucun sens dans le calendrier personnel, AC8). */
  group?: GroupAvailability;
}

const TYPE_LABELS: Record<AgendaEntryType, string> = {
  'mes-seances': 'Séance',
  'votes-en-cours': 'Vote de date',
  'inscriptions-ouvertes': 'Inscriptions ouvertes',
  'mes-disponibilites': 'Disponibilité',
  'mes-indisponibilites': 'Indisponibilité',
  'disponibilite-groupe': 'Disponibilité du groupe',
};

/** Vue Agenda (Story 30.6, AC1/AC2/AC5) — troisième présentation du calendrier, liste
 *  chronologique des couches actives. Composant de rendu pur : la dérivation par couche/contexte
 *  (personnel via `GET /me/calendar`, partie via les signaux déjà chargés) reste dans
 *  `CalendarView` (encadré n°1). */
@Component({
  selector: 'app-calendar-agenda-view',
  standalone: true,
  imports: [MatProgressSpinnerModule, PollTrack, GroupGauge],
  templateUrl: './calendar-agenda-view.html',
  styleUrl: './calendar-agenda-view.scss',
})
export class CalendarAgendaView {
  readonly entries = input<AgendaEntry[]>([]);
  readonly loading = input(false);

  /** Story 36.7 — « Idem » de la table 1 d'`EXPERIENCE.md` : l'Agenda ouvre le même sélecteur de
   *  réponse que les grilles. Composant de rendu pur : il signale, il n'écrit pas. */
  readonly voteOptionActivated = output<VoteOptionActivatedEvent>();

  protected readonly sortedEntries = computed(() =>
    // Revue de code : clé de tri secondaire (libellé) pour les entrées sans date propre
    // (inscriptions ouvertes, votes sans option) — sinon deux entrées à date:'' ne se
    // départagent que par ordre d'insertion, imprévisible pour l'utilisateur.
    [...this.entries()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label),
    ),
  );

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

  protected typeLabel(type: AgendaEntryType): string {
    return TYPE_LABELS[type];
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
