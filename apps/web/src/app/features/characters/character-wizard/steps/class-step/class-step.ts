import { Component, computed, inject, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { ContentEntryDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../../../core/theme/theme-tone.service';
import { ChoiceCard, type ChoiceCardOption } from '../../choice-card/choice-card';
import { RadioGroupNavDirective } from '../../choice-card/radio-group-nav.directive';

interface ClassTalent {
  name: string;
  effect: string;
}

interface ClassData {
  label: string;
  talents: ClassTalent[];
  requiresSpecialty?: boolean;
  specialtyLabel?: string;
}

@Component({
  selector: 'app-class-step',
  standalone: true,
  imports: [FormsModule, ChoiceCard, RadioGroupNavDirective],
  templateUrl: './class-step.html',
  styleUrl: './class-step.scss',
})
export class ClassStep {
  readonly classes = input.required<ContentEntryDto[]>();
  readonly classId = input<string | undefined>();
  readonly specialtyTypeId = input<string | undefined>();

  readonly classIdChange = output<string>();
  readonly specialtyTypeIdChange = output<string>();

  protected readonly theme = inject(ThemeToneService);

  protected readonly options = computed<ChoiceCardOption[]>(() =>
    this.classes().map((entry) => {
      const data = entry.data as ClassData;
      return {
        key: entry.key,
        label: data.label,
        detail: data.talents.map((t) => t.name).join(', '),
      };
    }),
  );

  protected readonly selectedClassData = computed<ClassData | null>(() => {
    const entry = this.classes().find((c) => c.key === this.classId());
    return entry ? (entry.data as ClassData) : null;
  });

  protected readonly isArtisan = computed(() => this.classId() === 'artisan');

  protected onSelect(key: string): void {
    this.classIdChange.emit(key);
  }

  protected onSpecialtyInput(value: string): void {
    this.specialtyTypeIdChange.emit(value);
  }
}
