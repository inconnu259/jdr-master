import { Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import type { AvailabilityDeclarationDto, CreateAvailabilityDto, DaySlot, SlotStatus } from '@master-jdr/shared';
import { computeDisplayStatus } from '../../../core/availability/compute-display-status';
import { SlotSelectedEvent } from '../calendar-month-view/calendar-month-view';

interface SlotData {
  status: SlotStatus;
  preview: SlotStatus | null;
  declLabel: string | null;
}

export interface WeekCell {
  date: Date;
  label: string;
  isToday: boolean;
  isPast: boolean;
  morning: SlotData;
  afternoon: SlotData;
  evening: SlotData;
}

export function getWeekStart(date: Date): Date {
  const dow = date.getUTCDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + diff));
}

function toUTCMidnight(isoDate: string): Date {
  const d = new Date(isoDate);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function formatDeclLabel(d: AvailabilityDeclarationDto): string {
  const kind = d.kind === 'UNAVAILABLE' ? 'Indispo' : 'Dispo';
  const recur = d.recurKind === 'RECURRING' ? 'Récurrent' : 'Ponctuel';
  return `${kind} · ${recur}`;
}

function findWeekDecl(
  decls: AvailabilityDeclarationDto[],
  utcDate: Date,
  slot: 'MORNING' | 'AFTERNOON' | 'EVENING',
  now: Date,
): AvailabilityDeclarationDto | null {
  return (
    decls.find((d) => {
      if (new Date(d.expiresAt) <= now) return false;
      const slotMatch = d.slot === 'FULL_DAY' || d.slot === slot;
      if (!slotMatch) return false;
      if (d.recurKind === 'RECURRING') {
        if (d.dayOfWeek !== utcDate.getUTCDay()) return false;
        if (d.startDate) {
          const start = toUTCMidnight(d.startDate);
          if (utcDate < start) return false;
        }
        if (d.endDate) {
          const end = toUTCMidnight(d.endDate);
          if (utcDate > end) return false;
        }
        return utcDate <= toUTCMidnight(d.expiresAt);
      }
      if (!d.startDate || !d.endDate) return false;
      const start = new Date(d.startDate.substring(0, 10) + 'T00:00:00Z');
      const end = new Date(d.endDate.substring(0, 10) + 'T00:00:00Z');
      return utcDate >= start && utcDate <= end;
    }) ?? null
  );
}

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

export function buildWeek(
  weekStart: Date,
  decls: AvailabilityDeclarationDto[],
  pendingDecl: AvailabilityDeclarationDto | null,
): WeekCell[] {
  const now = new Date();
  // Minuit UTC d'aujourd'hui — cohérent avec l'alignement UTC des semaines.
  const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const declsWithPending = pendingDecl ? [...decls, pendingDecl] : decls;

  return Array.from({ length: 7 }, (_, i) => {
    const utcCell = new Date(
      Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + i),
    );
    // Pour l'affichage (label, date émise) : date locale représentant le même jour calendaire.
    const cellLocal = new Date(utcCell.getUTCFullYear(), utcCell.getUTCMonth(), utcCell.getUTCDate());

    const computeSlot = (slot: 'MORNING' | 'AFTERNOON' | 'EVENING'): SlotData => {
      const status = computeDisplayStatus(utcCell, slot, decls);
      let preview: SlotStatus | null = null;
      if (pendingDecl) {
        const withPending = computeDisplayStatus(utcCell, slot, declsWithPending);
        if (withPending !== status) preview = withPending;
      }
      const matchingDecl = findWeekDecl(decls, utcCell, slot, now);
      return {
        status,
        preview,
        declLabel: matchingDecl ? formatDeclLabel(matchingDecl) : null,
      };
    };

    return {
      date: cellLocal,
      label: new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric' }).format(
        cellLocal,
      ),
      isToday: utcCell.getTime() === todayUtcMidnight,
      isPast: utcCell.getTime() < todayUtcMidnight,
      morning: computeSlot('MORNING'),
      afternoon: computeSlot('AFTERNOON'),
      evening: computeSlot('EVENING'),
    };
  });
}

