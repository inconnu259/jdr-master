import { Component, computed, input } from '@angular/core';

@Component({
  selector: 'app-character-avatar',
  standalone: true,
  templateUrl: './character-avatar.html',
  styleUrl: './character-avatar.scss',
})
export class CharacterAvatar {
  readonly name = input.required<string>();
  readonly size = input<44 | 64>(44);

  // Pas de portrait réel ce palier (Story 4.5) — toujours l'état initiales.
  protected readonly initials = computed(() => {
    const parts = this.name().trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0][0] + (parts[1]?.[0] ?? '')).toUpperCase();
  });

  protected readonly ariaLabel = computed(() => `Portrait de ${this.name()} (aucune image)`);
}
