import {
  Component,
  ElementRef,
  OnInit,
  ViewChild,
  computed,
  inject,
  input,
  signal,
} from '@angular/core';
import { Location } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  AggregatedSlotDto,
  AvailabilityDeclarationDto,
  AvailableSlotDto,
  CreateAvailabilityDto,
  DaySlot,
  PartieMemberDto,
  ScenarioDto,
  SeanceDto,
  SessionPollDto,
} from '@master-jdr/shared';
import { AvailabilityService } from '../../../core/availability/availability.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { PollService } from '../../../core/poll/poll.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { CalendarMonthView, SlotSelectedEvent } from '../calendar-month-view/calendar-month-view';
import { CalendarWeekView } from '../calendar-week-view/calendar-week-view';
import { ConstraintPanel } from '../constraint-panel/constraint-panel';
import { AvailableSlotsPanel } from '../available-slots/available-slots';
import { PollCreationComponent } from '../../poll/poll-creation/poll-creation';
import { PollStatusPanel } from '../../poll/poll-status/poll-status';
import { PollResponseComponent } from '../../poll/poll-response/poll-response';

/** Story 8.8, AC7/AC8 : un vote actif, étiqueté par son scénario (et sa séance si le scénario en a
 * plusieurs) — remplace le signal `activePoll` unique qui ne représentait qu'« un » poll par Partie. */
export interface ActivePollEntry {
  scenario: ScenarioDto;
  seance: SeanceDto;
  /** 1-based, position de la séance dans `scenario.seances` — même convention que SeanceList. */
  seanceIndex: number;
  poll: SessionPollDto;
}

/** Story 8.8, AC9 : une séance sans vote encore lancé, éligible pour le sélecteur de l'Oracle. */
export interface EligibleSeanceEntry {
  scenario: ScenarioDto;
  seance: SeanceDto;
  seanceIndex: number;
}

@Component({
  selector: 'app-calendar-view',
  standalone: true,
  imports: [
    CalendarMonthView,
    CalendarWeekView,
    ConstraintPanel,
    MatButtonToggleModule,
    MatButtonModule,
    AvailableSlotsPanel,
    PollCreationComponent,
    PollStatusPanel,
    PollResponseComponent,
  ],
  templateUrl: './calendar-view.html',
  styleUrl: './calendar-view.scss',
})
export class CalendarView implements OnInit {
  readonly mode = input<'personal' | 'mj'>('personal');

  @ViewChild('slotsPanel') private readonly slotsPanel?: ElementRef<HTMLElement>;

  private readonly availabilitySvc = inject(AvailabilityService);
  private readonly partiesSvc = inject(PartiesService);
  private readonly pollSvc = inject(PollService);
  private readonly scenariosSvc = inject(ScenariosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);
  protected readonly theme = inject(ThemeToneService);

  protected readonly declarations = signal<AvailabilityDeclarationDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly view = signal<'month' | 'week'>('month');
  protected readonly sharedDate = signal<Date>(new Date());

  protected readonly panelOpen = signal(false);
  protected readonly selectedDate = signal<Date>(new Date());
  protected readonly selectedSlot = signal<DaySlot>('FULL_DAY');
  protected readonly selectedExisting = signal<AvailabilityDeclarationDto | null>(null);
  protected readonly pendingDto = signal<CreateAvailabilityDto | null>(null);

  protected readonly partieId = signal<string | null>(null);
  protected readonly availableSlots = signal<(AvailableSlotDto | AggregatedSlotDto)[]>([]);
  protected readonly slotsLoading = signal(false);
  protected readonly slotsError = signal<string | null>(null);
  protected readonly heatmap = signal<AggregatedSlotDto[]>([]);

  protected readonly isMjMode = computed(() => this.mode() === 'mj');

  // Story 8.8, AC9 : source unique de vérité — `activePolls`/`eligibleSeances` en sont dérivés
  // (computed), pas peuplés séparément, pour rester cohérents après toute mutation locale
  // (ex. onPollResponded()).
  protected readonly scenarios = signal<ScenarioDto[]>([]);

