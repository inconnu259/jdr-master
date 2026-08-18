import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { AvailKind, DaySlot } from '@master-jdr/shared';

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

  readonly scopeChange = output<DaySlot>();
  readonly armedKindChange = output<AvailKind>();
  readonly markAvailable = output<void>();
  readonly markUnavailable = output<void>();
  readonly otherRequested = output<void>();
  readonly cancelled = output<void>();

  protected readonly SCOPE_OPTIONS = SCOPE_OPTIONS;

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
