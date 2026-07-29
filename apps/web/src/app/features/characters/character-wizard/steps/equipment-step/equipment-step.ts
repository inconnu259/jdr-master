import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import type { ContentEntryDto } from '@master-jdr/shared';

interface EquipmentItemEntry {
  key: string;
  label: string;
  priceGold: number;
  nature: 'individual' | 'contenant' | 'animal';
  weight?: number;
  effect?: string;
}

interface EquipmentPackageEntry {
  key: string;
  label: string;
  priceGold: number;
  items: { itemKey: string; quantity: number }[];
}

export type StartingEquipmentSelection = { key: string; quantity: number }[];

/** Budget de départ (AC3, Story 26.1) — jamais dépassé côté serveur (`CharacterService.create()`),
 *  reflété ici uniquement pour l'affichage/le blocage de progression côté wizard. */
export const STARTING_BUDGET_GOLD = 1000;

@Component({
  selector: 'app-equipment-step',
  standalone: true,
  templateUrl: './equipment-step.html',
  styleUrl: './equipment-step.scss',
})
export class EquipmentStep {
  readonly equipmentItems = input.required<ContentEntryDto[]>();
  readonly equipmentPackages = input.required<ContentEntryDto[]>();
  readonly selection = input<StartingEquipmentSelection>([]);

  readonly selectionChange = output<StartingEquipmentSelection>();

  protected readonly mode = signal<'kit' | 'shopping'>('kit');
  protected readonly budgetGold = STARTING_BUDGET_GOLD;

  protected readonly itemEntries = computed<EquipmentItemEntry[]>(() =>
    this.equipmentItems().map((entry) => ({
      key: entry.key,
      ...(entry.data as Omit<EquipmentItemEntry, 'key'>),
    })),
  );

  protected readonly packageEntries = computed<EquipmentPackageEntry[]>(() =>
    this.equipmentPackages().map((entry) => ({
      key: entry.key,
      ...(entry.data as Omit<EquipmentPackageEntry, 'key'>),
    })),
  );

  /** Fusion des 2 nécessaires (toujours proposés ensemble, aucune AC ne demande de choisir entre
   *  les 2) en une seule sélection `{key,quantity}[]` — quantités agrégées si une clé apparaît
   *  dans les deux (aucun cas réel aujourd'hui, mais garde le code correct). */
  private kitSelection(): StartingEquipmentSelection {
    const merged = new Map<string, number>();
    for (const pkg of this.packageEntries()) {
      for (const item of pkg.items) {
        merged.set(item.itemKey, (merged.get(item.itemKey) ?? 0) + item.quantity);
      }
    }
    return [...merged.entries()].map(([key, quantity]) => ({ key, quantity }));
  }

  /** Lignes du panier résolues (nom/prix/poids) pour l'affichage — clés absentes du catalogue
   *  silencieusement ignorées (contenu pas encore chargé), jamais une erreur d'affichage. */
  protected readonly selectedLines = computed(() =>
    this.selection()
      .map((s) => {
        const entry = this.itemEntries().find((e) => e.key === s.key);
        return entry ? { key: s.key, quantity: s.quantity, entry } : null;
      })
      .filter((line): line is { key: string; quantity: number; entry: EquipmentItemEntry } => line !== null),
  );

  protected readonly totalSpent = computed(() =>
    this.selectedLines().reduce((sum, line) => sum + line.entry.priceGold * line.quantity, 0),
  );

  protected readonly remaining = computed(() => STARTING_BUDGET_GOLD - this.totalSpent());

  protected readonly overBudget = computed(() => this.totalSpent() > STARTING_BUDGET_GOLD);

  private hasSyncedFromInput = false;

  constructor() {
    // Resynchronise le mode affiché depuis `selection()` (retour en arrière sur l'étape) — même
    // pattern que WeaponStep (Story 25.1/25.2) : ne s'exécute qu'une fois par instance.
    effect(() => {
      const selection = this.selection();
      const packages = this.packageEntries();
      untracked(() => {
        if (this.hasSyncedFromInput) return;
        if (packages.length === 0) return;
        this.hasSyncedFromInput = true;
        if (selection.length === 0) return;
        const kit = this.kitSelection();
        const isKit =
          selection.length === kit.length &&
          selection.every((s) => kit.some((k) => k.key === s.key && k.quantity === s.quantity));
        this.mode.set(isKit ? 'kit' : 'shopping');
      });
    });
  }

  protected selectMode(mode: 'kit' | 'shopping'): void {
    if (this.mode() === mode) return;
    this.mode.set(mode);
    this.selectionChange.emit(mode === 'kit' ? this.kitSelection() : []);
  }

  protected addItem(key: string): void {
    const current = this.selection();
    const existing = current.find((s) => s.key === key);
    const next = existing
      ? current.map((s) => (s.key === key ? { ...s, quantity: s.quantity + 1 } : s))
      : [...current, { key, quantity: 1 }];
    this.selectionChange.emit(next);
  }

  /** Résolution nom affiché pour une ligne de nécessaire pré-fait (mode `'kit'`, lecture seule). */
  protected labelFor(key: string): string {
    return this.itemEntries().find((e) => e.key === key)?.label ?? key;
  }

  protected removeItem(key: string): void {
    const next = this.selection()
      .map((s) => (s.key === key ? { ...s, quantity: s.quantity - 1 } : s))
      .filter((s) => s.quantity > 0);
    this.selectionChange.emit(next);
  }
}