  // Story 8.8, AC7/AC8 : liste des votes actifs (OPEN) de la Partie, un par Séance, étiquetés par
  // scénario — remplace l'ancien signal `activePoll` unique (`PollService.getCurrentPoll`), qui ne
  // représentait qu'« un » poll par Partie (invariant retiré, cf. Décision 2 de la story).
  protected readonly activePolls = computed<ActivePollEntry[]>(() => {
    const entries: ActivePollEntry[] = [];
    for (const scenario of this.scenarios()) {
      scenario.seances.forEach((seance, i) => {
        if (seance.poll?.status === 'OPEN') {
          entries.push({ scenario, seance, seanceIndex: i + 1, poll: seance.poll });
        }
      });
    }
    return entries;
  });

  // Story 8.8, AC9 : séances sans vote encore lancé — scénario non clôturé, aucun poll déjà lié
  // (OPEN ou CLOSED, createSeancePoll() le rejetterait de toute façon), aucune date déjà validée
  // (héritage `dateValidee`, cas rare depuis le retrait de validerDate()).
  protected readonly eligibleSeances = computed<EligibleSeanceEntry[]>(() => {
    const entries: EligibleSeanceEntry[] = [];
    for (const scenario of this.scenarios()) {
      if (scenario.status === 'PASSE') continue;
      scenario.seances.forEach((seance, i) => {
        if (seance.poll) return;
        if (seance.inscription?.dateValidee) return;
        entries.push({ scenario, seance, seanceIndex: i + 1 });
      });
    }
    return entries;
  });

  protected readonly pollPanelOpen = signal(false);
  // Story 8.7, AC1/AC2 : renseigné depuis ?seanceId=... (arrivée depuis SeanceList) — verrouille
  // PollCreationComponent sur cette séance, ouvre automatiquement le panneau sans re-clic du MJ.
  protected readonly lockedSeanceId = signal<string | null>(null);
  protected readonly members = signal<PartieMemberDto[]>([]);
  /** true pendant qu'une requête choose/close est en cours — évite une double action concurrente (double-clic, choix + annulation simultanés). */
  protected readonly pollActionPending = signal(false);

  protected readonly mjSlots = computed(() =>
    this.availableSlots().filter((s): s is AvailableSlotDto => 'members' in s),
  );

