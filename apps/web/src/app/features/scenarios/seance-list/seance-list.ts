import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { Router } from '@angular/router';
import type {
  DaySlot,
  PartieMemberDto,
  ScenarioDto,
  SeanceDto,
  SessionPollDto,
} from '@master-jdr/shared';
import { AuthService } from '../../../core/auth/auth.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { PollService } from '../../../core/poll/poll.service';
import { composeSeanceInfo } from '../../calendar/day-detail.utils';
import { PollStatusPanel } from '../../poll/poll-status/poll-status';
import { PollResponseComponent } from '../../poll/poll-response/poll-response';
import { FillIndicator } from '../fill-indicator/fill-indicator';

/** Même forme que côté serveur (`set-infos-pratiques.dto.ts`) : sert uniquement à détecter une
 *  valeur stockée hors app (écriture directe en base) que le widget natif `type="time"` rendrait
 *  vide sans le signaler — jamais à revalider une saisie qui passe par ce composant. */
const HEURE_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soir',
  FULL_DAY: 'Journée',
};

/**
 * Liste des séances d'un scénario (Story 8.2, retravaillé Story 8.7/8.8) — la création de vote ne
 * vit plus ici (panneau `<app-poll-creation>` retiré, point d'entrée unique désormais le calendrier
 * via `goToCalendarForSeance`, cf. AC2/AC3 Story 8.7). AD-4 révisé (Story 8.8) : une séance
 * épisodique peut désormais avoir à la fois un vote (`PollStatusPanel`/`PollResponseComponent`,
 * choisit *quand*) et une inscription à capacité limitée (choisit *qui*) — les deux coexistent.
 */
@Component({
  selector: 'app-seance-list',
  imports: [MatButtonModule, PollStatusPanel, PollResponseComponent, FillIndicator],
  templateUrl: './seance-list.html',
  styleUrl: './seance-list.scss',
})
export class SeanceList {
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

  constructor() {
    // Story 19.1 (AC2) : réutilise le signal ScenariosService.changed déjà actif — SeanceList
    // n'ouvre AUCUNE connexion SSE propre, son parent (ScenarioEditor/ScenarioReadDialog,
    // toujours ouvert depuis ScenarioTimeline lui-même enfant de PartieDetail, Story 18.3)
    // maintient déjà la connexion partie:{id}. Réutilise refreshScenario() existante — pas de
    // nouvelle méthode.
    // Garde firstRun (même piège que partout ailleurs, cf. PartieDetail/CalendarView) : le signal
    // ScenariosService.changed peut déjà porter une valeur avant le montage — sans cette garde,
    // chaque SeanceList (une par séance affichée) déclenchait un refreshScenario() inutile dès sa
    // création, en plus de l'input `scenario` déjà à jour.
    let firstRun = true;
    effect(() => {
      this.scenarios.changed();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => void this.refreshScenario());
    });