@Component({
  selector: 'app-calendar-week-view',
  standalone: true,
  imports: [MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  templateUrl: './calendar-week-view.html',
  styleUrl: './calendar-week-view.scss',
})
export class CalendarWeekView {
  readonly declarations = input<AvailabilityDeclarationDto[]>([]);
  readonly loading = input(false);
  readonly pendingDto = input<CreateAvailabilityDto | null>(null);
  readonly startDate = input<Date>(new Date());

  readonly slotSelected = output<SlotSelectedEvent>();
  readonly displayDateChange = output<Date>();

  protected readonly displayWeekStart = signal<Date>(getWeekStart(new Date()));

  private readonly pendingDecl = computed<AvailabilityDeclarationDto | null>(() => {
    const dto = this.pendingDto();
    return dto ? toFakeDecl(dto) : null;
  });

  protected readonly cells = computed(() =>
    buildWeek(this.displayWeekStart(), this.declarations(), this.pendingDecl()),
  );

  protected readonly weekLabel = computed(() => {
    const ws = this.displayWeekStart();
    // Dates locales construites depuis les composantes UTC pour l'affichage.
    const start = new Date(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate());
    const end = new Date(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate() + 6);
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(d);
    const fmtYear = (d: Date) =>
      new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }).format(
        d,
      );
    return start.getMonth() === end.getMonth()
      ? `${start.getDate()} – ${fmtYear(end)}`
      : `${fmt(start)} – ${fmtYear(end)}`;
  });

  protected readonly isCurrentWeek = computed(() => {
    const ws = this.displayWeekStart();
    const curr = getWeekStart(new Date());
    return ws.getTime() === curr.getTime();
  });

  protected readonly SLOT_ROWS: {
    key: 'morning' | 'afternoon' | 'evening';
    label: string;
    slot: DaySlot;
  }[] = [
    { key: 'morning', label: 'Matin', slot: 'MORNING' },
    { key: 'afternoon', label: 'Après-midi', slot: 'AFTERNOON' },
    { key: 'evening', label: 'Soirée', slot: 'EVENING' },
  ];

  constructor() {
    effect(() => {
      const d = this.startDate();
      untracked(() => this.displayWeekStart.set(getWeekStart(d)));
    });
  }

  prevWeek(): void {
    const ws = this.displayWeekStart();
    const next = new Date(Date.UTC(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate() - 7));
    this.displayWeekStart.set(next);
    this.displayDateChange.emit(next);
  }

  nextWeek(): void {
    const ws = this.displayWeekStart();
    const next = new Date(Date.UTC(ws.getUTCFullYear(), ws.getUTCMonth(), ws.getUTCDate() + 7));
    this.displayWeekStart.set(next);
    this.displayDateChange.emit(next);
  }

  goToToday(): void {
    const today = getWeekStart(new Date());
    this.displayWeekStart.set(today);
    this.displayDateChange.emit(today);
  }

  protected onCellClick(date: Date, slot: DaySlot): void {
    const now = new Date();
    // cellLocal est construit depuis les composantes UTC → getFullYear/Month/Date() == composantes UTC.
    const cellUtcMidnight = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
    const todayUtcMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (cellUtcMidnight < todayUtcMidnight) return;
    this.slotSelected.emit({ date, slot });
  }

  protected getSlotData(cell: WeekCell, key: 'morning' | 'afternoon' | 'evening'): SlotData {
    return cell[key];
  }

  protected cellAriaLabel(cell: WeekCell, slotData: SlotData, slotName: string): string {
    const labels: Record<SlotStatus, string> = {
      AVAILABLE: 'disponible',
      UNAVAILABLE: 'indisponible',
      UNKNOWN: 'inconnu',
    };
    const status = slotData.preview ?? slotData.status;
    const fullDate = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    }).format(cell.date);
    return `${slotName}, ${fullDate} : ${labels[status]}`;
  }
}
