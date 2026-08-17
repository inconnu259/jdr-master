import { Component, computed, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { DaySlot } from '@master-jdr/shared';

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
  imports: [MatProgressSpinnerModule],
  templateUrl: './calendar-agenda-view.html',
  styleUrl: './calendar-agenda-view.scss',
})
export class CalendarAgendaView {
  readonly entries = input<AgendaEntry[]>([]);
  readonly loading = input(false);

  protected readonly sortedEntries = computed(() =>
    // Revue de code : clé de tri secondaire (libellé) pour les entrées sans date propre
    // (inscriptions ouvertes, votes sans option) — sinon deux entrées à date:'' ne se
    // départagent que par ordre d'insertion, imprévisible pour l'utilisateur.
    [...this.entries()].sort(
      (a, b) => a.date.localeCompare(b.date) || a.label.localeCompare(b.label),
    ),
  );

  protected typeLabel(type: AgendaEntryType): string {
    return TYPE_LABELS[type];
  }
}
