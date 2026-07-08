import { Component, computed, inject, input, output, signal } from '@angular/core';
import type { CharacterDto, PartieMemberDto } from '@master-jdr/shared';
import { CharacterAvatar } from '../../characters/character-avatar/character-avatar';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { buildRosterRows, type RosterRow } from '../roster-row.util';

/**
 * Panneau permanent (desktop ≥1024px) listant la troupe d'une Partie — remplace
 * l'ancien onglet "Personnages". Replié par défaut (avatars seuls), se déplie via
 * un bouton dédié (jamais au survol). Cf. EXPERIENCE.md §2/§7, DESIGN.md §7 RosterRail.
 */
@Component({
  selector: 'app-roster-rail',
  standalone: true,
  imports: [CharacterAvatar],
  templateUrl: './roster-rail.html',
  styleUrl: './roster-rail.scss',
})
export class RosterRail {
  protected readonly theme = inject(ThemeToneService);

  readonly members = input.required<PartieMemberDto[]>();
  readonly characters = input.required<CharacterDto[]>();
  readonly mjId = input.required<string>();
  readonly hasFreeSlot = input.required<boolean>();
  readonly classLabelFor = input.required<(c: CharacterDto) => string>();

  readonly selectCharacter = output<{ characterId: string }>();
  readonly openInvitations = output<void>();

  protected readonly expanded = signal(false);

  protected readonly rows = computed<RosterRow[]>(() =>
    buildRosterRows(this.members(), this.characters(), this.mjId(), this.classLabelFor()),
  );

  protected toggle(): void {
    this.expanded.update((v) => !v);
  }

  protected selectRow(row: RosterRow): void {
    if (row.character) this.selectCharacter.emit({ characterId: row.character.id });
  }
}
