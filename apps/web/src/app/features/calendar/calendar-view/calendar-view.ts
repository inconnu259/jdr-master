import { Component, OnInit, inject, input, signal } from '@angular/core';
import type { AvailabilityDeclarationDto } from '@master-jdr/shared';
import { AvailabilityService } from '../../../core/availability/availability.service';
import { CalendarMonthView } from '../calendar-month-view/calendar-month-view';

@Component({
  selector: 'app-calendar-view',
  standalone: true,
  imports: [CalendarMonthView],
  templateUrl: './calendar-view.html',
  styleUrl: './calendar-view.scss',
})
export class CalendarView implements OnInit {
  readonly mode = input<'personal' | 'mj'>('personal');

  private readonly availabilitySvc = inject(AvailabilityService);

  protected readonly declarations = signal<AvailabilityDeclarationDto[]>([]);
  protected readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    try {
      this.declarations.set(await this.availabilitySvc.getMyDeclarations());
    } finally {
      this.loading.set(false);
    }
  }
}
