import { Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import type { EventCardDto } from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { toDateKey } from '../../calendar/day-detail.utils';
import { EventDialog } from '../event-dialog/event-dialog';
import { EventsApiService } from '../events-api.service';

/**
 * Premier onglet d'une rencontre isolée (Story 41.1, ralliement `ONE_SHOT`) : le détail de son
 * UNIQUE événement, en ligne — ni liste, ni carte, ni fenêtre (UX-DR10). Le rendu est celui de
 * `EventDialog` en mode `inline` : titre + badge, encadré de situation, fiche ; les participants
 * n'y figurent pas (ils sont dans le second onglet) et aucune action n'y est posée avant les
 * Stories 41.2 (modification par l'hôte) et 41.3 (invitations).
 *
 * L'événement est lu par la liste existante de la partie (la rencontre isolée n'en porte qu'un) et
 * suit le temps réel comme `ConjonctionsTab` : la page parente tient DÉJÀ la connexion
 * `partie:{id}` et `PartiesService.changed()` est notifié à chaque mutation — cet onglet s'y abonne
 * par un `effect()` (garde du premier passage), sans ouvrir de connexion ni ajouter de handler.
 * Rechargement protégé : compteur de requêtes (une réponse périmée n'écrase pas une plus fraîche)
 * et dernier état connu conservé sur un échec transitoire.
 */
@Component({
  selector: 'app-soiree-tab',
  imports: [EventDialog],
  templateUrl: './soiree-tab.html',
  styleUrl: './soiree-tab.scss',
})
export class SoireeTab {
  protected readonly theme = inject(ThemeToneService);
  private readonly api = inject(EventsApiService);
  private readonly parties = inject(PartiesService);
  private readonly auth = inject(AuthService);

  readonly partieId = input.required<string>();

  /** L'unique événement de la rencontre (`null` tant qu'il n'est pas lu). */
  protected readonly card = signal<EventCardDto | null>(null);
  protected readonly loaded = signal(false);
  protected readonly loadError = signal(false);

  /** Jour courant figé à la construction : une seule source de « aujourd'hui » par écran. */
  protected readonly todayKey = toDateKey(new Date());
  protected readonly currentUserId = computed(() => this.auth.currentUser()?.id ?? null);

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

  private async reload(partieId: string): Promise<void> {
    const reqId = ++this.reqId;
    try {
      const list = await this.api.list(partieId);
      if (reqId !== this.reqId) return;
      this.card.set(list[0] ?? null);
      this.loadError.set(false);
      this.loaded.set(true);
    } catch {
      // Échec transitoire : le dernier état connu reste affiché.
      if (reqId === this.reqId) this.loadError.set(true);
    }
  }
}
