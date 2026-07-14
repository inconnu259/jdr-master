import { Component, computed, input } from '@angular/core';

/**
 * Barre de remplissage pour l'inscription à capacité limitée (Story 8.3) — jamais une simple
 * couleur : la valeur numérique reste toujours affichée en texte (AC7, socle d'accessibilité
 * hérité, même règle qu'EncumbranceBar). Réutilise à l'identique les 4 tokens de couleur globaux
 * (--color-available/unavailable/unknown/mixed), aucune nouvelle valeur (DESIGN.md §7).
 */
@Component({
  selector: 'app-fill-indicator',
  standalone: true,
  templateUrl: './fill-indicator.html',
  styleUrl: './fill-indicator.scss',
})
export class FillIndicator {
  readonly count = input.required<number>();
  readonly min = input.required<number>();
  readonly max = input.required<number>();

  protected readonly fillClass = computed(() => {
    if (this.count() < this.min()) return 'fill-indicator__fill--under-min';
    if (this.count() >= this.max()) return 'fill-indicator__fill--at-max';
    return 'fill-indicator__fill--mixed';
  });

  protected readonly fillPercent = computed(() =>
    this.max() > 0 ? Math.min(100, (this.count() / this.max()) * 100) : 0,
  );
}
