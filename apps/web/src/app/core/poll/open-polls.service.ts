import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { SessionPollDto } from '@master-jdr/shared';
import { AuthService } from '../auth/auth.service';
import { ModeService } from '../mode/mode.service';
import { PollService } from './poll.service';
import { hasUnansweredOptions } from './poll.util';

@Injectable({ providedIn: 'root' })
export class OpenPollsService {
  private readonly modeSvc = inject(ModeService);
  private readonly pollSvc = inject(PollService);
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
    const results = await Promise.allSettled(
      parties.map((p) => this.pollSvc.getCurrentPoll(p.id).then((poll) => ({ id: p.id, poll }))),
    );
    if (seq !== this.seq) return;
    const userId = this.authSvc.currentUser()?.id;
    const map = new Map<string, SessionPollDto>();
    for (const r of results) {
      if (r.status !== 'fulfilled' || !r.value.poll) continue;
      // Ne compte que les polls où l'utilisateur courant a encore au moins une option sans réponse.
      if (userId && !hasUnansweredOptions(r.value.poll, userId)) continue;
      map.set(r.value.id, r.value.poll);
    }
    this.openPolls.set(map);
  }
}
