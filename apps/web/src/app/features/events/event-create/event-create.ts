import { Component, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { CreateEventDto, EventCardDto, EventSlot } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { DetailSurface } from '../../../shared/detail-surface/detail-surface';
import { SLOT_LABELS } from '../../calendar/agenda-badge.utils';
import { toDateKey } from '../../calendar/day-detail.utils';
import { EventsApiService } from '../events-api.service';

/** Nombre de places proposé par défaut quand on passe à « Places limitées » (hôte compris). */
export const DEFAULT_PLACES = 4;
/** Minimum de places limitées : l'hôte en occupe une, il en faut au moins une autre. */
export const MIN_PLACES = 2;

let nextUid = 0;

/**
 * Fenêtre de création d'une conjonction à date fixée (Story 40.1), sur la `DetailSurface` en
 * variante LARGE (⚠️ contrat UX, EventDialog). Ordre du contrat : nom* → bascule « Date fixée |
 * Sondage de dates » (le sondage est visible mais désactivé jusqu'à la Story 40.5) → jour (champ de
 * date natif) + créneau → lieu → heure (`type="time"`, une étiquette « HH:MM ») → infos pratiques →
 * participation « Tous les membres | Places limitées » avec un compteur −/+ → pied « Renoncer » ·
 * « Créer la conjonction ».
 *
 * Garde de double envoi (`busy`), refus du serveur affiché DANS la fenêtre (message français tel
 * quel, sinon repli du thème). Le serveur reste juge de toutes les règles (jour non passé, bornes…).
 */
@Component({
  selector: 'app-event-create',
  imports: [
    FormsModule,
    MatButtonModule,
    MatButtonToggleModule,
    MatFormFieldModule,
    MatInputModule,
    DetailSurface,
  ],
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
  protected readonly slots: readonly EventSlot[] = ['MORNING', 'AFTERNOON', 'EVENING'];
  protected readonly slotLabels = SLOT_LABELS;
  /** Jour courant (clé locale), borne basse du champ de date — le serveur tranche en dernier. */
  protected readonly todayKey = toDateKey(new Date());

  protected readonly title = signal('');
  protected readonly day = signal('');
  protected readonly slot = signal<EventSlot>('EVENING');
  protected readonly lieu = signal('');
  protected readonly heureRdv = signal('');
  protected readonly notePratique = signal('');
  protected readonly participation = signal<'all' | 'limited'>('all');
  protected readonly places = signal(DEFAULT_PLACES);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly canSubmit = computed(
    () =>
      !this.busy() &&
      this.title().trim().length > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(this.day()) &&
      this.day() >= this.todayKey,
  );

  protected setParticipation(value: 'all' | 'limited'): void {
    this.participation.set(value);
  }

  protected decrement(): void {
    this.places.update((n) => Math.max(MIN_PLACES, n - 1));
  }

  protected increment(): void {
    this.places.update((n) => n + 1);
  }

  /** Saisie directe dans le compteur : entier ≥ 2, sans plafond. Une saisie invalide est ignorée ET
   *  le champ réaffiche la valeur retenue — jamais un nombre affiché autre que celui qui sera envoyé. */
  protected setPlaces(input: HTMLInputElement): void {
    const n = input.value.trim() === '' ? NaN : Number(input.value);
    if (Number.isInteger(n) && n >= MIN_PLACES) this.places.set(n);
    else input.value = String(this.places());
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.busy.set(true);
    this.error.set(null);
    const dto: CreateEventDto = {
      title: this.title().trim(),
      date: this.day(),
      slot: this.slot(),
      lieu: this.lieu().trim() || null,
      heureRdv: this.heureRdv().trim() || null,
      notePratique: this.notePratique().trim() || null,
      capacity: this.participation() === 'limited' ? this.places() : null,
    };
    try {
      const card = await this.api.create(this.partieId(), dto);
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

/** Message de refus du serveur (texte français, ou liste de messages de validation), sinon le
 *  libellé de repli du thème (réseau, réponse sans texte). */
function refusalMessage(error: unknown, fallback: string): string {
  const message = (error as { error?: { message?: unknown } } | null)?.error?.message;
  if (typeof message === 'string' && message.trim()) return message;
  if (Array.isArray(message)) {
    const texts = message.filter((m): m is string => typeof m === 'string' && !!m.trim());
    if (texts.length > 0) return texts.join(' ');
  }
  return fallback;
}
