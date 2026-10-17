import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { EventCardDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { DetailSurface } from '../../../shared/detail-surface/detail-surface';
import { EventForm } from '../event-form/event-form';
import { EventsApiService } from '../events-api.service';
import { refusalMessage } from '../refusal-message';

let nextUid = 0;

/**
 * Fenêtre de création d'une conjonction à date fixée (Story 40.1), sur la `DetailSurface` en
 * variante LARGE (⚠️ contrat UX, EventDialog). Les champs vivent dans `EventForm` (partagé avec le
 * mode édition de la fenêtre de détail, Story 40.2) ; ici : titre, pied « Renoncer » · « Créer la
 * conjonction », garde de double envoi (`busy`) et refus du serveur affiché DANS la fenêtre (message
 * français tel quel, sinon repli du thème). Le serveur reste juge de toutes les règles.
 */
@Component({
  selector: 'app-event-create',
  imports: [MatButtonModule, DetailSurface, EventForm],
  templateUrl: './event-create.html',
  styleUrl: './event-create.scss',
})
export class EventCreate {
  protected readonly theme = inject(ThemeToneService);
  private readonly api = inject(EventsApiService);

  readonly partieId = input.required<string>();
  readonly created = output<EventCardDto>();
  readonly closed = output<void>();

  protected readonly uid = `event-create-${++nextUid}`;
  private readonly form = viewChild.required(EventForm);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSubmit = computed(() => !this.busy() && this.form().valid());

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const card = await this.api.create(this.partieId(), this.form().dto());
      this.created.emit(card);
    } catch (err) {
      this.error.set(
        refusalMessage(err, this.theme.tone()['partie.ralliement_event_create_error']),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
