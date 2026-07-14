import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { SessionPollDto } from '@master-jdr/shared';
import { AuthService } from '../auth/auth.service';
import { ModeService } from '../mode/mode.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { hasUnansweredOptions } from './poll.util';

@Injectable({ providedIn: 'root' })
export class OpenPollsService {
  private readonly modeSvc = inject(ModeService);
  private readonly scenariosSvc = inject(ScenariosService);
  private readonly authSvc = inject(AuthService);

  readonly openPolls = signal<Map<string, SessionPollDto>>(new Map());
  readonly count = computed(() => this.openPolls().size);

  private seq = 0;

  constructor() {
    effect(() => {
      void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    const parties = this.modeSvc.playerParties();
    const seq = ++this.seq;
    if (parties.length === 0) {
      // Le membre ne fait plus partie d'aucune partie (ex. a quitté sa dernière partie) —
      // vider l'état au lieu de le laisser figé sur l'ancienne Map.
      this.openPolls.set(new Map());
      return;
    }
    // Story 8.8 (revue de code) : ScenariosService.listAll() remplace PollService.getCurrentPoll()
    // (un seul poll par Partie, findFirst arbitraire) — plusieurs votes OPEN peuvent désormais
    // coexister sur une même Partie (Décision 2). Sans ce fix, un joueur avec un vote déjà répondu
    // ET un second vote encore en attente sur la même Partie pouvait ne jamais être notifié du
    // second si le refetch renvoyait arbitrairement le premier (déjà répondu).
    const results = await Promise.allSettled(
      parties.map((p) =>
        this.scenariosSvc.listAll(p.id).then((scenarios) => {
          const openPolls: SessionPollDto[] = [];
          for (const scenario of scenarios) {
            for (const seance of scenario.seances) {
              if (seance.poll?.status === 'OPEN') openPolls.push(seance.poll);
            }
          }
          return { id: p.id, openPolls };
        }),
      ),
    );
    if (seq !== this.seq) return;
    const userId = this.authSvc.currentUser()?.id;
    const map = new Map<string, SessionPollDto>();
    for (const r of results) {
      if (r.status !== 'fulfilled') continue;
      // Ne compte que les Parties où AU MOINS un poll OPEN a encore une option sans réponse.
      const pending = userId
        ? r.value.openPolls.find((poll) => hasUnansweredOptions(poll, userId))
        : r.value.openPolls[0];
      if (pending) map.set(r.value.id, pending);
    }
    this.openPolls.set(map);
  }
}
