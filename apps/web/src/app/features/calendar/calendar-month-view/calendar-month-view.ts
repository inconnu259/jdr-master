import { Component, computed, input, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { AvailabilityDeclarationDto, SlotStatus } from '@master-jdr/shared';
import { computeDisplayStatus } from '../../../core/availability/compute-display-status';

interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  morning: SlotStatus;
  afternoon: SlotStatus;
  evening: SlotStatus;
}

function buildMonth(display: Date, decls: AvailabilityDeclarationDto[]): DayCell[][] {
  const year = display.getFullYear();
  const month = display.getMonth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  const firstDay = new Date(year, month, 1);
  const dow = firstDay.getDay();
  const startOffset = dow === 0 ? 6 : dow - 1; // Monday-first (0=Mon … 6=Sun)

  const weeks: DayCell[][] = [];
  let dayOffset = 1 - startOffset;

  for (let w = 0; w < 6; w++) {
    const week: DayCell[] = [];
    for (let d = 0; d < 7; d++) {
      const cellLocal = new Date(year, month, dayOffset);
      const utcCell = new Date(
        Date.UTC(cellLocal.getFullYear(), cellLocal.getMonth(), cellLocal.getDate()),
      );
      const cellMidnight = new Date(cellLocal);
      cellMidnight.setHours(0, 0, 0, 0);

      week.push({
        date: cellLocal,
        isCurrentMonth: cellLocal.getMonth() === month,
        isToday: cellMidnight.getTime() === todayTime,
        morning: computeDisplayStatus(utcCell, 'MORNING', decls),
        afternoon: computeDisplayStatus(utcCell, 'AFTERNOON', decls),
        evening: computeDisplayStatus(utcCell, 'EVENING', decls),
      });
      dayOffset++;
    }
    weeks.push(week);
  }

  return weeks;
}

@Component({
  selector: 'app-calendar-month-view',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './calendar-month-view.html',
  styleUrl: './calendar-month-view.scss',
})
export class CalendarMonthView {
  // Signal inputs (Angular 17+) → reactive with computed()
  readonly declarations = input<AvailabilityDeclarationDto[]>([]);
  readonly loading = input(false);

  protected readonly displayDate = signal(new Date());

  protected readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
      this.displayDate(),
    ),
  );

  protected readonly weeks = computed(() => buildMonth(this.displayDate(), this.declarations()));

  protected readonly DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  prevMonth(): void {
    const d = this.displayDate();
    this.displayDate.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  nextMonth(): void {
    const d = this.displayDate();
    this.displayDate.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  protected slotAriaLabel(slotName: string, status: SlotStatus): string {
    const labels: Record<SlotStatus, string> = {
      AVAILABLE: 'disponible',
      UNAVAILABLE: 'indisponible',
      UNKNOWN: 'inconnu',
    };
    return `${slotName} : ${labels[status]}`;
  }
}
