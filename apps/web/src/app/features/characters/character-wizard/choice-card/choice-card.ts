import { Component, computed, input, output } from '@angular/core';

export interface ChoiceCardOption {
  key: string;
  label: string;
  /** Sous-titre descriptif visible (Story 31.4, DESIGN §7.1) — absent/vide ⇒ aucune ligne rendue. */
  detail?: string;
}

let nextCardId = 0;

@Component({
  selector: 'app-choice-card',
  standalone: true,
  templateUrl: './choice-card.html',
  styleUrl: './choice-card.scss',
})
export class ChoiceCard {
  readonly option = input.required<ChoiceCardOption>();
  readonly selected = input<boolean>(false);
  /** Alignement du contenu : `start` par défaut, `center` pour les cartes courtes (profils). */
  readonly align = input<'start' | 'center'>('start');

  /**
   * Carte DÉPLOYÉE (piste B, Story 31.4) : c'est l'en-tête d'un bloc dont le détail vit juste en
   * dessous (`app-choice-detail`). Le sous-titre laisse alors la place à `expandedHint`, puisque le
   * détail complet est déjà affiché.
   */
  readonly expanded = input<boolean>(false);
  /** Indication affichée dans l'en-tête d'une carte déployée (ex. « Toucher pour désélectionner »). */
  readonly expandedHint = input<string>('');

  readonly selectedOption = output<string>();

  /** Identifiant du sous-titre, cible d'`aria-describedby` (unique par instance). */
  protected readonly detailId = `choice-card-detail-${nextCardId++}`;
  protected readonly detail = computed(() => this.option().detail?.trim() || null);
  /** Sous-titre réellement rendu : jamais sur une carte déployée (le détail est dessous). */
  protected readonly showDetail = computed(() => (this.expanded() ? null : this.detail()));

  protected onClick(): void {
    this.selectedOption.emit(this.option().key);
  }
}
