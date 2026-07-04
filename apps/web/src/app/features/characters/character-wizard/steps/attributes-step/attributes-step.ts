import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import type { ContentEntryDto } from '@master-jdr/shared';

type AttrKey = 'AGI' | 'ESP' | 'INT' | 'VIG';

interface AttributePatternData {
  label: string;
  values: number[];
}

const ATTR_KEYS: AttrKey[] = ['AGI', 'ESP', 'INT', 'VIG'];
const ATTR_LABELS: Record<AttrKey, string> = {
  AGI: 'Agilité',
  ESP: 'Esprit',
  INT: 'Intelligence',
  VIG: 'Vigueur',
};

@Component({
  selector: 'app-attributes-step',
  standalone: true,
  templateUrl: './attributes-step.html',
  styleUrl: './attributes-step.scss',
})
export class AttributesStep {
  readonly pattern = input.required<ContentEntryDto>();
  readonly attributes = input<Partial<Record<AttrKey, number>> | undefined>();

  readonly attributesChange = output<Record<AttrKey, number> | null>();

  protected readonly ATTR_KEYS = ATTR_KEYS;
  protected readonly ATTR_LABELS = ATTR_LABELS;

  protected readonly patternData = computed(() => this.pattern().data as AttributePatternData);
  protected readonly values = computed(() => this.patternData().values);

  /** Assignation courante : attribut -> index (dans `values()`) du chip qui lui est affecté. */
  protected readonly assignment = signal<Partial<Record<AttrKey, number>>>({});

  constructor() {
    // Resynchronise l'assignation locale sur `attributes()` : reconstruit les index de chips
    // sélectionnés si le parent fournit des attributs déjà assignés (ex. retour en arrière sur
    // cette étape, le composant étant recréé par le `@switch` du conteneur), ou réinitialise si
    // le parent efface les attributs.
    effect(() => {
      const incoming = this.attributes();
      untracked(() => {
        if (!incoming) {
          this.assignment.set({});
          return;
        }
        const values = this.values();
        const usedIndices = new Set<number>();
        const reconstructed: Partial<Record<AttrKey, number>> = {};
        for (const attr of ATTR_KEYS) {
          const attrValue = incoming[attr];
          if (attrValue === undefined) continue;
          const idx = values.findIndex((v, i) => v === attrValue && !usedIndices.has(i));
          if (idx >= 0) {
            reconstructed[attr] = idx;
            usedIndices.add(idx);
          }
        }
        this.assignment.set(reconstructed);
      });
    });
  }

  protected isChipUsedElsewhere(attr: AttrKey, chipIndex: number): boolean {
    return Object.entries(this.assignment()).some(([a, idx]) => a !== attr && idx === chipIndex);
  }

  protected isChipSelected(attr: AttrKey, chipIndex: number): boolean {
    return this.assignment()[attr] === chipIndex;
  }

  protected selectChip(attr: AttrKey, chipIndex: number): void {
    if (this.isChipUsedElsewhere(attr, chipIndex)) return;
    const next = { ...this.assignment(), [attr]: chipIndex };
    this.assignment.set(next);
    this.emitIfComplete(next);
  }

  private emitIfComplete(next: Partial<Record<AttrKey, number>>): void {
    const complete = ATTR_KEYS.every((k) => next[k] !== undefined);
    if (!complete) {
      this.attributesChange.emit(null);
      return;
    }
    const values = this.values();
    this.attributesChange.emit({
      AGI: values[next.AGI!],
      ESP: values[next.ESP!],
      INT: values[next.INT!],
      VIG: values[next.VIG!],
    });
  }
}