    // Story 36.5 (revue de code) : un rechargement externe (SSE sans rapport, poll d'un autre
    // joueur…) ne doit pas écraser une saisie MJ en cours dans les champs d'informations
    // pratiques — même patron de brouillon que ScenarioEditor.applyScenario() : seule une valeur
    // serveur EFFECTIVEMENT différente de la précédente remplace le brouillon local.
    effect(() => {
      const s = this.scenario();
      untracked(() => this.syncInfosDrafts(s));
    });
  }

  private previousScenarioSeances: readonly SeanceDto[] | null = null;
  protected readonly infosDrafts = signal<
    Record<string, { heureRdv: string; lieu: string; notePratique: string }>
  >({});

  private syncInfosDrafts(s: ScenarioDto): void {
    const previous = this.previousScenarioSeances;
    this.previousScenarioSeances = s.seances;
    const next = { ...this.infosDrafts() };
    let touched = false;
    for (const seance of s.seances) {
      const prevSeance = previous?.find((p) => p.id === seance.id);
      const serverChanged =
        !prevSeance ||
        (prevSeance.heureRdv ?? '') !== (seance.heureRdv ?? '') ||
        (prevSeance.lieu ?? '') !== (seance.lieu ?? '') ||
        (prevSeance.notePratique ?? '') !== (seance.notePratique ?? '');
      if (serverChanged || !next[seance.id]) {
        next[seance.id] = {
          heureRdv: seance.heureRdv ?? '',
          lieu: seance.lieu ?? '',
          notePratique: seance.notePratique ?? '',
        };
        touched = true;
      }
    }
    if (touched) this.infosDrafts.set(next);
  }

  /** Valeur à afficher dans un champ d'informations pratiques : le brouillon local, jamais
   *  directement `seance.champ` (cf. `syncInfosDrafts`, garde anti-écrasement). */
  protected infoDraft(seanceId: string, field: 'heureRdv' | 'lieu' | 'notePratique'): string {
    return this.infosDrafts()[seanceId]?.[field] ?? '';
  }

  /** Non-null uniquement si `heureRdv` est renseignée mais ne respecte pas `HH:MM` — le widget
   *  natif `type="time"` l'afficherait vide sans distinction avec « jamais renseignée », et
   *  enregistrer sans y toucher effacerait silencieusement la valeur stockée. */
  protected malformedHeureRdv(seance: SeanceDto): string | null {
    const v = seance.heureRdv;
    return v && !HEURE_HH_MM.test(v) ? v : null;
  }

  protected readonly pollActionPending = signal(false);
  protected readonly error = signal<string | null>(null);
  /** Séance dont le formulaire de capacité est rouvert pour édition (AC6, Story 8.7) — un seul à la
   *  fois. Pré-rempli avec les valeurs déjà définies, contrairement à la création initiale. */
  protected readonly editingCapacitySeanceId = signal<string | null>(null);

  readonly SLOT_LABELS = SLOT_LABELS;

  // Story 8.7, AC2/AC3 : point d'entrée unique — envoie le MJ sur le calendrier (mode MJ) avec
  // cette séance pré-sélectionnée/verrouillée, plutôt qu'un panneau de création dupliqué ici.
  // Story 8.8 : ce même point d'entrée est désormais aussi utilisé pour l'épisodique.
  protected goToCalendarForSeance(seanceId: string): void {
    void this.router.navigate(['/parties', this.partieId(), 'calendar'], {
      queryParams: { seanceId },
    });
  }

  protected openCapacityEdit(seanceId: string): void {
    this.editingCapacitySeanceId.set(seanceId);
  }

  protected cancelCapacityEdit(): void {
    this.editingCapacitySeanceId.set(null);
  }

  // 🚨 Revue de code (deferred-work.md, 2026-08-24) : PAS de confirmation ici. `PollStatusPanel`
  // (`app-poll-status`, seul émetteur de `chosen`) ouvre déjà son propre `ConfirmDialog` stylé
  // AVANT d'émettre l'événement (`poll-status.ts:onChooseClick`) — un `window.confirm()` ajouté
  // ici (décision du 2026-08-24, retirée) doublait le prompt : deux confirmations successives
  // pour le même scellement. Toujours confirmé, une seule fois, via le MatDialog déjà en place —
  // même mécanisme que `CalendarView.onSealRequested()` (Agenda/grille).
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

  // Story 8.8, AC4 : détache le vote de la séance (et retire l'éventuelle dateValidee héritée)
  // pour permettre d'en relancer un nouveau — confirmation avant réinitialisation (action
  // destructive, même style que la suppression de séance à date validée, Story 8.7 revue).
  protected async onResetSeanceDate(seanceId: string): Promise<void> {
    if (this.pollActionPending()) return;
    if (!window.confirm('Réinitialiser la date de cette séance ? Un nouveau vote pourra être lancé.')) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      const updated = await this.scenarios.resetSeanceDate(seanceId);
      this.seanceLinked.emit(updated);
    } catch {
      this.error.set('Impossible de réinitialiser la date. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  // AC1 : aucune restriction de kind — s'applique aux branches linéaire ET épisodique.
  /** Story 36.5 — les trois champs partent ensemble. Une valeur vide devient `null` : c'est ce
   *  qui distingue « effacé » de « jamais rempli », et c'est le seul moyen de vider un champ. */
  protected async onSetInfosPratiques(
    seanceId: string,
    heureRdv: string,
    lieu: string,
    notePratique: string,
  ): Promise<void> {
    if (this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      const updated = await this.scenarios.setInfosPratiques(seanceId, {
        heureRdv: heureRdv.trim() || null,
        lieu: lieu.trim() || null,
        notePratique: notePratique.trim() || null,
      });
      this.seanceLinked.emit(updated);
    } catch {
      this.error.set('Impossible d’enregistrer les informations pratiques. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  /** Lecture côté joueur — même composition que le calendrier (AC10), niveau complet. */
  protected seanceInfos(seance: SeanceDto): string {
    return composeSeanceInfo(
      {
        seanceHeure: seance.heureRdv,
        seanceLieu: seance.lieu,
        seanceNote: seance.notePratique,
      },
      'full',
    );
  }

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

  // Bug fix (revue de code) : ScenariosService.listAll() déduplique désormais les appels en vol par
  // partieId (cf. scenarios.service.ts, sans traçabilité de causalité) — sans ce compteur de
  // génération, une réponse encore en vol au moment d'une mutation locale (ex. suppression de
  // séance) pouvait se résoudre APRÈS coup et réappliquer un état périmé (la séance supprimée
  // réapparaissait), écrasant silencieusement l'état pourtant à jour. Même pattern que
  // PartieDetail.reloadAnnouncements()/ScenarioTimeline.loadScenarios() (reqId/génération).
  private refreshGeneration = 0;

  /** `chooseDate`/`closePoll` ne renvoient pas le poll mis à jour (void) — sans ce rechargement, la
   *  séance restait affichée comme un vote OPEN avec les boutons de choix encore actifs après une
   *  action pourtant bien traitée côté serveur. */
  private async refreshScenario(): Promise<void> {
    const generation = ++this.refreshGeneration;
    try {
      const fresh = (await this.scenarios.listAll(this.partieId())).find(
        (s) => s.id === this.scenario().id,
      );
      if (generation !== this.refreshGeneration) return; // réponse obsolète, une requête plus récente est en vol
      if (fresh) this.seanceLinked.emit(fresh);
    } catch {
      if (generation !== this.refreshGeneration) return;
      // Retry unique après un court délai — un échec transitoire (ex. throttling API en rafale
      // sur un fan-out temps réel) ne doit pas laisser l'affichage figé sur l'état périmé.
      try {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const fresh = (await this.scenarios.listAll(this.partieId())).find(
          (s) => s.id === this.scenario().id,
        );
        if (generation !== this.refreshGeneration) return;
        if (fresh) this.seanceLinked.emit(fresh);
      } catch {
        if (generation !== this.refreshGeneration) return;
        this.error.set(
          'Action effectuée, mais impossible de rafraîchir l’affichage. Rechargez la page.',
        );
      }
    }
  }
}
