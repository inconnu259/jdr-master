import { Component, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { EventCardDto } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { fillTone } from '../../../core/theme/tone-format';
import { DetailSurface } from '../../../shared/detail-surface/detail-surface';
import { StatusBadge } from '../../../shared/status-badge/status-badge';
import {
  eventBadge,
  eventDateLabel,
  eventSituationTextKey,
  isHostOf,
  isPastEvent,
  participationLine,
} from '../event-card.util';
import { EventForm } from '../event-form/event-form';
import { EventsApiService } from '../events-api.service';
import { ParticipantChip } from '../participant-chip/participant-chip';
import { refusalMessage } from '../refusal-message';

let nextUid = 0;

/**
 * Fenêtre d'une conjonction (Story 40.2, EventDialog) sur la `DetailSurface` en variante LARGE
 * (⚠️ contrat UX). Ordre du contrat : titre (nom de la conjonction) + badge → panneau de situation
 * (la situation de la personne, puis date, heure et lieu en grand — ni vote ni inscription à ce
 * palier) → fiche (date, hôte, lieu, heure, participation, infos pratiques ; lignes facultatives
 * vides omises) → participants → pied. Pied : l'hôte voit « Modifier » tant que la conjonction n'est
 * pas passée, puis « Refermer ».
 *
 * La carte vient de la liste vivante de l'onglet (lue par identifiant) : toute mise à jour reçue en
 * temps réel se reflète ici sans rechargement. « Modifier » bascule la MÊME fenêtre en mode édition
 * (les champs de la création, via `EventForm`), pied « Renoncer » · « Enregistrer » ; le refus du
 * serveur s'affiche dans la fenêtre. Le focus est piégé par la `DetailSurface` ; le retour du focus
 * sur la carte est l'affaire de l'onglet.
 */
@Component({
  selector: 'app-event-dialog',
  imports: [MatButtonModule, DetailSurface, StatusBadge, ParticipantChip, EventForm],
  templateUrl: './event-dialog.html',
  styleUrl: './event-dialog.scss',
})
export class EventDialog {
  protected readonly theme = inject(ThemeToneService);
  private readonly api = inject(EventsApiService);

  readonly partieId = input.required<string>();
  readonly card = input.required<EventCardDto>();
  /** Clé `YYYY-MM-DD` du jour courant, figée par l'écran parent. */
  readonly todayKey = input.required<string>();
  readonly currentUserId = input<string | null>(null);
  /** Carte enregistrée par l'hôte (réponse du serveur) : l'onglet la met à jour tout de suite. */
  readonly saved = output<EventCardDto>();
  readonly closed = output<void>();

  protected readonly uid = `event-dialog-${++nextUid}`;
  private readonly form = viewChild(EventForm);

  protected readonly editing = signal(false);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly past = computed(() => isPastEvent(this.card(), this.todayKey()));
  protected readonly canEdit = computed(
    () => isHostOf(this.card(), this.currentUserId()) && !this.past(),
  );
  protected readonly badge = computed(() =>
    eventBadge(this.card(), this.todayKey(), this.theme.tone()),
  );
  protected readonly dateLabel = computed(() => eventDateLabel(this.card(), this.theme.tone()));
  protected readonly situationText = computed(
    () =>
      this.theme.tone()[eventSituationTextKey(this.card(), this.currentUserId(), this.todayKey())],
  );
  protected readonly timeText = computed(() => {
    const time = this.card().seance?.heureRdv;
    return time
      ? fillTone(this.theme.tone()['partie.ralliement_event_panel_time'], { time })
      : null;
  });
  protected readonly participation = computed(() =>
    participationLine(this.card(), this.theme.tone()),
  );
  protected readonly windowTitle = computed(() =>
    this.editing() ? this.theme.tone()['partie.ralliement_event_edit_title'] : this.card().title,
  );
  protected readonly canSave = computed(() => !this.busy() && !!this.form()?.valid());

  protected startEdit(): void {
    this.error.set(null);
    this.editing.set(true);
  }

  protected cancelEdit(): void {
    this.error.set(null);
    this.editing.set(false);
  }

  protected async save(): Promise<void> {
    const form = this.form();
    if (!form || !this.canSave()) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const card = await this.api.update(this.partieId(), this.card().id, form.dto());
      this.saved.emit(card);
      this.editing.set(false);
    } catch (err) {
      this.error.set(
        refusalMessage(err, this.theme.tone()['partie.ralliement_event_update_error']),
      );
    } finally {
      this.busy.set(false);
    }
  }
}
