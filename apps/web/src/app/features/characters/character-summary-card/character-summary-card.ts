import { Component, computed, inject, input, output } from '@angular/core';
import type { CharacterDto } from '@master-jdr/shared';
import { characterName } from '../../../core/characters/character.util';
import { CharacterAvatar } from '../character-avatar/character-avatar';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

@Component({
  selector: 'app-character-summary-card',
  standalone: true,
  imports: [CharacterAvatar],
  templateUrl: './character-summary-card.html',
  styleUrl: './character-summary-card.scss',
})
export class CharacterSummaryCard {
  protected readonly theme = inject(ThemeToneService);

  readonly character = input.required<CharacterDto>();
  readonly className = input<string>('');
  /** N'affiche le badge MJ/pseudo que si le **viewer** est le MJ — jamais pour un joueur (AC3). */
  readonly showOwnerInfo = input(false);

  readonly selected = output<void>();

  protected readonly name = computed(() => characterName(this.character()));

  protected onClick(): void {
    this.selected.emit();
  }
}
