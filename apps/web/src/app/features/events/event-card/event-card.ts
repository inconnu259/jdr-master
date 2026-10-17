import { Component, computed, inject, input } from '@angular/core';
import type { EventCardDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { fillTone } from '../../../core/theme/tone-format';
import { StatusBadge } from '../../../shared/status-badge/status-badge';
import {
  eventBadge,
  eventDateLabel,
  eventSituation,
  isImminentEvent,
  isPastEvent,
} from '../event-card.util';

/**
 * Carte d'une conjonction (Story 40.1, UX-DR7) : titre, badge d'état, date en gras, hôte, lieu (ligne
 * omise s'il est vide), « Ma situation » + chip. Rien de plus sur la carte ; l'état est TOUJOURS
 * écrit (badge, chip), jamais porté par la seule couleur ou la seule épaisseur du filet.
 *
 * Rendu pur, non cliquable à ce stade (la fenêtre de détail arrive avec la Story 40.2).
 */
@Component({
  selector: 'app-event-card',
  imports: [StatusBadge],
  templateUrl: './event-card.html',
  styleUrl: './event-card.scss',
})
export class EventCard {
  protected readonly theme = inject(ThemeToneService);

  readonly card = input.required<EventCardDto>();
  /** Clé `YYYY-MM-DD` du jour courant, figée par l'écran parent (une seule source par écran). */
  readonly todayKey = input.required<string>();
  readonly currentUserId = input<string | null>(null);

  protected readonly past = computed(() => isPastEvent(this.card(), this.todayKey()));
  protected readonly imminent = computed(() => isImminentEvent(this.card(), this.todayKey()));
  protected readonly badge = computed(() =>
    eventBadge(this.card(), this.todayKey(), this.theme.tone()),
  );
  protected readonly dateLabel = computed(() => eventDateLabel(this.card(), this.theme.tone()));
  protected readonly hostLabel = computed(() =>
    fillTone(this.theme.tone()['partie.ralliement_event_host'], {
      name: this.card().hostDisplayName ?? '—',
    }),
  );
  protected readonly situation = computed(() =>
    eventSituation(this.card(), this.currentUserId(), this.todayKey()),
  );
}
