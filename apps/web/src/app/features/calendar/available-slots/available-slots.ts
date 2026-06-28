import { Component, computed, inject, input } from '@angular/core';
import type { AggregatedSlotDto, AvailableSlotDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { AggregatedCreneauCard } from '../aggregated-creneau-card/aggregated-creneau-card';
import { CreneauCard } from '../creneau-card/creneau-card';

type AnySlotDto = AvailableSlotDto | AggregatedSlotDto;

function slotPriority(s: AnySlotDto): number {
  if ('members' in s) {
    const hasUnavail = s.members.some((m) => m.status === 'UNAVAILABLE');
    const availCount = s.members.filter((m) => m.status === 'AVAILABLE').length;
    if (hasUnavail) return 3;
    if (availCount === s.members.length) return 0;
    if (availCount > 0) return 1;
    return 2;
  }
  if (s.unavailable > 0) return 3;
  if (s.available === s.total) return 0;
  if (s.available > 0) return 1;
  return 2;
}

function availableCount(s: AnySlotDto): number {
  return 'members' in s
    ? s.members.filter((m) => m.status === 'AVAILABLE').length
    : s.available;
}

@Component({
  selector: 'app-available-slots',
  standalone: true,
  imports: [CreneauCard, AggregatedCreneauCard],
  templateUrl: './available-slots.html',
  styleUrl: './available-slots.scss',
})
export class AvailableSlotsPanel {
  readonly slots   = input.required<AnySlotDto[]>();
  readonly loading = input<boolean>(false);
  readonly error   = input<string | null>(null);

  protected readonly theme = inject(ThemeToneService);

  protected readonly sortedSlots = computed(() =>
    [...this.slots()].sort((a, b) => {
      const pa = slotPriority(a);
      const pb = slotPriority(b);
      if (pa !== pb) return pa - pb;
      if (pa === 1) {
        const diff = availableCount(b) - availableCount(a);
        if (diff !== 0) return diff;
      }
      return a.date.localeCompare(b.date);
    }),
  );

  protected isMjSlot(s: AnySlotDto): s is AvailableSlotDto {
    return 'members' in s;
  }
}
