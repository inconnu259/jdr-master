import { Component, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { firstValueFrom } from 'rxjs';
import type { DaySlot, PartieMemberDto, PollOptionDto, SessionPollDto, VoteAnswer } from '@master-jdr/shared';
import { getMissingVoters, getMissingVotersForOption } from '../../../core/poll/poll.util';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { ConfirmDialog } from '../../parties/confirm-dialog/confirm-dialog';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin', AFTERNOON: 'Après-midi', EVENING: 'Soirée', FULL_DAY: 'Journée',
};

const ANSWER_LABELS: Record<VoteAnswer, string> = {
  YES: 'Oui', NO: 'Non', MAYBE: 'Peut-être',
};

const ANSWER_ICONS: Record<VoteAnswer, string> = {
  YES: '✅', NO: '❌', MAYBE: '❔',
};

@Component({
  selector: 'app-poll-status',
  standalone: true,
  imports: [MatButtonModule],
  templateUrl: './poll-status.html',
  styleUrl: './poll-status.scss',
})
export class PollStatusPanel {
  readonly poll = input.required<SessionPollDto>();
  /** true pendant qu'une action (choix/annulation) est en cours côté parent — désactive le bouton pour éviter une double requête. */
  readonly busy = input(false);
  readonly members = input<PartieMemberDto[]>([]);

  readonly chosen = output<string>();

  protected readonly theme = inject(ThemeToneService);
  private readonly dialog = inject(MatDialog);

  /** Garde locale contre un double-clic ouvrant deux dialogues avant qu'Angular ne redessine [disabled]. */
  protected readonly dialogPending = signal(false);

  readonly SLOT_LABELS = SLOT_LABELS;
  readonly ANSWER_LABELS = ANSWER_LABELS;
  readonly ANSWER_ICONS = ANSWER_ICONS;

  protected formatDate(iso: string): string {
    const d = new Date(iso);
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC',
    }).format(d);
  }

  protected countByAnswer(opt: PollOptionDto, answer: VoteAnswer): number {
    return opt.votes.filter(v => v.answer === answer).length;
  }

  protected isAllYes(opt: PollOptionDto): boolean {
    return opt.votes.length > 0 && opt.votes.every(v => v.answer === 'YES');
  }

  /** true seulement si TOUS les membres ont voté sur TOUTES les options — condition du bandeau positif global. */
  protected readonly allResponded = computed(() =>
    this.members().length > 0 && getMissingVoters(this.poll(), this.members()).length === 0,
  );

  /** Granularité par date : qui n'a pas encore voté sur CETTE option précise (indépendant des autres options). */
  protected missingVotersForOption(opt: PollOptionDto): PartieMemberDto[] {
    return getMissingVotersForOption(opt, this.members());
  }

  protected missingAlert(pseudo: string): string {
    return this.theme.tone()['alert.missing_player'].replace('{name}', pseudo);
  }

  protected async onChooseClick(opt: PollOptionDto): Promise<void> {
    if (this.busy() || this.dialogPending()) return;
    this.dialogPending.set(true);
    try {
      const ref = this.dialog.open(ConfirmDialog, {
        data: {
          message: `Confirmer ${this.formatDate(opt.date)} — ${SLOT_LABELS[opt.slot]} comme date de la prochaine séance ?`,
          confirmLabel: this.theme.tone()['cta.choose_date'],
        },
      });
      const confirmed = await firstValueFrom(ref.afterClosed());
      if (confirmed) this.chosen.emit(opt.id);
    } finally {
      this.dialogPending.set(false);
    }
  }
}
