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

  /** Garantit que la resynchronisation depuis `attributes()` ne se fait qu'une seule fois par
   * instance — sinon nos propres émissions (ex. désélection d'un chip → `null` renvoyé au parent
   * → réinjecté ici en entrée) déclencheraient une réinitialisation destructrice de tout l'état
   * local, écrasant les autres attributs déjà assignés. */
  private hasSyncedFromInput = false;

  constructor() {
    // Resynchronise l'assignation locale sur `attributes()` : reconstruit les index de chips
    // sélectionnés si le parent fournit des attributs déjà assignés (ex. retour en arrière sur
    // cette étape, le composant étant recréé par le `@switch` du conteneur). Ne s'exécute qu'une
    // fois par instance (cf. `hasSyncedFromInput`) : au-delà, l'état local est la seule source de
    // vérité tant que ce composant vit.
    effect(() => {
      const incoming = this.attributes();
      untracked(() => {
        if (this.hasSyncedFromInput) return;
        this.hasSyncedFromInput = true;
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

    // Recliquer sur le chip déjà sélectionné pour cet attribut le désélectionne (bouton bascule) :
    // libère la valeur pour les autres attributs et redevient incomplet (next désactivé).
    if (this.isChipSelected(attr, chipIndex)) {
      const rest = { ...this.assignment() };
      delete rest[attr];
      this.assignment.set(rest);
      this.emitIfComplete(rest);
      return;
    }

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
