import { Component, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

/** Barre affichée pendant une sélection glissée en cours (Story 30.3) — propose de déclarer le
 *  lot disponible/indisponible ou d'annuler. Ne construit ni n'envoie rien elle-même : le parent
 *  (CalendarWeekView/CalendarMonthView) construit le lot et remonte l'événement à CalendarView. */
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

  readonly markAvailable = output<void>();
  readonly markUnavailable = output<void>();
  readonly cancelled = output<void>();
}
