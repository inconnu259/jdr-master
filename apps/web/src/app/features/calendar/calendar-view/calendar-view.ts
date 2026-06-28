import { Component, ElementRef, OnInit, ViewChild, computed, inject, input, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { ActivatedRoute } from '@angular/router';
import type { AggregatedSlotDto, AvailabilityDeclarationDto, AvailableSlotDto, CreateAvailabilityDto, DaySlot } from '@master-jdr/shared';
import { AvailabilityService } from '../../../core/availability/availability.service';
import { PollService } from '../../../core/poll/poll.service';
import { CalendarMonthView, SlotSelectedEvent } from '../calendar-month-view/calendar-month-view';
import { CalendarWeekView } from '../calendar-week-view/calendar-week-view';
import { ConstraintPanel } from '../constraint-panel/constraint-panel';
import { AvailableSlotsPanel } from '../available-slots/available-slots';

@Component({
  selector: 'app-calendar-view',
  standalone: true,
  imports: [CalendarMonthView, CalendarWeekView, ConstraintPanel, MatButtonToggleModule, MatButtonModule, AvailableSlotsPanel],
  templateUrl: './calendar-view.html',
  styleUrl: './calendar-view.scss',
})
export class CalendarView implements OnInit {
  readonly mode = input<'personal' | 'mj'>('personal');

  @ViewChild('slotsPanel') private readonly slotsPanel?: ElementRef<HTMLElement>;

  private readonly availabilitySvc = inject(AvailabilityService);
  private readonly pollSvc         = inject(PollService);
  private readonly route           = inject(ActivatedRoute);

  protected readonly declarations  = signal<AvailabilityDeclarationDto[]>([]);
  protected readonly loading       = signal(true);
  protected readonly error         = signal<string | null>(null);

  protected readonly view          = signal<'month' | 'week'>('month');
  protected readonly sharedDate    = signal<Date>(new Date());

  protected readonly panelOpen     = signal(false);
  protected readonly selectedDate  = signal<Date>(new Date());
  protected readonly selectedSlot  = signal<DaySlot>('FULL_DAY');
  protected readonly selectedExisting = signal<AvailabilityDeclarationDto | null>(null);
  protected readonly pendingDto    = signal<CreateAvailabilityDto | null>(null);

  protected readonly partieId       = signal<string | null>(null);
  protected readonly availableSlots = signal<(AvailableSlotDto | AggregatedSlotDto)[]>([]);
  protected readonly slotsLoading   = signal(false);
  protected readonly slotsError     = signal<string | null>(null);
  protected readonly heatmap        = signal<AggregatedSlotDto[]>([]);

  protected readonly isMjMode = computed(() => this.partieId() !== null);

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.partieId.set(id);
      await Promise.all([this.loadDeclarations(), this.loadAvailableSlots(id), this.loadHeatmap(id)]);
    } else {
      await this.loadDeclarations();
    }
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

  protected async onMonthDateChange(d: Date): Promise<void> {
    this.sharedDate.set(d);
    const id = this.partieId();
    if (id) await this.loadHeatmap(id, d);
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

  protected scrollToSlots(): void {
    this.slotsPanel?.nativeElement.scrollIntoView({ behavior: 'smooth' });
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

  private async loadHeatmap(id: string, centerDate: Date = new Date()): Promise<void> {
    // Calcule exactement la grille du mois affiché (même logique que buildMonth : 6×7 = 42 jours)
    const firstOfMonth = new Date(centerDate.getFullYear(), centerDate.getMonth(), 1);
    const dow = firstOfMonth.getDay();
    const startOffset = dow === 0 ? 6 : dow - 1;
    const gridStart = new Date(firstOfMonth.getFullYear(), firstOfMonth.getMonth(), 1 - startOffset);
    const gridEnd   = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + 41);
    const toIso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    try {
      this.heatmap.set(await this.pollSvc.getHeatmap(id, toIso(gridStart), toIso(gridEnd)));
    } catch {
      // non-bloquant — le heatmap est un overlay facultatif
    }
  }

  private async loadAvailableSlots(id: string): Promise<void> {
    this.slotsLoading.set(true);
    try {
      this.availableSlots.set(await this.pollSvc.getAvailableSlots(id));
    } catch {
      this.slotsError.set('Impossible de charger les créneaux.');
    } finally {
      this.slotsLoading.set(false);
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
        if (d.recurKind === 'RECURRING') {
          if (d.dayOfWeek !== utcDate.getUTCDay()) return false;
          if (d.startDate) {
            const start = new Date(d.startDate.substring(0, 10) + 'T00:00:00Z');
            if (utcDate < start) return false;
          }
          if (d.endDate) {
            const end = new Date(d.endDate.substring(0, 10) + 'T00:00:00Z');
            if (utcDate > end) return false;
          }
          return true;
        }
        // Normalise en UTC minuit pour éviter les décalages de fuseau horaire dans la string ISO
        const start = new Date(d.startDate!.substring(0, 10) + 'T00:00:00Z');
        const end = new Date(d.endDate!.substring(0, 10) + 'T00:00:00Z');
        return utcDate >= start && utcDate <= end;
      }) ?? null
    );
  }
}
