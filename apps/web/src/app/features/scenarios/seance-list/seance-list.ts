import { Component, OnInit, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import type {
  AvailableSlotDto,
  DaySlot,
  PartieMemberDto,
  ScenarioDto,
  SessionPollDto,
} from '@master-jdr/shared';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { PollService } from '../../../core/poll/poll.service';
import { PollCreationComponent } from '../../poll/poll-creation/poll-creation';
import { PollStatusPanel } from '../../poll/poll-status/poll-status';
import { PollResponseComponent } from '../../poll/poll-response/poll-response';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soirée',
  FULL_DAY: 'Journée',
};

/**
 * Liste des séances d'un scénario (Story 8.2) — délègue entièrement la sélection de date au
 * mécanisme de vote existant (PollCreationComponent/PollStatusPanel/PollResponseComponent, Epics
 * 1-3, aucune modification). AD-4 : jamais affiché pour CAMPAGNE_EPISODIQUE (Inscription à capacité
 * limitée à la place, Story 8.3, hors scope ici) — `isEpisodique` masque toute la section vote.
 */
@Component({
  selector: 'app-seance-list',
  imports: [MatButtonModule, PollCreationComponent, PollStatusPanel, PollResponseComponent],
  templateUrl: './seance-list.html',
  styleUrl: './seance-list.scss',
})
export class SeanceList implements OnInit {
  private readonly scenarios = inject(ScenariosService);
  private readonly pollSvc = inject(PollService);

  readonly scenario = input.required<ScenarioDto>();
  readonly partieId = input.required<string>();
  readonly isMj = input(false);
  readonly isEpisodique = input.required<boolean>();
  readonly members = input<PartieMemberDto[]>([]);

  readonly seanceLinked = output<ScenarioDto>();

  protected readonly pollActionPending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly availableSlots = signal<AvailableSlotDto[]>([]);
  /** Séance dont le panneau de création de vote est ouvert — un seul à la fois, fermé par défaut
   *  (contrairement à l'ancienne version qui l'affichait en permanence dès qu'une séance n'avait pas
   *  encore de vote, rendant les boutons Annuler/croix inertes puisqu'il n'y avait rien à fermer). */
  protected readonly openPanelSeanceId = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    if (!this.isMj()) return;
    try {
      const slots = await this.pollSvc.getAvailableSlots(this.partieId());
      this.availableSlots.set(slots.filter((s): s is AvailableSlotDto => 'members' in s));
    } catch {
      // Non-critique : le panneau de création affichera juste "Aucun créneau calculé disponible",
      // l'ajout manuel de créneaux personnalisés reste toujours possible.
    }
  }

  protected openPollPanel(seanceId: string): void {
    this.openPanelSeanceId.set(seanceId);
  }

  protected closePollPanel(): void {
    this.openPanelSeanceId.set(null);
  }

  protected async onPollCreated(seanceId: string, poll: SessionPollDto): Promise<void> {
    if (this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      const updated = await this.scenarios.linkSeancePoll(seanceId, poll.id);
      this.closePollPanel();
      this.seanceLinked.emit(updated);
    } catch {
      this.error.set('Impossible de lier ce vote à la séance. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  protected async onChoose(pollId: string, optionId: string): Promise<void> {
    if (this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      await this.pollSvc.chooseDate(this.partieId(), pollId, { optionId });
      await this.refreshScenario();
    } catch {
      this.error.set('Impossible de choisir cette date. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  protected async onClosePoll(pollId: string): Promise<void> {
    if (this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      await this.pollSvc.closePoll(this.partieId(), pollId);
      await this.refreshScenario();
    } catch {
      this.error.set('Impossible de clôturer le vote. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  protected onPollResponded(poll: SessionPollDto): void {
    this.seanceLinked.emit({
      ...this.scenario(),
      seances: this.scenario().seances.map((s) => (s.poll?.id === poll.id ? { ...s, poll } : s)),
    });
  }

  protected formatChosenDate(poll: SessionPollDto): string {
    if (!poll.chosenDate) return '';
    const d = new Date(poll.chosenDate);
    const dateStr = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(d);
    return poll.chosenSlot ? `${dateStr} — ${SLOT_LABELS[poll.chosenSlot]}` : dateStr;
  }

  /** `chooseDate`/`closePoll` ne renvoient pas le poll mis à jour (void) — sans ce rechargement, la
   *  séance restait affichée comme un vote OPEN avec les boutons de choix encore actifs après une
   *  action pourtant bien traitée côté serveur. */
  private async refreshScenario(): Promise<void> {
    try {
      const fresh = (await this.scenarios.listAll(this.partieId())).find(
        (s) => s.id === this.scenario().id,
      );
      if (fresh) this.seanceLinked.emit(fresh);
    } catch {
      this.error.set('Action effectuée, mais impossible de rafraîchir l’affichage. Rechargez la page.');
    }
  }
}
