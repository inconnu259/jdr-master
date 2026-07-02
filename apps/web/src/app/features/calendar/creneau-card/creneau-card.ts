import { Component, computed, inject, input } from '@angular/core';
import type { AvailableSlotDto, DaySlot, SlotStatus } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const SLOT_LABELS: Record<string, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soirée',
};

const STATUS_ICONS: Record<SlotStatus, string> = {
  AVAILABLE: '✅',
  UNKNOWN: '⚠️',
  UNAVAILABLE: '❌',
};

@Component({
  selector: 'app-creneau-card',
  standalone: true,
  templateUrl: './creneau-card.html',
  styleUrl: './creneau-card.scss',
})
export class CreneauCard {
  readonly slot = input.required<AvailableSlotDto>();
  protected readonly theme = inject(ThemeToneService);

  protected readonly allAvailable = computed(() =>
    this.slot().members.every((m) => m.status === 'AVAILABLE'),
  );

  protected readonly unknownMembers = computed(() =>
    this.slot().members.filter((m) => m.status === 'UNKNOWN'),
  );

  protected slotLabel(slot: DaySlot): string {
    return SLOT_LABELS[slot] ?? slot;
  }

  protected statusIcon(status: SlotStatus): string {
    return STATUS_ICONS[status] ?? '❓';
  }

  protected formatDate(iso: string): string {
    const d = new Date(iso + 'T00:00:00Z');
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    }).format(d);
  }

  protected missingAlert(pseudo: string): string {
    return this.theme.tone()['alert.missing_player'].replace('{name}', pseudo);
  }
}
