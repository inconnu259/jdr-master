import { Component, computed, input } from '@angular/core';
import { API_BASE } from '../../../core/api-base';

@Component({
  selector: 'app-portrait-panel',
  standalone: true,
  templateUrl: './portrait-panel.html',
  styleUrl: './portrait-panel.scss',
})
export class PortraitPanel {
  /** ID du personnage — requis dès qu'un `portraitUrl` est fourni (sert à construire l'URL protégée). */
  readonly characterId = input<string>('');
  /** Simple indicateur de présence d'un portrait (valeur elle-même non utilisée pour l'URL, cf. `characterId`). */
  readonly portraitUrl = input<string | null>(null);
  readonly name = input<string>('');

  protected readonly absoluteUrl = computed(() => {
    if (!this.portraitUrl()) return null;
    // Route protégée (AuthenticatedGuard) — jamais le chemin de fichier statique brut, cf. Story 4.5 review.
    return `${API_BASE}/characters/${this.characterId()}/portrait`;
  });
}
