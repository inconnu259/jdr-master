import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type { EventCardDto } from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { toDateKey } from '../../calendar/day-detail.utils';
import { EventCard } from '../event-card/event-card';
import { splitEvents } from '../event-card.util';
import { EventCreate } from '../event-create/event-create';
import { EventsApiService } from '../events-api.service';

/**
 * Onglet « Conjonctions » d'un groupe (Story 39.1 pour la coquille, Story 40.1 pour le contenu) :
 * en-tête (titre + « + Nouvelle conjonction », pour tout membre), sections « À venir » puis
 * « Passées » (passée = jour avant aujourd'hui), état vide global conservé.
 *
 * Temps réel (checklist) : la page parente (`PartieDetail`) tient DÉJÀ la connexion `partie:{id}`,
 * et `PartiesService.changed()` est notifié sur toute mutation de cette partie — l'onglet s'y
 * abonne par un `effect()` (garde firstRun) et n'ouvre aucune connexion, n'ajoute aucun handler.
 * Rechargement protégé : compteur de requêtes (une réponse périmée n'écrase pas une plus fraîche) et
 * dernier état connu conservé sur un échec transitoire (jamais de `.set([])`).
 *
 * `countChange` remonte le nombre réel de conjonctions du groupe (passées comprises) — l'avertissement
 * du dernier administrateur (Story 39.4) le cite.
 */
@Component({
  selector: 'app-conjonctions-tab',
  imports: [MatButtonModule, EventCard, EventCreate],
  templateUrl: './conjonctions-tab.html',
  styleUrl: './conjonctions-tab.scss',
})
export class ConjonctionsTab {
  protected readonly theme = inject(ThemeToneService);
  private readonly api = inject(EventsApiService);
  private readonly parties = inject(PartiesService);
  private readonly auth = inject(AuthService);

  readonly partieId = input.required<string>();
  readonly countChange = output<number>();

  protected readonly events = signal<EventCardDto[]>([]);
  protected readonly loaded = signal(false);
  protected readonly loadError = signal(false);
  protected readonly creating = signal(false);

  /** Jour courant figé à la construction : une seule source de « aujourd'hui » par écran. */
  protected readonly todayKey = toDateKey(new Date());
  protected readonly currentUserId = computed(() => this.auth.currentUser()?.id ?? null);
  protected readonly sections = computed(() => splitEvents(this.events(), this.todayKey));

  private reqId = 0;

  constructor() {
    // Chargement initial, et rechargement si la partie affichée change.
    effect(() => {
      const id = this.partieId();
      untracked(() => void this.reload(id));
    });

    let firstRun = true;
    effect(() => {
      this.parties.changed();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => void this.reload(this.partieId()));
    });
  }

  protected openCreate(): void {
    this.creating.set(true);
  }

  protected closeCreate(): void {
    this.creating.set(false);
  }

  /** Conjonction créée : la fenêtre se referme, la carte apparaît tout de suite (puis la liste est
   *  relue — les autres membres la reçoivent par le signal temps réel). */
  protected async onCreated(card: EventCardDto): Promise<void> {
    this.creating.set(false);
    if (!this.events().some((e) => e.id === card.id)) {
      this.events.update((list) => [...list, card]);
      this.countChange.emit(this.events().length);
    }
    await this.reload(this.partieId());
  }

  private async reload(partieId: string): Promise<void> {
    const reqId = ++this.reqId;
    try {
      const list = await this.api.list(partieId);
      if (reqId !== this.reqId) return;
      this.events.set(list);
      this.loadError.set(false);
      this.loaded.set(true);
      this.countChange.emit(list.length);
    } catch {
      // Échec transitoire : le dernier état connu reste affiché.
      if (reqId === this.reqId) this.loadError.set(true);
    }
  }
}
