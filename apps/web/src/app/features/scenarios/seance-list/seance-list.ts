import { Component, OnInit, computed, inject, input, output, signal } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import type {
  AvailableSlotDto,
  DaySlot,
  PartieMemberDto,
  ScenarioDto,
  SeanceDto,
  SessionPollDto,
} from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { PollService } from '../../../core/poll/poll.service';
import { PollStatusPanel } from '../../poll/poll-status/poll-status';
import { PollResponseComponent } from '../../poll/poll-response/poll-response';
import { FillIndicator } from '../fill-indicator/fill-indicator';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soirée',
  FULL_DAY: 'Journée',
};

/**
 * Liste des séances d'un scénario (Story 8.2, retravaillé Story 8.7) — la création de vote pour le
 * linéaire/one-shot ne vit plus ici (panneau `<app-poll-creation>` retiré, point d'entrée unique
 * désormais le calendrier via `goToCalendarForSeance`, cf. AC2/AC3 Story 8.7). AD-4 : le mécanisme
 * de vote (PollStatusPanel/PollResponseComponent) reste inchangé et jamais affiché pour
 * CAMPAGNE_EPISODIQUE (Inscription à capacité limitée à la place, Story 8.3).
 */
@Component({
  selector: 'app-seance-list',
  imports: [MatButtonModule, PollStatusPanel, PollResponseComponent, FillIndicator],
  templateUrl: './seance-list.html',
  styleUrl: './seance-list.scss',
})
export class SeanceList implements OnInit {
  private readonly scenarios = inject(ScenariosService);
  private readonly pollSvc = inject(PollService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  protected readonly currentUserId = computed(() => this.auth.currentUser()?.id);

  readonly scenario = input.required<ScenarioDto>();
  readonly partieId = input.required<string>();
  readonly isMj = input(false);
  readonly isEpisodique = input.required<boolean>();
  readonly members = input<PartieMemberDto[]>([]);

  readonly seanceLinked = output<ScenarioDto>();

  protected readonly pollActionPending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly availableSlots = signal<AvailableSlotDto[]>([]);
  /** Séance dont le formulaire de capacité est rouvert pour édition (AC6, Story 8.7) — un seul à la
   *  fois. Pré-rempli avec les valeurs déjà définies, contrairement à la création initiale. */
  protected readonly editingCapacitySeanceId = signal<string | null>(null);

  readonly SLOT_LABELS = SLOT_LABELS;

  async ngOnInit(): Promise<void> {
    if (!this.isMj()) return;
    try {
      const slots = await this.pollSvc.getAvailableSlots(this.partieId());
      this.availableSlots.set(slots.filter((s): s is AvailableSlotDto => 'members' in s));
    } catch {
      // Non-critique : les créneaux calculés ne s'afficheront simplement pas.
    }
  }

  // Story 8.7, AC2/AC3 : point d'entrée unique — envoie le MJ sur le calendrier (mode MJ) avec
  // cette séance pré-sélectionnée/verrouillée, plutôt qu'un panneau de création dupliqué ici.
  protected goToCalendarForSeance(seanceId: string): void {
    void this.router.navigate(['/parties', this.partieId(), 'calendar'], {
      queryParams: { seanceId },
    });
  }

  protected formatSlotLabel(slot: AvailableSlotDto): string {
    const d = new Date(slot.date + 'T00:00:00Z');
    const dateStr = new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(d);
    return `${dateStr} — ${SLOT_LABELS[slot.slot]}`;
  }

  protected openCapacityEdit(seanceId: string): void {
    this.editingCapacitySeanceId.set(seanceId);
  }

  protected cancelCapacityEdit(): void {
    this.editingCapacitySeanceId.set(null);
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

  protected isInscrit(inscrits: { userId: string; pseudo: string }[]): boolean {
    const userId = this.currentUserId();
    return userId !== undefined && inscrits.some((i) => i.userId === userId);
  }

  /** Aucun état à mettre à jour — sert uniquement à déclencher un cycle de détection de
   *  changements zoneless sur `(input)`, pour que le bouton `[disabled]` (qui lit `minInput.value`/
   *  `maxInput.value` directement) reflète l'état courant des champs au fil de la saisie. */
  protected onCapacityFormInput(): void {}

  protected async onSetCapacity(seanceId: string, min: number, max: number): Promise<void> {
    if (this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      const updated = await this.scenarios.setSeanceCapacity(seanceId, min, max);
      this.editingCapacitySeanceId.set(null);
      this.seanceLinked.emit(updated);
    } catch {
      this.error.set('Impossible de définir la capacité. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  protected async onInscrire(seanceId: string): Promise<void> {
    if (this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      const updated = await this.scenarios.inscrire(seanceId);
      this.seanceLinked.emit(updated);
    } catch {
      this.error.set('Impossible de vous inscrire. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  protected async onDesinscrire(seanceId: string): Promise<void> {
    if (this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      const updated = await this.scenarios.desinscrire(seanceId);
      this.seanceLinked.emit(updated);
    } catch {
      this.error.set('Impossible de vous désinscrire. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  // Story 8.7, AC4 : `date` désormais choisie explicitement parmi les créneaux calculés (au lieu de
  // l'instant du clic).
  protected async onValiderDate(seanceId: string, date: string): Promise<void> {
    if (this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      const updated = await this.scenarios.validerDate(seanceId, date);
      this.seanceLinked.emit(updated);
    } catch {
      this.error.set('Impossible de valider cette date. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  // Story 8.7, AC5 : la toute première séance d'un scénario ne peut jamais être supprimée (garde
  // déjà posée côté backend, `window.confirm` ici évite un clic accidentel destructeur). Revue de
  // code : confirmation renforcée quand une date a déjà été validée (roster/planning déjà figés) —
  // suppression autorisée (décision utilisateur), mais le MJ doit être prévenu explicitement.
  protected async onDeleteSeance(seance: SeanceDto): Promise<void> {
    if (this.pollActionPending()) return;
    const hasValidatedDate = !!(seance.inscription?.dateValidee ?? seance.poll?.chosenDate);
    const message = hasValidatedDate
      ? 'Cette séance a une date validée. La supprimer quand même ? Cette action est définitive.'
      : 'Supprimer cette séance ? Cette action est définitive.';
    if (!window.confirm(message)) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      const updated = await this.scenarios.deleteSeance(seance.id);
      this.seanceLinked.emit(updated);
    } catch {
      this.error.set('Impossible de supprimer cette séance. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  // [ASSUMPTION] (cf. Dev Notes Story 8.3) : « Proposer une autre date » crée une nouvelle Seance
  // vierge (addSeance, Story 8.2, aucun plafond) plutôt que de ne rien faire — l'ancienne Seance et
  // ses Inscription restent intactes, non supprimées.
  protected async onProposerAutreDate(): Promise<void> {
    if (this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      const updated = await this.scenarios.addSeance(this.scenario().id);
      this.seanceLinked.emit(updated);
    } catch {
      this.error.set('Impossible de proposer une nouvelle date. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  // AC1 : aucune restriction de kind — s'applique aux branches linéaire ET épisodique.
  protected async onSetCompteRendu(seanceId: string, compteRendu: string): Promise<void> {
    if (this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      const updated = await this.scenarios.setCompteRendu(seanceId, compteRendu);
      this.seanceLinked.emit(updated);
    } catch {
      this.error.set('Impossible d’enregistrer le compte-rendu. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  protected formatValidatedDate(iso: string): string {
    return new Intl.DateTimeFormat('fr-FR', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    }).format(new Date(iso));
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
      this.error.set(
        'Action effectuée, mais impossible de rafraîchir l’affichage. Rechargez la page.',
      );
    }
  }
}
