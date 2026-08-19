import { Component, computed, input, output } from '@angular/core';
import type { DaySlot, SlotStatus } from '@master-jdr/shared';
import {
  type DayDetail,
  type DaySlotDetail,
  type RailSlot,
  type RailTarget,
  dateKeyToUtcMidnight,
  composeSeanceInfo,
} from '../day-detail.utils';

const STATUS_LABELS: Record<SlotStatus, string> = {
  AVAILABLE: 'Disponible',
  UNAVAILABLE: 'Indisponible',
  UNKNOWN: 'Rien de prévu',
};

const SLOT_NAMES: Record<RailSlot, string> = {
  MORNING: 'matin',
  AFTERNOON: 'après-midi',
  EVENING: 'soir',
};

const DAY_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/**
 * Story 36.1 — le rail de détail.
 *
 * Bande PERMANENTE sous la grille, en vue Mois comme en vue Semaine, à toutes les largeurs.
 * Aucun geste ne l'ouvre ni ne la ferme : « le rail suit, il ne se commande pas »
 * (EXPERIENCE.md §6 bis, principe 2). Composant de RENDU PUR — il ne connaît ni le `Router`, ni
 * les routes, ni aucun service de données : `CalendarView` lui passe un `DayDetail` déjà projeté
 * et porte la navigation.
 */
@Component({
  selector: 'app-calendar-detail-rail',
  standalone: true,
  imports: [],
  templateUrl: './calendar-detail-rail.html',
  styleUrl: './calendar-detail-rail.scss',
})
export class CalendarDetailRail {
  readonly detail = input<DayDetail | null>(null);
  /** Créneau effectivement touché, quand le geste en désignait un. `FULL_DAY` (tap sur le corps
   *  d'une case de la vue Mois) ne nomme aucun créneau en particulier. */
  readonly touchedSlot = input<DaySlot | null>(null);
  readonly loading = input(false);

  /** AC11 — nommé d'après la DESTINATION : on ouvre le scénario qui porte la séance, jamais une
   *  « fenêtre de séance », qui n'existe pas dans l'application. */
  readonly scenarioActivated = output<RailTarget>();

  protected readonly dayLabel = computed(() => {
    const d = this.detail();
    if (!d) return '';
    const formatted = DAY_FORMAT.format(dateKeyToUtcMidnight(d.date));
    const slot = this.touchedSlot();
    return slot && slot !== 'FULL_DAY' ? `${formatted} — ${SLOT_NAMES[slot] ?? ''}` : formatted;
  });

  protected isTouched(slot: DaySlotDetail): boolean {
    return this.touchedSlot() === slot.slot;
  }

  protected statusLabel(status: SlotStatus): string {
    return STATUS_LABELS[status];
  }

  /** Story 36.5 — la composition passe par le point unique de `day-detail.utils` (AC10). Le rail
   *  demande le niveau COMPLET : c'est la surface la plus riche de l'écran, et depuis la story
   *  36.2 c'est la seule qui porte l'information en largeur téléphone (AC11). */
  protected seanceInfo(slot: DaySlotDetail): string {
    return composeSeanceInfo(slot, 'full');
  }

  /** Nom accessible de la ligne activable : il annonce le SCÉNARIO, pas la séance — la promesse
   *  faite au lecteur d'écran doit correspondre à l'endroit où il atterrit. `aria-label` écrasant
   *  tout contenu visuel, les informations pratiques doivent y être repliées (AC13). */
  protected openLabel(slot: DaySlotDetail): string {
    const info = this.seanceInfo(slot);
    return info
      ? `Ouvrir le scénario ${slot.seanceLabel} — ${info}`
      : `Ouvrir le scénario ${slot.seanceLabel}`;
  }

  protected onActivate(slot: DaySlotDetail): void {
    if (slot.seanceTarget) this.scenarioActivated.emit(slot.seanceTarget);
  }
}
