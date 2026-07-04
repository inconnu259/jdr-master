import { Component, input, output } from '@angular/core';

export interface ChoiceCardOption {
  key: string;
  label: string;
  detail?: string;
}

@Component({
  selector: 'app-choice-card',
  standalone: true,
  templateUrl: './choice-card.html',
  styleUrl: './choice-card.scss',
})
export class ChoiceCard {
  readonly option = input.required<ChoiceCardOption>();
  readonly selected = input<boolean>(false);

  readonly selectedOption = output<string>();

  protected onClick(): void {
    this.selectedOption.emit(this.option().key);
  }
}
