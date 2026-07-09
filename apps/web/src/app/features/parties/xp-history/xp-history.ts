import { Component, computed, inject, input } from '@angular/core';
import { DatePipe } from '@angular/common';
import type { CharacterDto, XpDistributionDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { characterName } from '../../../core/characters/character.util';

interface DistributionRow {
  distribution: XpDistributionDto;
  total: number;
  entries: { label: string; amount: number; isBonus: boolean }[];
}

@Component({
  selector: 'app-xp-history',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './xp-history.html',
  styleUrl: './xp-history.scss',
})
export class XpHistory {
  protected readonly theme = inject(ThemeToneService);

  readonly distributions = input.required<XpDistributionDto[]>();
  /** Résolution du nom affiché par personnage (`characterId` → nom narratif ou pseudo du propriétaire) —
   *  `CharacterDto.ownerPseudo` est déjà résolu serveur, pas besoin de repasser par `PartieMemberDto`. */
  readonly characters = input.required<CharacterDto[]>();

  private readonly characterById = computed(() => new Map(this.characters().map((c) => [c.id, c])));

  /** Déjà triées par le backend (`createdAt desc`) — pas de re-tri côté client. */
  protected readonly rows = computed<DistributionRow[]>(() =>
    this.distributions().map((d) => ({
      distribution: d,
      total: d.entries.reduce((sum, e) => sum + e.amount, 0),
      entries: d.entries.map((e) => ({
        label: this.labelForCharacter(e.characterId),
        amount: e.amount,
        isBonus: e.isBonus,
      })),
    })),
  );

  private labelForCharacter(characterId: string): string {
    const character = this.characterById().get(characterId);
    if (!character) return 'Personnage inconnu';
    const name = characterName(character);
    return name === 'Personnage sans nom' ? character.ownerPseudo : name;
  }
}
