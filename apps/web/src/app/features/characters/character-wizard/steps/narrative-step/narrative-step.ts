import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

export interface NarrativeFields {
  sex?: string;
  age?: string;
  physicalTraits?: string;
  homeTown?: string;
  motivation?: string;
  name?: string;
  personality?: string;
}

@Component({
  selector: 'app-narrative-step',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './narrative-step.html',
  styleUrl: './narrative-step.scss',
})
export class NarrativeStep {
  readonly narrative = input<NarrativeFields | undefined>();
  readonly narrativeChange = output<NarrativeFields>();

  protected readonly SEX_OPTIONS = ['Homme', 'Femme', 'Autre'];

  protected update(field: keyof NarrativeFields, value: string | number): void {
    if (field === 'age') {
      if (value !== '' && (Number.isNaN(Number(value)) || Number(value) < 0)) return;
      // L'input `type="number"` fait remonter un `number` via NgModel — `NarrativeFields.age`
      // reste une string (cf. RyuutamaSheetData) pour rester cohérent avec le contrat partagé.
      value = value === '' ? '' : String(value);
    }
    this.narrativeChange.emit({ ...this.narrative(), [field]: value });
  }
}
