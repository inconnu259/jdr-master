import { Component, computed, inject, input } from '@angular/core';
import { ThemeToneService } from '../../core/theme/theme-tone.service';

/** Position d'une feuille le long de la tige, dans `[0, 1]`. Dérivées de l'index, **jamais
 *  tirées** : le compte à rebours n'a pas de graine — il n'appartient pas à une partie, il
 *  appartient à une date. */
const LEAF_POSITIONS = [0.16, 0.32, 0.48, 0.64, 0.78] as const;

/** Au-delà de ce seuil, l'aiguille du manomètre est dans la zone rouge et s'agite nettement plus.
 *  C'est la seule animation de cette story dont l'intensité corrèle à une information — elle la
 *  **double** (le badge, le libellé et la position de l'aiguille la portent déjà), elle n'en est
 *  jamais le seul porteur. DESIGN.md §8 règle 2 interdit le second cas, pas le premier. */
const RED_ZONE_THRESHOLD = 0.7;

/**
 * Compte à rebours de la prochaine séance (Story 29.11, DESIGN.md §7.4).
 *
 * **Décoratif et redondant, par conception.** Il double le badge et le libellé de date, il ne
 * porte jamais une information qu'eux ne portent pas (AC5) — d'où `aria-hidden` et l'absence
 * totale de texte.
 *
 * **Deux natures à ne pas confondre :**
 * - la **progression** (`progress`) est une position **statique**, fonction des jours restants ;
 * - l'**ambiance** (scintillement, pulsation, oscillation) boucle dans le temps et est coupée par
 *   `prefers-reduced-motion`.
 *
 * Le motif réutilise celui de la bannière du thème actif (§7.4) : liane en Forêt Ancienne,
 * manomètre et conduite en Atelier Cuivré, comète et étoile en Grimoire Émeraude.
 */
@Component({
  selector: 'app-party-countdown',
  standalone: true,
  templateUrl: './party-countdown.html',
  styleUrl: './party-countdown.scss',
})
export class PartyCountdown {
  private readonly theme = inject(ThemeToneService);

  /** Progression dans `[0, 1]` — `0` à sept jours, `1` le jour même. Voir `countdownProgress()`. */
  readonly progress = input.required<number>();

  protected readonly activeTheme = this.theme.activeTheme;
  protected readonly leafPositions = LEAF_POSITIONS;

  /** Bornée défensivement : une valeur hors plage produirait un `transform` aberrant. */
  protected readonly clamped = computed(() => Math.min(1, Math.max(0, this.progress())));

  /** Une feuille n'est visible que si **la tige l'a atteinte ou dépassée**. C'est une fonction de
   *  la progression, pas une animation : la tige ne pousse pas sous les yeux de l'utilisateur.
   *  La transition d'opacité (feuille de style) adoucit seulement le passage d'un jour à l'autre. */
  protected leafLit(position: number): boolean {
    return this.clamped() >= position;
  }

  /** Angle de l'aiguille : de −72° (sept jours) à +66° (le jour même), comme la maquette. */
  protected readonly needleAngle = computed(() => -72 + this.clamped() * 138);

  protected readonly inRedZone = computed(() => this.clamped() >= RED_ZONE_THRESHOLD);

  /** `scaleX` plutôt que `width` : AC6 n'autorise que `transform` et `opacity`. Un plancher évite
   *  une tige ou une conduite de longueur nulle, illisible à sept jours. */
  protected readonly fillScale = computed(() => 0.06 + this.clamped() * 0.94);

  /** Position de la comète et du bourgeon le long de leur trajet, en pourcentage. */
  protected readonly travelPercent = computed(() => this.clamped() * 88);
}
