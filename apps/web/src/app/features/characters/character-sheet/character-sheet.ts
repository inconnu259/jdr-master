import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ActivatedRoute } from '@angular/router';
import type { CharacterDto, GameSystemContentDto } from '@master-jdr/shared';
import { CharacterService } from '../../../core/characters/character.service';
import { characterName, findContentEntry } from '../../../core/characters/character.util';
import { CharacterAvatar } from '../character-avatar/character-avatar';

const RYUUTAMA_ID = 'ryuutama';

interface ClassData {
  label: string;
  talents: { name: string; effect: string }[];
}

interface TypeData {
  label: string;
  advantages: { name: string; effect: string }[];
}

interface WeaponData {
  label: string;
  touchFormula: string;
  damageFormula: string;
}

interface AttributePatternData {
  label: string;
  values: number[];
}

interface NarrativeFields {
  sex?: string;
  age?: string;
  physicalTraits?: string;
  homeTown?: string;
  motivation?: string;
  personality?: string;
}

@Component({
  selector: 'app-character-sheet',
  standalone: true,
  imports: [CharacterAvatar],
  templateUrl: './character-sheet.html',
  styleUrl: './character-sheet.scss',
})
export class CharacterSheet implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly characterSvc = inject(CharacterService);

  protected readonly character = signal<CharacterDto | null>(null);
  protected readonly content = signal<GameSystemContentDto | null>(null);
  protected readonly loadError = signal<string | null>(null);

  protected readonly sheetData = computed(
    () => (this.character()?.sheetData ?? {}) as Record<string, unknown>,
  );
  protected readonly name = computed(() => {
    const c = this.character();
    return c ? characterName(c) : '';
  });

  protected readonly classData = computed<ClassData | null>(() =>
    findContentEntry<ClassData>(
      this.content(),
      'class',
      this.sheetData()['classId'] as string | undefined,
    ),
  );

  protected readonly typeData = computed<TypeData | null>(() =>
    findContentEntry<TypeData>(
      this.content(),
      'type',
      this.sheetData()['typeId'] as string | undefined,
    ),
  );

  protected readonly weaponData = computed<WeaponData | null>(() =>
    findContentEntry<WeaponData>(
      this.content(),
      'weaponCategory',
      this.sheetData()['weaponCategoryId'] as string | undefined,
    ),
  );

  /** Spécialité texte libre de la classe Artisan (seule classe l'exigeant), sinon `undefined`. */
  protected readonly specialtyTypeId = computed<string | undefined>(
    () => this.sheetData()['specialtyTypeId'] as string | undefined,
  );

  protected readonly attributes = computed<{
    AGI: number;
    ESP: number;
    INT: number;
    VIG: number;
  } | null>(
    () =>
      (this.sheetData()['attributes'] as { AGI: number; ESP: number; INT: number; VIG: number }) ??
      null,
  );

  /** Nom du pattern d'attributs dont les valeurs (triées) correspondent à celles du personnage. */
  protected readonly attributePatternLabel = computed<string | null>(() => {
    const attrs = this.attributes();
    if (!attrs) return null;
    const sortedOwn = [attrs.AGI, attrs.ESP, attrs.INT, attrs.VIG].sort((a, b) => a - b);
    const patterns = this.content()?.['attributePattern'] ?? [];
    for (const p of patterns) {
      const data = p.data as AttributePatternData;
      const sortedPattern = [...data.values].sort((a, b) => a - b);
      if (
        sortedPattern.length === sortedOwn.length &&
        sortedPattern.every((v, i) => v === sortedOwn[i])
      ) {
        return data.label;
      }
    }
    return null;
  });

  protected readonly equipment = computed<{ individual: string[]; group: string[] } | null>(
    () => (this.sheetData()['equipment'] as { individual: string[]; group: string[] }) ?? null,
  );

  protected readonly fetiqueObject = computed<string | undefined>(
    () => this.sheetData()['fetiqueObject'] as string | undefined,
  );

  protected readonly narrative = computed<NarrativeFields>(
    () => (this.sheetData()['narrative'] as NarrativeFields) ?? {},
  );

  async ngOnInit(): Promise<void> {
    const characterId = this.route.snapshot.paramMap.get('characterId');
    if (!characterId) {
      this.loadError.set('Fiche introuvable.');
      return;
    }
    try {
      this.character.set(await this.characterSvc.get(characterId));
    } catch (err) {
      if (err instanceof HttpErrorResponse && err.status === 403) {
        this.loadError.set("Vous n'avez pas accès à cette fiche.");
      } else {
        this.loadError.set('Impossible de charger la fiche de personnage. Réessayez.');
      }
      return;
    }
    try {
      this.content.set(await this.characterSvc.getGameSystemContent(RYUUTAMA_ID));
    } catch {
      // Contenu non critique pour l'affichage : la fiche reste consultable, seuls les
      // labels/talents/avantages résolus resteront vides.
    }
  }
}
