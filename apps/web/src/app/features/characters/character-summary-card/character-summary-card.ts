import { Component, computed, inject, input, output } from '@angular/core';
import type { CharacterDto } from '@master-jdr/shared';
import { characterName } from '../../../core/characters/character.util';
import { CharacterAvatar } from '../character-avatar/character-avatar';
import { IdentityLabel } from '../../../shared/identity/identity-label';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { pendingLevelsLocal } from '../character-sheet/level-thresholds';

@Component({
  selector: 'app-character-summary-card',
  standalone: true,
  imports: [CharacterAvatar, IdentityLabel],
  templateUrl: './character-summary-card.html',
  styleUrl: './character-summary-card.scss',
})
export class CharacterSummaryCard {
  protected readonly theme = inject(ThemeToneService);

  readonly character = input.required<CharacterDto>();
  readonly className = input<string>('');
  /** N'affiche le badge MJ/pseudo que si le **viewer** est le MJ — jamais pour un joueur (AC3). */
  readonly showOwnerInfo = input(false);
  /** Nom de la Partie d'origine (Story 29.2, AC3) — optionnel, `null` par défaut : n'affecte aucun
   *  des sites d'appel existants (roster, xp-history, partie-detail, scenario-editor…). */
  readonly partieName = input<string | null>(null);

  readonly selected = output<void>();

  protected readonly name = computed(() => characterName(this.character()));

  protected readonly hasPendingLevelUp = computed(() => {
    const c = this.character();
    const appliedCount = ((c.sheetData as any)?.levelUps?.length as number | undefined) ?? 0;
    return pendingLevelsLocal(c.xp, appliedCount).length > 0;
  });

  protected onClick(): void {
    this.selected.emit();
  }
}
