import { Component, computed, inject, input, output } from '@angular/core';
import type { ContentEntryDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../../../core/theme/theme-tone.service';
import { DetailSurface } from '../../../../../shared/detail-surface/detail-surface';
import {
  createDetailSurfaceHost,
  detailContent,
} from '../../../../../shared/detail-surface/detail-surface-host';
import { ChoiceCard, type ChoiceCardOption } from '../../choice-card/choice-card';
import { RadioGroupNavDirective } from '../../choice-card/radio-group-nav.directive';

interface TypeAdvantage {
  name: string;
  effect: string;
}

interface TypeData {
  label: string;
  description: string;
  advantages: TypeAdvantage[];
}

@Component({
  selector: 'app-type-step',
  standalone: true,
  imports: [ChoiceCard, RadioGroupNavDirective, DetailSurface],
  templateUrl: './type-step.html',
  styleUrl: './type-step.scss',
})
export class TypeStep {
  readonly types = input.required<ContentEntryDto[]>();
  readonly typeId = input<string | undefined>();

  readonly typeIdChange = output<string>();

  protected readonly theme = inject(ThemeToneService);

  /** Aide contextuelle sur les termes de règle (FR-19) — même surface partagée que la fiche. */
  protected readonly detail = createDetailSurfaceHost();
  /** Règle AC3 : pas de texte au catalogue ⇒ pas de déclencheur. */
  protected readonly help = detailContent;

  protected readonly options = computed<ChoiceCardOption[]>(() =>
    this.types().map((entry) => {
      const data = entry.data as TypeData;
      return {
        key: entry.key,
        label: data.label,
        detail: data.advantages.map((a) => a.name).join(', '),
      };
    }),
  );

  protected readonly selectedTypeData = computed<TypeData | null>(() => {
    const entry = this.types().find((t) => t.key === this.typeId());
    return entry ? (entry.data as TypeData) : null;
  });

  protected onSelect(key: string): void {
    this.typeIdChange.emit(key);
  }
}
