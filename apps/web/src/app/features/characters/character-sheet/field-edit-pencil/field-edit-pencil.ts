import { Component, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';

export interface FieldEditPencilOption {
  key: string;
  label: string;
}

let nextDatalistId = 0;

@Component({
  selector: 'app-field-edit-pencil',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './field-edit-pencil.html',
  styleUrl: './field-edit-pencil.scss',
})
export class FieldEditPencil {
  /** Nom du champ pour l'aria-label ("Modifier [label]") — DESIGN.md/EXPERIENCE.md §8. */
  readonly label = input.required<string>();
  readonly value = input.required<string | number>();
  readonly type = input<'text' | 'number'>('text');
  /** Suggestions catalogue optionnelles (ex. armes seedées) — combobox, jamais un select strict (AC7 Story 6.7). */
  readonly options = input<FieldEditPencilOption[]>([]);
  readonly confirm = output<string | number>();

  protected readonly datalistId = `field-edit-pencil-datalist-${nextDatalistId++}`;

  protected readonly editing = signal(false);
  protected readonly draft = signal<string | number>('');

  protected startEdit(): void {
    this.draft.set(this.value());
    this.editing.set(true);
  }

  protected cancel(): void {
    this.editing.set(false);
  }

  protected onInput(raw: string): void {
    if (this.type() === 'number') {
      // `Number('')` vaut 0, pas NaN — un champ vidé doit bloquer la soumission, pas soumettre
      // silencieusement 0 (revue de code, même classe de bug déjà corrigée pour le poids d'inventaire).
      this.draft.set(raw.trim() === '' ? NaN : Number(raw));
    } else {
      this.draft.set(raw);
    }
  }

  protected submit(): void {
    const value = this.draft();
    if (typeof value === 'number' && Number.isNaN(value)) return;
    this.editing.set(false);
    this.confirm.emit(value);
  }
}
