import { Component, inject, input } from '@angular/core';
import type { DaySlot, SessionPollDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin', AFTERNOON: 'Après-midi', EVENING: 'Soirée', FULL_DAY: 'Journée',
};

@Component({
  selector: 'app-poll-status',
  standalone: true,
  templateUrl: './poll-status.html',
  styleUrl: './poll-status.scss',
})
export class PollStatusPanel {
  readonly poll = input.required<SessionPollDto>();
  protected readonly theme = inject(ThemeToneService);
  readonly SLOT_LABELS = SLOT_LABELS;

  protected formatDate(iso: string): string {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    }).format(d);
  }
}
