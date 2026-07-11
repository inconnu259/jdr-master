import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { CharacterDto } from '@master-jdr/shared';
import { CharacterService } from '../../../../core/characters/character.service';
import { ThemeToneService } from '../../../../core/theme/theme-tone.service';
import { EncumbranceBar } from './encumbrance-bar';
import { InventoryItemRow, type InventoryItemView } from './inventory-item-row';

@Component({
  selector: 'app-inventory-tab',
  standalone: true,
  imports: [MatButtonModule, EncumbranceBar, InventoryItemRow],
  templateUrl: './inventory-tab.html',
  styleUrl: './inventory-tab.scss',
})
export class InventoryTab {
  private readonly characterSvc = inject(CharacterService);
  protected readonly theme = inject(ThemeToneService);

  readonly character = input.required<CharacterDto>();
  readonly isOwner = input.required<boolean>();
  readonly viewerIsMj = input(false);
  readonly characterUpdated = output<CharacterDto>();

  /** `equipment.individual` n'est pas exposé par `CharacterDto` (type `SheetData` générique côté
   *  `packages/shared`) — même stratégie de cast que `capability-label.util.ts` pour `levelUps`. */
  protected readonly individual = computed<InventoryItemView[]>(
    () =>
      ((this.character().sheetData as any)?.equipment?.individual as
        | InventoryItemView[]
        | undefined) ?? [],
  );

  protected readonly totalWeight = computed(() =>
    this.individual().reduce((sum, item) => sum + item.weight, 0),
  );

  protected readonly newItemName = signal('');
  protected readonly newItemWeight = signal<number | undefined>(undefined);

  protected readonly editingId = signal<string | null>(null);
  protected readonly editName = signal('');
  protected readonly editWeight = signal<number | undefined>(undefined);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);

  protected async submitAdd(): Promise<void> {
    const name = this.newItemName().trim();
    if (!name || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const weight = this.newItemWeight();
      const updated = await this.characterSvc.addInventoryItem(this.character().id, {
        name,
        ...(weight !== undefined && weight !== null ? { weight } : {}),
      });
      this.characterUpdated.emit(updated);
      this.newItemName.set('');
      this.newItemWeight.set(undefined);
    } catch {
      this.error.set(this.theme.tone()['evolution.inventory_error']);
    } finally {
      this.submitting.set(false);
    }
  }

  protected startEdit(item: InventoryItemView): void {
    this.editingId.set(item.id);
    this.editName.set(item.name);
    this.editWeight.set(item.weight);
  }

  protected cancelEdit(): void {
    this.editingId.set(null);
  }

  /**
   * Normalise le contenu brut d'un `<input type="number">` : une valeur vide donne
   * `valueAsNumber = NaN`, jamais capturé par `?? 0` (revue de code — vider le champ pour
   * remettre le poids à 0 était silencieusement ignoré, l'ancien poids était conservé).
   */
  protected onEditWeightInput(value: number): void {
    this.editWeight.set(Number.isNaN(value) ? 0 : value);
  }

  protected async submitEdit(itemId: string): Promise<void> {
    const name = this.editName().trim();
    if (!name || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const updated = await this.characterSvc.updateInventoryItem(this.character().id, itemId, {
        name,
        weight: this.editWeight() ?? 0,
      });
      this.characterUpdated.emit(updated);
      this.editingId.set(null);
    } catch {
      this.error.set(this.theme.tone()['evolution.inventory_error']);
    } finally {
      this.submitting.set(false);
    }
  }

  /** Édition MJ d'une ligne existante (Story 6.6, AD-6) — via `sheet-field`, pas `updateInventoryItem` (propriétaire seul).
   *  Envoie `id: itemId` pour que le serveur revérifie que l'objet à cet index est toujours celui visé
   *  (revue de code — un index calculé côté client peut être obsolète si le tableau a changé entretemps). */
  protected async submitMjEdit(itemId: string): Promise<void> {
    const name = this.editName().trim();
    if (!name || this.submitting()) return;
    const index = this.individual().findIndex((i) => i.id === itemId);
    if (index === -1) {
      this.error.set(this.theme.tone()['evolution.inventory_error']);
      this.editingId.set(null);
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    try {
      const result = await this.characterSvc.setSheetField(
        this.character().id,
        `equipment.individual.${index}`,
        { name, weight: this.editWeight() ?? 0, id: itemId },
      );
      this.characterUpdated.emit(result.character);
      this.editingId.set(null);
    } catch {
      this.error.set(this.theme.tone()['evolution.inventory_error']);
    } finally {
      this.submitting.set(false);
    }
  }

  /** Ajout MJ d'un nouvel objet (Story 6.6, UJ Sylas — objet narratif reçu hors-jeu). */
  protected async submitMjAdd(): Promise<void> {
    const name = this.newItemName().trim();
    if (!name || this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const result = await this.characterSvc.setSheetField(
        this.character().id,
        `equipment.individual.${this.individual().length}`,
        { name, weight: this.newItemWeight() ?? 0 },
      );
      this.characterUpdated.emit(result.character);
      this.newItemName.set('');
      this.newItemWeight.set(undefined);
    } catch {
      this.error.set(this.theme.tone()['evolution.inventory_error']);
    } finally {
      this.submitting.set(false);
    }
  }

  protected async removeItem(itemId: string): Promise<void> {
    if (this.submitting()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const updated = await this.characterSvc.removeInventoryItem(this.character().id, itemId);
      this.characterUpdated.emit(updated);
    } catch {
      this.error.set(this.theme.tone()['evolution.inventory_error']);
    } finally {
      this.submitting.set(false);
    }
  }
}
