import { Component, computed, inject, input, output } from '@angular/core';
import type { CharacterDto, PartieMemberDto } from '@master-jdr/shared';
import { CharacterAvatar } from '../../characters/character-avatar/character-avatar';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { buildRosterRows, type RosterRow } from '../roster-row.util';

/**
 * Bandeau horizontal scrollable (mobile <768px, MJ uniquement) listant la troupe —
 * pendant mobile de `RosterRail`. Cf. EXPERIENCE.md §2, DESIGN.md §7 RosterStrip.
 */
@Component({
  selector: 'app-roster-strip',
  standalone: true,
  imports: [CharacterAvatar],
  templateUrl: './roster-strip.html',
  styleUrl: './roster-strip.scss',
})
export class RosterStrip {
  protected readonly theme = inject(ThemeToneService);

  readonly members = input.required<PartieMemberDto[]>();
  readonly characters = input.required<CharacterDto[]>();
  readonly mjId = input.required<string>();
  readonly hasFreeSlot = input.required<boolean>();
  readonly classLabelFor = input.required<(c: CharacterDto) => string>();

  readonly selectCharacter = output<{ characterId: string }>();
  readonly openInvitations = output<void>();

  protected readonly rows = computed<RosterRow[]>(() =>
    buildRosterRows(this.members(), this.characters(), this.mjId(), this.classLabelFor(), this.mjId()),
  );

  protected selectRow(row: RosterRow): void {
    if (row.character) this.selectCharacter.emit({ characterId: row.character.id });
  }
}
