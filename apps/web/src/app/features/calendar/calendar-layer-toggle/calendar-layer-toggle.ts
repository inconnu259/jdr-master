import { Component, inject, input, output } from '@angular/core';
import type { CalendarLayerKey } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

/** Bandeau de bascule des couches du calendrier (Story 30.6, AC1/AC3/AC4) — composant de rendu
 *  pur : l'état des couches actives, la comparaison au défaut et la persistance (jamais depuis
 *  cet écran, encadré n°2 de la story) restent dans `CalendarView`. */
@Component({
  selector: 'app-calendar-layer-toggle',
  standalone: true,
  templateUrl: './calendar-layer-toggle.html',
  styleUrl: './calendar-layer-toggle.scss',
})
export class CalendarLayerToggle {
  readonly keys = input.required<CalendarLayerKey[]>();
  readonly active = input.required<CalendarLayerKey[]>();
  /** AC4/AC7 : visible dès que l'affichage courant s'écarte du défaut, ajout OU retrait. */
  readonly overridden = input.required<boolean>();

  readonly layerToggled = output<CalendarLayerKey>();
  readonly resetRequested = output<void>();

  protected readonly theme = inject(ThemeToneService);

  protected isActive(key: CalendarLayerKey): boolean {
    return this.active().includes(key);
  }
}
