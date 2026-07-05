import { Component, computed, input, output } from '@angular/core';
import type { ContentEntryDto } from '@master-jdr/shared';
import { ChoiceCard, type ChoiceCardOption } from '../../choice-card/choice-card';
import { RadioGroupNavDirective } from '../../choice-card/radio-group-nav.directive';

interface WeaponData {
  label: string;
  touchFormula: string;
  damageFormula: string;
}

@Component({
  selector: 'app-weapon-step',
  standalone: true,
  imports: [ChoiceCard, RadioGroupNavDirective],
  templateUrl: './weapon-step.html',
  styleUrl: './weapon-step.scss',
})
export class WeaponStep {
  readonly weapons = input.required<ContentEntryDto[]>();
  readonly weaponCategoryId = input<string | undefined>();

  readonly weaponCategoryIdChange = output<string>();

  protected readonly options = computed<ChoiceCardOption[]>(() =>
    this.weapons().map((entry) => {
      const data = entry.data as WeaponData;
      return {
        key: entry.key,
        label: data.label,
        detail: `Toucher ${data.touchFormula}, Dégâts ${data.damageFormula}`,
      };
    }),
  );

  protected readonly selectedWeaponData = computed<WeaponData | null>(() => {
    const entry = this.weapons().find((w) => w.key === this.weaponCategoryId());
    return entry ? (entry.data as WeaponData) : null;
  });

  protected onSelect(key: string): void {
    this.weaponCategoryIdChange.emit(key);
  }
}
