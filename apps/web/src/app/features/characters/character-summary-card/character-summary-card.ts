import { Component, computed, input, output } from '@angular/core';
import type { CharacterDto } from '@master-jdr/shared';
import { characterName } from '../../../core/characters/character.util';
import { CharacterAvatar } from '../character-avatar/character-avatar';

@Component({
  selector: 'app-character-summary-card',
  standalone: true,
  imports: [CharacterAvatar],
  templateUrl: './character-summary-card.html',
  styleUrl: './character-summary-card.scss',
})
export class CharacterSummaryCard {
  readonly character = input.required<CharacterDto>();
  readonly className = input<string>('');

  readonly selected = output<void>();

  protected readonly name = computed(() => characterName(this.character()));

  protected onClick(): void {
    this.selected.emit();
  }
}
