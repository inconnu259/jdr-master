import { Component, input } from '@angular/core';

export const FIXED_EQUIPMENT = {
  individual: ['Grand sac à dos', 'Sac de couchage', 'Couverts', 'Outre', '2 rations'],
  group: [
    'Animal de bât',
    'Tonneau',
    'Caisse',
    'Nécessaire de cuisine',
    '3 torches',
    'Briquet',
    'Savon',
    'Nécessaire à lessive',
    'Tente',
  ],
};

@Component({
  selector: 'app-equipment-step',
  standalone: true,
  templateUrl: './equipment-step.html',
  styleUrl: './equipment-step.scss',
})
export class EquipmentStep {
  readonly individual = input<string[]>(FIXED_EQUIPMENT.individual);
  readonly group = input<string[]>(FIXED_EQUIPMENT.group);
}
