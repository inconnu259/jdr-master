import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatIconModule } from '@angular/material/icon';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { AvailableSlotDto, CreatePollDto, DaySlot, SessionPollDto } from '@master-jdr/shared';
import { PollService } from '../../../core/poll/poll.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

interface CustomSlot {
  date: string;
  slot: DaySlot;
}

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin', AFTERNOON: 'Après-midi', EVENING: 'Soirée', FULL_DAY: 'Journée',
};

@Component({
  selector: 'app-poll-creation',
  standalone: true,
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatIconModule],
  templateUrl: './poll-creation.html',
  styleUrl: './poll-creation.scss',
})
export class PollCreationComponent {
  readonly partieId         = input.required<string>();
  readonly preselectedSlots = input<AvailableSlotDto[]>([]);

  readonly created   = output<SessionPollDto>();
  readonly cancelled = output<void>();

  private readonly pollSvc = inject(PollService);
  protected readonly theme = inject(ThemeToneService);
  private readonly snack   = inject(MatSnackBar);

  protected readonly checkedSlots     = signal<Set<number>>(new Set());
  protected readonly customSlots      = signal<CustomSlot[]>([]);
  protected readonly visibleSlotsCount = signal(5);
  protected scenarioRef = '';

  protected readonly saving = signal(false);
  protected readonly error  = signal<string | null>(null);

  readonly SLOT_LABELS = SLOT_LABELS;
  readonly SLOT_OPTIONS: DaySlot[] = ['MORNING', 'AFTERNOON', 'EVENING'];

  protected readonly visiblePreselected = computed(() =>
    this.preselectedSlots().slice(0, this.visibleSlotsCount()),
  );

  protected readonly canLoadMore = computed(() =>
    this.visibleSlotsCount() < this.preselectedSlots().length,
  );

  protected readonly nextBatchSize = computed(() =>
    Math.min(4, this.preselectedSlots().length - this.visibleSlotsCount()),
  );

  protected get totalSelected(): number {
    return this.checkedSlots().size + this.customSlots().filter(c => c.date).length;
  }

  protected get isValid(): boolean {
    return this.totalSelected >= 2 && this.totalSelected <= 40;
  }

  protected formatSlot(date: string, slot: DaySlot): string {
    const d = new Date(date + 'T00:00:00Z');
    const dateStr = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    }).format(d);
    return `${dateStr} — ${SLOT_LABELS[slot]}`;
  }

  protected toggleSlot(index: number): void {
    const s = new Set(this.checkedSlots());
    if (s.has(index)) { s.delete(index); } else { s.add(index); }
    this.checkedSlots.set(s);
  }

  protected loadMoreSlots(): void {
    this.visibleSlotsCount.update(n => Math.min(n + 4, this.preselectedSlots().length));
  }

  protected addOneCustomSlot(): void {
    this.customSlots.update(list => [...list, { date: this.nextDefaultDate(), slot: 'AFTERNOON' as DaySlot }]);
  }

  protected removeCustomSlot(i: number): void {
    this.customSlots.update(list => list.filter((_, idx) => idx !== i));
  }

  private nextDefaultDate(): string {
    const all = [
      ...this.preselectedSlots().map(s => s.date),
      ...this.customSlots().map(c => c.date).filter(Boolean),
    ].sort();
    const latest = all.at(-1);
    const d = latest
      ? new Date(latest + 'T00:00:00Z')
      : new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
    d.setUTCDate(d.getUTCDate() + 7);
    return d.toISOString().substring(0, 10);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.isValid || this.saving()) return;
    this.saving.set(true);
    this.error.set(null);
    try {
      const preSelected = this.preselectedSlots();
      const options = [
        ...[...this.checkedSlots()].map(i => ({
          date: preSelected[i].date,
          slot: preSelected[i].slot,
        })),
        ...this.customSlots().filter(c => c.date).map(c => ({
          date: c.date,
          slot: c.slot,
        })),
      ];
      const dto: CreatePollDto = {
        options,
        scenarioRef: this.scenarioRef.trim() || null,
      };
      const poll = await this.pollSvc.createPoll(this.partieId(), dto);
      this.snack.open(this.theme.tone()['success.poll_created'], undefined, { duration: 3000 });
      this.created.emit(poll);
    } catch {
      this.error.set("Impossible de créer le vote. Réessayez.");
    } finally {
      this.saving.set(false);
    }
  }
}
