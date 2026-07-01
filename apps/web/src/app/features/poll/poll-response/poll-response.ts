import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import type { CastVoteDto, DaySlot, SessionPollDto, VoteAnswer } from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { PollService } from '../../../core/poll/poll.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin', AFTERNOON: 'Après-midi', EVENING: 'Soirée', FULL_DAY: 'Journée',
};

@Component({
  selector: 'app-poll-response',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './poll-response.html',
  styleUrl: './poll-response.scss',
})
export class PollResponseComponent {
  readonly partieId = input.required<string>();
  readonly poll     = input.required<SessionPollDto>();

  readonly responded = output<SessionPollDto>();

  private readonly pollSvc = inject(PollService);
  private readonly authSvc = inject(AuthService);
  protected readonly theme = inject(ThemeToneService);
  private readonly snack   = inject(MatSnackBar);

  protected readonly pendingAnswers  = signal<Map<string, VoteAnswer>>(new Map());
  protected readonly failedOptionIds = signal<Set<string>>(new Set());
  protected readonly saving          = signal(false);
  protected readonly error           = signal<string | null>(null);

  readonly SLOT_LABELS = SLOT_LABELS;
  readonly VOTE_OPTIONS: VoteAnswer[] = ['YES', 'NO', 'MAYBE'];

  protected readonly isClosed    = computed(() => this.poll().status === 'CLOSED');
  protected readonly hasSelection = computed(() => this.pendingAnswers().size > 0);

  constructor() {
    // authSvc.currentUser() se peuple de façon asynchrone (App.ngOnInit lance loadSession()
    // sans l'attendre) — un ngOnInit classique risquerait de s'exécuter avant que l'utilisateur
    // soit connu, empêchant la surbrillance des votes déjà soumis (AC2). effect() se redéclenche
    // dès que currentUser() change. La lecture de poll() est délibérément untracked : on ne veut
    // resynchroniser pendingAnswers que sur la résolution de l'utilisateur courant, pas à chaque
    // remplacement de l'input poll (ex. après un vote, cf. onPollResponded).
    effect(() => {
      const userId = this.authSvc.currentUser()?.id;
      if (!userId) return;
      const poll = untracked(() => this.poll());
      const map = new Map<string, VoteAnswer>();
      for (const opt of poll.options) {
        const myVote = opt.votes.find(v => v.userId === userId);
        if (myVote) map.set(opt.id, myVote.answer);
      }
      this.pendingAnswers.set(map);
    });
  }

  protected setAnswer(optionId: string, answer: VoteAnswer): void {
    if (this.isClosed()) return;
    const m = new Map(this.pendingAnswers());
    m.set(optionId, answer);
    this.pendingAnswers.set(m);
  }

  protected getAnswer(optionId: string): VoteAnswer | null {
    return this.pendingAnswers().get(optionId) ?? null;
  }

  protected formatDate(iso: string): string {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    }).format(d);
  }

  protected async onConfirm(): Promise<void> {
    if (!this.hasSelection() || this.saving() || this.isClosed()) return;
    this.saving.set(true);
    this.error.set(null);
    this.failedOptionIds.set(new Set());

    const entries = [...this.pendingAnswers()];
    const results = await Promise.allSettled(
      entries.map(([optionId, answer]) =>
        this.pollSvc.castVote(this.partieId(), this.poll().id, { optionId, answer } satisfies CastVoteDto),
      ),
    );

    const failed = new Set<string>();
    results.forEach((result, i) => {
      if (result.status === 'rejected') failed.add(entries[i][0]);
    });
    this.failedOptionIds.set(failed);

    try {
      const refreshed = await this.pollSvc.getCurrentPoll(this.partieId());
      if (refreshed) this.responded.emit(refreshed);
    } catch {
      // Le refetch a échoué mais les votes ont potentiellement réussi — ne pas
      // afficher le succès sans confirmation, mais ne pas masquer non plus l'état des votes.
    }

    if (failed.size === 0) {
      this.snack.open(this.theme.tone()['success.vote_cast'], undefined, { duration: 3000 });
    } else {
      const successCount = entries.length - failed.size;
      this.error.set(`${successCount}/${entries.length} réponse(s) enregistrée(s). Réessayez pour les autres.`);
    }
    this.saving.set(false);
  }
}
