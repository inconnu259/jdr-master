import { Component, computed, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { AvailabilityDeclarationDto, CreateAvailabilityDto, DaySlot, SlotStatus } from '@master-jdr/shared';
import { computeDisplayStatus } from '../../../core/availability/compute-display-status';

export interface SlotSelectedEvent {
  date: Date;
  slot: DaySlot;
}

interface DayCell {
  date: Date;
  isCurrentMonth: boolean;
  isToday: boolean;
  isPast: boolean;
  morning: SlotStatus;
  afternoon: SlotStatus;
  evening: SlotStatus;
  morningPreview: SlotStatus | null;
  afternoonPreview: SlotStatus | null;
  eveningPreview: SlotStatus | null;
}

type QuerySlot = 'MORNING' | 'AFTERNOON' | 'EVENING';

function toFakeDecl(dto: CreateAvailabilityDto): AvailabilityDeclarationDto {
  return {
    id: '__preview__',
    userId: '__preview__',
    kind: dto.kind,
    recurKind: dto.recurKind,
    dayOfWeek: dto.dayOfWeek ?? null,
    slot: dto.slot,
    startDate: dto.startDate ?? null,
    endDate: dto.endDate ?? null,
    expiresAt: dto.expiresAt || '2099-12-31T23:59:59.000Z',
    createdAt: new Date().toISOString(),
  };
}

function buildMonth(
  display: Date,
  decls: AvailabilityDeclarationDto[],
  pendingDecl: AvailabilityDeclarationDto | null,
): DayCell[][] {
  const year = display.getFullYear();
  const month = display.getMonth();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayTime = today.getTime();

  const firstDay = new Date(year, month, 1);
  const dow = firstDay.getDay();
  const startOffset = dow === 0 ? 6 : dow - 1;

  const declsWithPending = pendingDecl ? [...decls, pendingDecl] : decls;

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

      const morning = computeDisplayStatus(utcCell, 'MORNING', decls);
      const afternoon = computeDisplayStatus(utcCell, 'AFTERNOON', decls);
      const evening = computeDisplayStatus(utcCell, 'EVENING', decls);

      const computePreview = (slot: QuerySlot, real: SlotStatus): SlotStatus | null => {
        if (!pendingDecl) return null;
        const preview = computeDisplayStatus(utcCell, slot, declsWithPending);
        return preview !== real ? preview : null;
      };

      week.push({
        date: cellLocal,
        isCurrentMonth: cellLocal.getMonth() === month,
        isToday: cellMidnight.getTime() === todayTime,
        isPast: cellMidnight.getTime() < todayTime,
        morning,
        afternoon,
        evening,
        morningPreview: computePreview('MORNING', morning),
        afternoonPreview: computePreview('AFTERNOON', afternoon),
        eveningPreview: computePreview('EVENING', evening),
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
  readonly declarations = input<AvailabilityDeclarationDto[]>([]);
  readonly loading = input(false);
  readonly pendingDto = input<CreateAvailabilityDto | null>(null);
  readonly initialDate = input<Date | null>(null);

  readonly slotSelected = output<SlotSelectedEvent>();
  readonly displayDateChange = output<Date>();

  protected readonly displayDate = signal(new Date());

  protected readonly monthLabel = computed(() =>
    new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(
      this.displayDate(),
    ),
  );

  private readonly pendingDecl = computed<AvailabilityDeclarationDto | null>(() => {
    const dto = this.pendingDto();
    return dto ? toFakeDecl(dto) : null;
  });

  protected readonly weeks = computed(() =>
    buildMonth(this.displayDate(), this.declarations(), this.pendingDecl()),
  );

  protected readonly DAY_NAMES = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  protected readonly isCurrentMonth = computed(() => {
    const d = this.displayDate();
    const now = new Date();
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  });

  // Minuit aujourd'hui (local) — utilisé pour bloquer les clics sur les dates passées.
  private readonly todayMidnight = (() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  })();

  constructor() {
    const init = this.initialDate();
    if (init) {
      this.displayDate.set(new Date(init.getFullYear(), init.getMonth(), 1));
    }
  }

  goToToday(): void {
    const today = new Date();
    this.displayDate.set(today);
    this.displayDateChange.emit(today);
  }

  prevMonth(): void {
    const d = this.displayDate();
    const next = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    this.displayDate.set(next);
    this.displayDateChange.emit(next);
  }

  nextMonth(): void {
    const d = this.displayDate();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    this.displayDate.set(next);
    this.displayDateChange.emit(next);
  }

  protected onCellClick(date: Date, slot: DaySlot): void {
    const midnight = new Date(date);
    midnight.setHours(0, 0, 0, 0);
    if (midnight.getTime() < this.todayMidnight) return; // date passée — ignorée
    this.slotSelected.emit({ date, slot });
  }

  protected slotAriaLabel(slotName: string, status: SlotStatus): string {
    const labels: Record<SlotStatus, string> = {
      AVAILABLE: 'disponible',
      UNAVAILABLE: 'indisponible',
      UNKNOWN: 'inconnu',
    };
    return `${slotName} : ${labels[status]}`;
  }
}
