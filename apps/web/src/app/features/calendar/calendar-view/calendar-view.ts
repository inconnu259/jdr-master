import { Component, OnInit, inject, input, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import type { AvailabilityDeclarationDto, CreateAvailabilityDto, DaySlot } from '@master-jdr/shared';
import { AvailabilityService } from '../../../core/availability/availability.service';
import { CalendarMonthView, SlotSelectedEvent } from '../calendar-month-view/calendar-month-view';
import { CalendarWeekView } from '../calendar-week-view/calendar-week-view';
import { ConstraintPanel } from '../constraint-panel/constraint-panel';

@Component({
  selector: 'app-calendar-view',
  standalone: true,
  imports: [CalendarMonthView, CalendarWeekView, ConstraintPanel, MatButtonToggleModule],
  templateUrl: './calendar-view.html',
  styleUrl: './calendar-view.scss',
})
export class CalendarView implements OnInit {
  readonly mode = input<'personal' | 'mj'>('personal');

  private readonly availabilitySvc = inject(AvailabilityService);

  protected readonly declarations = signal<AvailabilityDeclarationDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly view = signal<'month' | 'week'>('month');
  protected readonly sharedDate = signal<Date>(new Date());

  protected readonly panelOpen = signal(false);
  protected readonly selectedDate = signal<Date>(new Date());
  protected readonly selectedSlot = signal<DaySlot>('FULL_DAY');
  protected readonly selectedExisting = signal<AvailabilityDeclarationDto | null>(null);
  protected readonly pendingDto = signal<CreateAvailabilityDto | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadDeclarations();
  }

  protected onSlotSelected(event: SlotSelectedEvent): void {
    this.selectedDate.set(event.date);
    this.selectedSlot.set(event.slot);
    this.selectedExisting.set(this.findMatchingDeclaration(event.date, event.slot));
    this.pendingDto.set(null);
    this.panelOpen.set(true);
  }

  protected onViewChange(value: string): void {
    this.view.set(value as 'month' | 'week');
  }

  protected onMonthDateChange(d: Date): void {
    this.sharedDate.set(d);
  }

  protected onWeekDateChange(d: Date): void {
    this.sharedDate.set(d);
  }

  protected onFormChanged(dto: CreateAvailabilityDto | null): void {
    this.pendingDto.set(dto);
  }

  protected closePanel(): void {
    this.panelOpen.set(false);
    this.pendingDto.set(null);
  }

  protected async onPanelSaved(): Promise<void> {
    this.panelOpen.set(false);
    this.pendingDto.set(null);
    await this.loadDeclarations();
  }

  protected async onPanelDeleted(): Promise<void> {
    this.panelOpen.set(false);
    this.pendingDto.set(null);
    await this.loadDeclarations();
  }

  private async loadDeclarations(): Promise<void> {
    try {
      this.declarations.set(await this.availabilitySvc.getMyDeclarations());
    } catch {
      this.error.set('Impossible de charger les disponibilités.');
    } finally {
      this.loading.set(false);
    }
  }

  private findMatchingDeclaration(date: Date, slot: DaySlot): AvailabilityDeclarationDto | null {
    const now = new Date();
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

    return (
      this.declarations().find((d) => {
        if (new Date(d.expiresAt) <= now) return false;
        const slotMatch =
          slot === 'FULL_DAY'
            ? d.slot === 'FULL_DAY'
            : d.slot === 'FULL_DAY' || d.slot === slot;
        if (!slotMatch) return false;
        if (d.recurKind === 'RECURRING') return d.dayOfWeek === utcDate.getUTCDay();
        // Normalise en UTC minuit pour éviter les décalages de fuseau horaire dans la string ISO
        const start = new Date(d.startDate!.substring(0, 10) + 'T00:00:00Z');
        const end = new Date(d.endDate!.substring(0, 10) + 'T00:00:00Z');
        return utcDate >= start && utcDate <= end;
      }) ?? null
    );
  }
}
