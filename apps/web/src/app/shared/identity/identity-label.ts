import { Component, computed, inject, input } from '@angular/core';
import { ThemeToneService } from '../../core/theme/theme-tone.service';

type IdentityLabelMode = 'joint' | 'single-character' | 'single-player' | 'empty';

@Component({
  selector: 'app-identity-label',
  standalone: true,
  imports: [],
  templateUrl: './identity-label.html',
  styleUrl: './identity-label.scss',
})
export class IdentityLabel {
  readonly characterName = input<string | null>(null);
  readonly playerName = input<string | null>(null);

  protected readonly theme = inject(ThemeToneService);

  protected readonly mode = computed<IdentityLabelMode>(() => {
    if (this.characterName() && this.playerName()) return 'joint';
    if (this.characterName()) return 'single-character';
    // `playerName` peut être une chaîne vide et non `null` : l'API renseigne `ownerDisplayName`
    // avec `?? ''` quand le compte propriétaire n'est plus résolvable. Sans cette branche, on
    // rendait une icône silhouette sans aucun texte, et un `aria-label` tronqué à « Joueur »
    // (revue de code 28.2).
    if (this.playerName()) return 'single-player';
    return 'empty';
  });

  protected readonly singleAriaLabel = computed(() => {
    if (this.mode() === 'single-character') {
      return `${this.theme.tone()['identity.character_label']} ${this.characterName()}`;
    }
    return `${this.theme.tone()['identity.player_label']} ${this.playerName()}`;
  });
}
