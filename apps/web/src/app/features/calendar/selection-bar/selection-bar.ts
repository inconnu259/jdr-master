import { Component, computed, inject, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { AvailKind, DaySlot } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import type { AgendaSealRequest } from '../calendar-agenda-view/calendar-agenda-view';

/** Un segment du sélecteur de portée. L'ordre est celui du contrat d'UI :
 *  Journée · Matin · Après-m. · Soir. [Source: contrat-ui-calendrier.html:254] */
export interface ScopeOption {
  slot: DaySlot;
  /** Libellé court, celui de la planche — la place est comptée dans la barre. */
  label: string;
  /** Libellé complet, pour le lecteur d'écran (AC14) : « Après-m. » ne s'annonce pas. */
  fullLabel: string;
}

export const SCOPE_OPTIONS: readonly ScopeOption[] = [
  { slot: 'FULL_DAY', label: 'Journée', fullLabel: 'Journée entière' },
  { slot: 'MORNING', label: 'Matin', fullLabel: 'Matin' },
  { slot: 'AFTERNOON', label: 'Après-m.', fullLabel: 'Après-midi' },
  { slot: 'EVENING', label: 'Soir', fullLabel: 'Soir' },
] as const;

/**
 * Barre affichée dès qu'une sélection existe — glissée, tapée ou armée au clavier.
 *
 * Story 30.3 l'avait livrée avec trois actions (Disponible / Indisponible / Annuler).
 * Story 36.3 lui ajoute les trois pièces qui manquaient à FR-57 :
 *  - le **sélecteur de portée** (AC2), qui s'applique à toute la sélection ;
 *  - **« Autre… »** (AC4), désormais **le seul chemin** vers `ConstraintPanel`, donc vers la
 *    contrainte récurrente, la modification, la suppression et la découpe ;
 *  - l'**intention armée** (AC6) : `Entrée` doit valider « ce que la barre affiche », ce qui
 *    suppose que la barre affiche quelque chose. Elle est marquée par la **forme** du bouton
 *    (`mat-flat` contre `mat-stroked`) et par `aria-pressed`, jamais par la couleur seule (P-1).
 *
 * Elle ne construit ni n'envoie rien elle-même : le parent (CalendarWeekView /
 * CalendarMonthView) construit le lot et remonte l'événement à CalendarView.
 */
@Component({
  selector: 'app-selection-bar',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './selection-bar.html',
  styleUrl: './selection-bar.scss',
})
export class SelectionBar {
  readonly count = input.required<number>();
  readonly rangeLabel = input<string | null>(null);
  /** Portée courante — **dérivée** de la sélection : le créneau commun quand tous s'accordent,
   *  `null` dès qu'ils divergent (AC18, la bascule se faisant créneau par créneau). Choisir un
   *  segment est une ACTION : il réécrit toute la sélection (AC2). */
  readonly scope = input.required<DaySlot | null>();
  /** Ce que `Entrée` validera. Défaut `UNAVAILABLE` : c'est le résultat que produisait déjà le
   *  chemin clavier, à ceci près qu'il est désormais annoncé et modifiable (AC6). */
  readonly armedKind = input<AvailKind>('UNAVAILABLE');
  /** Story 36.15 — le créneau sélectionné correspond à une option d'un vote OPEN dont
   *  l'utilisateur est MJ : `null` sinon (aucune correspondance, sélection multiple, ou hors
   *  contexte MJ/partie). Résolu par le parent (`CalendarWeekView`/`CalendarMonthView`), qui
   *  connaît `entries()` — ce composant reste un composant de rendu pur, il ne fait que router
   *  vers `PollService.chooseDate()` via `CalendarView.onSealRequested()` (36.12), jamais
   *  l'appeler lui-même. */
  readonly sealCandidate = input<AgendaSealRequest | null>(null);

  readonly scopeChange = output<DaySlot>();
  readonly armedKindChange = output<AvailKind>();
  readonly markAvailable = output<void>();
  readonly markUnavailable = output<void>();
  readonly otherRequested = output<void>();
  readonly cancelled = output<void>();
  /** Story 36.15, AC5 — même contrat que `CalendarAgendaView.sealRequested` : aucune écriture
   *  ici, `CalendarView.onSealRequested()` porte la confirmation et l'appel. */
  readonly sealRequested = output<AgendaSealRequest>();

  protected readonly SCOPE_OPTIONS = SCOPE_OPTIONS;
  private readonly theme = inject(ThemeToneService);

  /** Même clé de thème que le bouton *Sceller* de l'Agenda (36.12) — la même action mérite le
   *  même mot, sur les trois thèmes (« Sceller » / « Planter » / « Verrouiller »). */
  protected readonly sealLabel = computed(() => this.theme.tone()['calendar.agenda.action_seal']);

  /** AC1/AC8 — nomme le créneau qu'il scellerait, comme `sealAriaLabel()` de l'Agenda
   *  (`calendar-agenda-view.ts:659`) : sans ça, ce bouton et « Autre… » se suivraient sans
   *  distinction pour un lecteur d'écran. */
  protected sealAriaLabel(candidate: AgendaSealRequest): string {
    return `${this.sealLabel()} — ${candidate.pollLabel} — ${candidate.dateLabel}`;
  }

  protected readonly scopeLabel = computed(
    () => SCOPE_OPTIONS.find((o) => o.slot === this.scope())?.fullLabel ?? 'créneaux variés',
  );

  /** Le groupe de portée est **un seul** arrêt de tabulation (AC13) : quatre `tabindex` de plus
   *  par barre alourdiraient un parcours clavier déjà long. Les flèches y circulent, comme dans
   *  un `radiogroup` natif. */
  protected onScopeKeydown(event: KeyboardEvent): void {
    const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
    const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
    if (!forward && !backward) return;
    const dir = forward ? 1 : -1;
    event.preventDefault();
    // Portée `null` (créneaux mélangés) : aucun segment n'est retenu, on repart du premier.
    const idx = SCOPE_OPTIONS.findIndex((o) => o.slot === this.scope());
    if (idx === -1) {
      this.scopeChange.emit(SCOPE_OPTIONS[forward ? 0 : SCOPE_OPTIONS.length - 1].slot);
      return;
    }
    const next = (idx + dir + SCOPE_OPTIONS.length) % SCOPE_OPTIONS.length;
    this.scopeChange.emit(SCOPE_OPTIONS[next].slot);
  }
}
