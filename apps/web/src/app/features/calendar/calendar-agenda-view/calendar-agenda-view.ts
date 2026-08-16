import { Component, computed, input } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

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