  private static todayIso(): string {
    return new Date().toISOString().substring(0, 10);
  }
  private static eightWeeksLaterIso(): string {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + 56);
    return d.toISOString().substring(0, 10);
  }

  protected readonly fromDateStr = signal(CalendarView.todayIso());
  protected readonly toDateStr = signal(CalendarView.eightWeeksLaterIso());

  private static readonly ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    const fromParam = this.route.snapshot.queryParamMap.get('from');
    const toParam = this.route.snapshot.queryParamMap.get('to');
    if (fromParam && CalendarView.ISO_DATE_RE.test(fromParam)) this.fromDateStr.set(fromParam);
    if (toParam && CalendarView.ISO_DATE_RE.test(toParam)) this.toDateStr.set(toParam);

    // Story 8.7, AC1/AC2 (corrigé en revue) : un vote de date exige toujours une séance — le
    // panneau ne s'ouvre que si `id` (partieId) est résolu ET que le mode est MJ (sinon un joueur
    // pourrait forger l'URL guild-calendar/profile pour voir le panneau MJ-only, même si le
    // backend bloque déjà l'écriture via getOwned).
    const seanceIdParam = this.route.snapshot.queryParamMap.get('seanceId');
    if (seanceIdParam && id && this.isMjMode()) {
      this.lockedSeanceId.set(seanceIdParam);
      this.pollPanelOpen.set(true);
    }

    if (id) {
      this.partieId.set(id);
      await Promise.all([
        this.router.navigate([], {
          relativeTo: this.route,
          queryParams: { from: this.fromDateStr(), to: this.toDateStr() },
          queryParamsHandling: 'merge',
          replaceUrl: true,
        }),
        this.loadDeclarations(),
        this.loadAvailableSlots(id, this.fromDateStr(), this.toDateStr()),
        this.loadHeatmap(id),
        this.loadScenarios(id),
      ]);
      if (this.isMjMode()) {
        this.members.set(await this.partiesSvc.members(id).catch(() => []));
      }
    } else {
      await this.loadDeclarations();
    }
  }

  // Story 8.8, AC7/AC8/AC9 : charge les scénarios/séances de la Partie via ScenariosService.listAll
  // (déjà utilisé par ScenarioTimeline) — évite un nouvel endpoint backend dédié. `activePolls` et
  // `eligibleSeances` (computed) en sont dérivés.
  private async loadScenarios(partieId: string): Promise<void> {
    try {
      this.scenarios.set(await this.scenariosSvc.listAll(partieId));
    } catch {
      // non-bloquant — la vue reste utilisable sans la liste des scénarios/votes actifs
    }
  }

  // Story 8.8, AC9 : sélection d'une séance éligible depuis l'Oracle — réutilise le flux existant
  // (verrouillage `lockedSeanceId`/`pollPanelOpen`, `PollCreationComponent`), aucun nouveau chemin
  // de création de vote.
  protected startVoteFor(seanceId: string): void {
    if (!seanceId) return;
    this.lockedSeanceId.set(seanceId);
    this.pollPanelOpen.set(true);
  }

  protected onSlotSelected(event: SlotSelectedEvent): void {
    this.selectedDate.set(event.date);
    this.selectedSlot.set(event.slot);
    this.selectedExisting.set(this.findMatchingDeclaration(event.date, event.slot));
    this.pendingDto.set(null);
    this.panelOpen.set(true);
  }

  protected onViewChange(value: string): void {
    this.view.set(value as 'month' | 'week');
  }

  protected async onMonthDateChange(d: Date): Promise<void> {
    this.sharedDate.set(d);
    const id = this.partieId();
    if (id) await this.loadHeatmap(id, d);
  }

  protected onWeekDateChange(d: Date): void {
    this.sharedDate.set(d);
  }

  protected onFormChanged(dto: CreateAvailabilityDto | null): void {
    this.pendingDto.set(dto);
  }

  protected closePanel(): void {
    this.panelOpen.set(false);
    this.pendingDto.set(null);
  }

  protected closePollPanel(): void {
    this.pollPanelOpen.set(false);
    this.lockedSeanceId.set(null);
  }

  protected async onPollCreated(_poll: SessionPollDto): Promise<void> {
    this.pollPanelOpen.set(false);
    this.lockedSeanceId.set(null);
    const id = this.partieId();
    if (id) await this.loadScenarios(id);
  }

  // Story 8.8, AC8 : met à jour uniquement la séance concernée (le poll répondu, identifié par
  // pollId) au sein de `scenarios` — pas de refetch complet, `activePolls` (computed) se
  // recalcule automatiquement.
  protected onPollResponded(poll: SessionPollDto): void {
    this.scenarios.update((list) =>
      list.map((scenario) => ({
        ...scenario,
        seances: scenario.seances.map((seance) =>
          seance.poll?.id === poll.id ? { ...seance, poll } : seance,
        ),
      })),
    );
  }

  protected async onClosePoll(pollId: string): Promise<void> {
    const id = this.partieId();
    if (!id || this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      await this.pollSvc.closePoll(id, pollId);
      await this.loadScenarios(id);
    } catch {
      this.error.set('Impossible de clôturer le vote. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  protected async onChooseDate(pollId: string, optionId: string): Promise<void> {
    const id = this.partieId();
    if (!id || this.pollActionPending()) return;
    this.pollActionPending.set(true);
    this.error.set(null);
    try {
      await this.pollSvc.chooseDate(id, pollId, { optionId });
      this.snack.open(this.theme.tone()['success.date_chosen'], undefined, { duration: 3000 });
      await this.loadScenarios(id);
    } catch {
      this.error.set('Impossible de choisir cette date. Réessayez.');
    } finally {
      this.pollActionPending.set(false);
    }
  }

  // Story 8.8, AC6 : ramène le MJ vers la page d'origine (fiche de partie, ou fiche de scénario si
  // ouvert depuis SeanceList via `goToCalendarForSeance`) — s'appuie sur l'historique de navigation
  // du navigateur plutôt que sur un paramètre de retour explicite, aucune page tierce ne pouvant
  // ouvrir l'Oracle autrement que par un lien direct depuis ces deux origines.
  protected goBack(): void {
    this.location.back();
  }

  protected async onPanelSaved(): Promise<void> {
    this.panelOpen.set(false);
    this.pendingDto.set(null);
    await this.loadDeclarations();
    await this.refreshMjPanels();
  }

  protected async onPanelDeleted(): Promise<void> {
    this.panelOpen.set(false);
    this.pendingDto.set(null);
    await this.loadDeclarations();
    await this.refreshMjPanels();
  }

  private async refreshMjPanels(): Promise<void> {
    const id = this.partieId();
    if (!id) return;
    await Promise.all([
      this.loadAvailableSlots(id, this.fromDateStr(), this.toDateStr()),
      this.loadHeatmap(id),
    ]);
  }

  protected scrollToSlots(): void {
    this.slotsPanel?.nativeElement.scrollIntoView({ behavior: 'smooth' });
  }

  protected onFromChange(event: Event): void {
    this.fromDateStr.set((event.target as HTMLInputElement).value);
  }

  protected onToChange(event: Event): void {
    this.toDateStr.set((event.target as HTMLInputElement).value);
  }

  protected async onSearch(): Promise<void> {
    const id = this.partieId();
    if (!id) return;
    const from = this.fromDateStr();
    const to = this.toDateStr();
    if (from > to) {
      this.slotsError.set('La date de début doit être avant ou égale à la date de fin.');
      return;
    }
    this.slotsError.set(null);
    await this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { from, to, weeks: null },
      queryParamsHandling: 'merge',
    });
    await this.loadAvailableSlots(id, from, to);
  }

  private async loadDeclarations(): Promise<void> {
    try {
      this.declarations.set(await this.availabilitySvc.getMyDeclarations());
    } catch {
      this.error.set('Impossible de charger les disponibilités.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadHeatmap(id: string, centerDate: Date = new Date()): Promise<void> {
    // Calcule exactement la grille du mois affiché (même logique que buildMonth : 6×7 = 42 jours)
    // centerDate est un Date UTC-midnight (émis par displayDateChange) → utiliser getUTC*
    const year = centerDate.getUTCFullYear();
    const month = centerDate.getUTCMonth();
    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const dow = firstOfMonth.getUTCDay();
    const startOffset = dow === 0 ? 6 : dow - 1;
    const gridStart = new Date(Date.UTC(year, month, 1 - startOffset));
    const gridEnd = new Date(
      Date.UTC(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + 41),
    );
    const toIso = (d: Date) =>
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
    try {
      this.heatmap.set(await this.pollSvc.getHeatmap(id, toIso(gridStart), toIso(gridEnd)));
    } catch {
      // non-bloquant — le heatmap est un overlay facultatif
    }
  }

  private async loadAvailableSlots(id: string, from?: string, to?: string): Promise<void> {
    this.slotsLoading.set(true);
    try {
      this.availableSlots.set(await this.pollSvc.getAvailableSlots(id, undefined, from, to));
    } catch {
      this.slotsError.set('Impossible de charger les créneaux.');
    } finally {
      this.slotsLoading.set(false);
    }
  }

  private findMatchingDeclaration(date: Date, slot: DaySlot): AvailabilityDeclarationDto | null {
    const now = new Date();
    const utcDate = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));

    return (
      this.declarations().find((d) => {
        if (new Date(d.expiresAt) <= now) return false;
        const slotMatch =
          slot === 'FULL_DAY' ? d.slot === 'FULL_DAY' : d.slot === 'FULL_DAY' || d.slot === slot;
        if (!slotMatch) return false;
        if (d.recurKind === 'RECURRING') {
          if (d.dayOfWeek !== utcDate.getUTCDay()) return false;
          if (d.startDate) {
            const start = new Date(d.startDate.substring(0, 10) + 'T00:00:00Z');
            if (utcDate < start) return false;
          }
          if (d.endDate) {
            const end = new Date(d.endDate.substring(0, 10) + 'T00:00:00Z');
            if (utcDate > end) return false;
          }
          return true;
        }
        // Normalise en UTC minuit pour éviter les décalages de fuseau horaire dans la string ISO
        const start = new Date(d.startDate!.substring(0, 10) + 'T00:00:00Z');
        const end = new Date(d.endDate!.substring(0, 10) + 'T00:00:00Z');
        return utcDate >= start && utcDate <= end;
      }) ?? null
    );
  }
}
