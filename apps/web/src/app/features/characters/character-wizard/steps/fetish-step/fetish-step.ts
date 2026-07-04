import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-fetish-step',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './fetish-step.html',
  styleUrl: './fetish-step.scss',
})
export class FetishStep {
  readonly fetiqueObject = input<string | undefined>();
  readonly fetiqueObjectChange = output<string>();
}
