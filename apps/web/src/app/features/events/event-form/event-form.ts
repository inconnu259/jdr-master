import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import type { CreateEventDto, EventCardDto, EventSlot } from '@master-jdr/shared';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { SLOT_LABELS } from '../../calendar/agenda-badge.utils';
import { toDateKey } from '../../calendar/day-detail.utils';

/** Nombre de places proposé par défaut quand on passe à « Places limitées » (hôte compris). */
export const DEFAULT_PLACES = 4;
/** Minimum de places limitées : l'hôte en occupe une, il en faut au moins une autre. */
export const MIN_PLACES = 2;

let nextUid = 0;

/**
 * Champs d'une conjonction à date fixée, partagés par la fenêtre de création (Story 40.1) et le mode
 * édition de la fenêtre de détail (Story 40.2) : nom* → bascule « Date fixée | Sondage de dates »
 * (le sondage est visible mais désactivé jusqu'à la Story 40.5) → jour (champ de date natif) +
 * créneau → lieu → heure (`type="time"`, une étiquette « HH:MM ») → infos pratiques → participation
 * « Tous les membres | Places limitées » avec un compteur −/+.
 *
 * Rendu des champs seulement : le parent tient le pied (boutons, double envoi, refus du serveur) et
 * lit `dto()` / `valid()` par `viewChild`. `prefill` pré-remplit le formulaire d'une conjonction
 * existante (lu une seule fois à l'initialisation). Le serveur reste juge de toutes les règles.
 */
@Component({
  selector: 'app-event-form',
  imports: [FormsModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule],
  templateUrl: './event-form.html',
  styleUrl: './event-form.scss',
})
export class EventForm implements OnInit {
  protected readonly theme = inject(ThemeToneService);

  /** Conjonction à modifier (mode édition) ; absente à la création. */
  readonly prefill = input<EventCardDto | null>(null);
  /** Entrée dans un champ : le parent soumet (comme un bouton « Enregistrer »). */
  readonly submitted = output<void>();

  protected readonly uid = `event-form-${++nextUid}`;
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

  /** Nom non vide, jour au bon format et pas avant aujourd'hui. */
  readonly valid = computed(
    () =>
      this.title().trim().length > 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(this.day()) &&
      this.day() >= this.todayKey,
  );

  /** Payload prêt à envoyer (textes nettoyés, champ vide → `null`). */
  readonly dto = computed((): CreateEventDto => ({
    title: this.title().trim(),
    date: this.day(),
    slot: this.slot(),
    lieu: this.lieu().trim() || null,
    heureRdv: this.heureRdv().trim() || null,
    notePratique: this.notePratique().trim() || null,
    capacity: this.participation() === 'limited' ? this.places() : null,
  }));

  ngOnInit(): void {
    const card = this.prefill();
    if (!card) return;
    const seance = card.seance;
    this.title.set(card.title);
    this.day.set(seance?.date ?? '');
    this.slot.set(seance?.slot && seance.slot !== 'FULL_DAY' ? seance.slot : 'EVENING');
    this.lieu.set(seance?.lieu ?? '');
    this.heureRdv.set(seance?.heureRdv ?? '');
    this.notePratique.set(seance?.notePratique ?? '');
    if (seance?.capacity != null) {
      this.participation.set('limited');
      this.places.set(Math.max(MIN_PLACES, seance.capacity));
    }
  }

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
}
