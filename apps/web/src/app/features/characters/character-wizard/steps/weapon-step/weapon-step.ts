import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import type { ContentEntryDto } from '@master-jdr/shared';
import {
  resolveWeaponCategory,
  type WeaponCategoryEntry,
  type WeaponItemEntry,
  type WeaponItemContentData,
  type WeaponCategoryContentData,
} from '@master-jdr/game-rules';
import { ChoiceCard, type ChoiceCardOption } from '../../choice-card/choice-card';
import { RadioGroupNavDirective } from '../../choice-card/radio-group-nav.directive';

/** `WeaponCategoryContentData` + `description` (seedée Story 23.1, affichée sous la sélection). */
type WeaponCategoryData = WeaponCategoryContentData & { description: string };
type WeaponItemData = WeaponItemContentData;

/** Catégorie sans arme précise à choisir : sélectionner la catégorie sélectionne directement
 * l'unique weaponItem qui lui est rattaché (aucune étape 2). */
const NO_ITEM_CHOICE_CATEGORY = 'mains-nues';

@Component({
  selector: 'app-weapon-step',
  standalone: true,
  imports: [ChoiceCard, RadioGroupNavDirective],
  templateUrl: './weapon-step.html',
  styleUrl: './weapon-step.scss',
})
export class WeaponStep {
  readonly weaponItems = input.required<ContentEntryDto[]>();
  readonly weaponCategories = input.required<ContentEntryDto[]>();
  readonly weaponId = input<string | undefined>();

  readonly weaponIdChange = output<string | null>();

  /** Catégorie choisie à l'étape 1 — `null` tant qu'aucune des catégories n'est sélectionnée. */
  protected readonly selectedCategoryKey = signal<string | null>(null);

  private readonly weaponItemEntries = computed<WeaponItemEntry[]>(() =>
    this.weaponItems().map((entry) => ({ key: entry.key, ...(entry.data as WeaponItemData) })),
  );

  private readonly weaponCategoryEntries = computed<WeaponCategoryEntry[]>(() =>
    this.weaponCategories().map((entry) => ({
      key: entry.key,
      ...(entry.data as WeaponCategoryData),
    })),
  );

  protected readonly categoryOptions = computed<ChoiceCardOption[]>(() =>
    this.weaponCategories().map((entry) => {
      const data = entry.data as WeaponCategoryData;
      return {
        key: entry.key,
        label: data.label,
        detail: `Toucher ${data.touchFormula}, Dégâts ${data.damageFormula}`,
      };
    }),
  );

  /** Armes précises de la catégorie sélectionnée — vide si aucune catégorie choisie ou si la
   * catégorie n'a pas d'arme précise à choisir (Mains nues). */
  protected readonly itemOptions = computed<ChoiceCardOption[]>(() => {
    const categoryKey = this.selectedCategoryKey();
    if (!categoryKey || categoryKey === NO_ITEM_CHOICE_CATEGORY) return [];
    return this.weaponItems()
      .filter((entry) => (entry.data as WeaponItemData).categoryId === categoryKey)
      .map((entry) => ({ key: entry.key, label: (entry.data as WeaponItemData).label }));
  });

  protected readonly selectedCategoryData = computed<WeaponCategoryData | null>(() => {
    const entry = this.weaponCategories().find((c) => c.key === this.selectedCategoryKey());
    return entry ? (entry.data as WeaponCategoryData) : null;
  });

  protected readonly resolvedWeapon = computed(() => {
    const id = this.weaponId();
    if (!id) return null;
    return resolveWeaponCategory(id, {
      weaponItems: this.weaponItemEntries(),
      weaponCategories: this.weaponCategoryEntries(),
    });
  });

  private hasSyncedFromInput = false;

  constructor() {
    // Resynchronise la catégorie sélectionnée depuis `weaponId()` (retour en arrière sur l'étape,
    // composant recréé) : retrouve la catégorie de l'arme déjà choisie pour réafficher la bonne
    // étape 2. Ne s'exécute qu'une fois par instance, comme AttributesStep (Story 24.1).
    effect(() => {
      const id = this.weaponId();
      const items = this.weaponItemEntries();
      untracked(() => {
        if (this.hasSyncedFromInput) return;
        if (items.length === 0) return;
        this.hasSyncedFromInput = true;
        if (!id) return;
        const item = items.find((w) => w.key === id);
        if (item) this.selectedCategoryKey.set(item.categoryId);
      });
    });
  }

  /** Choisir une catégorie différente invalide l'arme précédemment choisie (elle appartenait à
   * une autre catégorie). Recliquer sur la catégorie déjà sélectionnée est un no-op. Mains nues
   * n'a pas d'arme précise à choisir : la sélectionner assigne directement son unique weaponItem. */
  protected selectCategory(categoryKey: string): void {
    if (this.selectedCategoryKey() === categoryKey) return;
    this.selectedCategoryKey.set(categoryKey);
    if (categoryKey === NO_ITEM_CHOICE_CATEGORY) {
      const item = this.weaponItems().find(
        (entry) => (entry.data as WeaponItemData).categoryId === categoryKey,
      );
      this.weaponIdChange.emit(item?.key ?? null);
      return;
    }
    this.weaponIdChange.emit(null);
  }

  protected selectItem(itemKey: string): void {
    this.weaponIdChange.emit(itemKey);
  }
}
