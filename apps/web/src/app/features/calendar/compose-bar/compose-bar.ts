import { Component, computed, input, output } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

/**
 * Story 36.10 — la barre **persistante** du mode de composition d'un vote (AC1).
 *
 * Composant de **rendu pur** : aucun service, aucun état propre, aucune écriture. Il affiche ce
 * qui est composé et signale les deux issues — `CalendarView` décide. Même patron que
 * `DestinyControl`, `SelectionBar`, `PollTrack`.
 *
 * 🚨 **Ce n'est PAS `SelectionBar`, et il ne doit jamais le devenir.** `SelectionBar` n'existe à
 * l'écran que tant qu'une sélection existe ; celle-ci doit rester visible **pendant toute la
 * durée du mode**, y compris à zéro créneau composé — c'est elle qui porte la seule sortie du
 * mode avec `Échap`, et une barre qui disparaîtrait quand on retire le dernier créneau
 * enfermerait le MJ.
 *
 * ⚠️ Écart assumé avec `contrat-ui-calendrier.html:376`, qui dessine « Ajouter des dates » dans
 * la barre de sélection : cet armement suppose une sélection préalable, que l'AC1 interdit
 * d'exiger. Le bouton d'armement vit donc dans la bande de contrôles, frère de la Destinée.
 */
@Component({
  selector: 'app-compose-bar',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './compose-bar.html',
  styleUrl: './compose-bar.scss',
})
export class ComposeBar {
  /** Nombre de créneaux actuellement composés. */
  readonly count = input.required<number>();
  /** Ce que la composition vise : le nom du vote modifié, ou l'annonce d'un vote neuf. */
  readonly targetLabel = input.required<string>();
  /** `true` pendant l'écriture — évite une double validation (patron `pollActionPending`). */
  readonly busy = input(false);
  /**
   * `false` quand la validation n'aboutirait pas : moins de deux créneaux (borne serveur), ou
   * création demandée sans aucune séance éligible (AC11). Le bouton est alors **désactivé et
   * expliqué** — jamais silencieusement inerte.
   */
  readonly canConfirm = input.required<boolean>();
  /** Pourquoi la validation est impossible, en toutes lettres. Vide quand elle l'est. */
  readonly blockedReason = input<string>('');

  readonly confirmed = output<void>();
  readonly cancelled = output<void>();

  /** AC16 — l'état du mode vit dans du TEXTE, pas seulement dans un liseré. */
  protected readonly countLabel = computed(() => {
    const n = this.count();
    if (n === 0) return 'Aucun créneau désigné';
    return `${n} créneau${n > 1 ? 'x' : ''} désigné${n > 1 ? 's' : ''}`;
  });
}
