import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { Location } from '@angular/common';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatButtonModule } from '@angular/material/button';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatDialog } from '@angular/material/dialog';
import { CdkConnectedOverlay, type ConnectedPosition } from '@angular/cdk/overlay';
import { firstValueFrom } from 'rxjs';
import { ActivatedRoute, Router } from '@angular/router';
import type {
  AggregatedSlotDto,
  AvailKind,
  AvailabilityDeclarationDto,
  AvailableSlotDto,
  CalendarLayerKey,
  CreateAvailabilityBatchItem,
  CreateAvailabilityDto,
  DaySlot,
  MeCalendarDto,
  PartieMemberDto,
  ScenarioDto,
  SeanceDto,
  SessionPollDto,
  VoteAnswer,
} from '@master-jdr/shared';
import { CALENDAR_LAYER_KEYS, DEFAULT_CALENDAR_LAYER_KEYS } from '@master-jdr/shared';
import {
  AvailabilityService,
  ConflictError,
} from '../../../core/availability/availability.service';
import { AuthService } from '../../../core/auth/auth.service';
import { PartiesService } from '../../../core/parties/parties.service';
import { PollService } from '../../../core/poll/poll.service';
import { ScenariosService, matchesPartie } from '../../../core/scenarios/scenarios.service';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { ContextualNavService } from '../../../core/navigation/contextual-nav.service';
import { RealtimeService, partieTopic } from '../../../core/realtime/realtime.service';
import { CalendarMonthView, SlotSelectedEvent } from '../calendar-month-view/calendar-month-view';
import { CalendarWeekView, getWeekStart } from '../calendar-week-view/calendar-week-view';
import { CalendarAgendaView, type AgendaEntry } from '../calendar-agenda-view/calendar-agenda-view';
import { CalendarDetailRail } from '../calendar-detail-rail/calendar-detail-rail';
import {
  type RailTarget,
  buildDayDetail,
  entryCoversSlot,
  nextMeaningfulDate,
  toDateKey,
} from '../day-detail.utils';
import { CalendarLayerToggle } from '../calendar-layer-toggle/calendar-layer-toggle';
import { ConstraintPanel } from '../constraint-panel/constraint-panel';
import {
  ConflictDialog,
  type ConflictDialogData,
  type ConflictResolutionByIndex,
} from '../conflict-dialog/conflict-dialog';
import { type SelectedCell, buildBatchItems } from '../selection.utils';
import { AvailableSlotsPanel } from '../available-slots/available-slots';
import { VoteAnswerPicker } from '../vote-answer-picker/vote-answer-picker';
import type { VoteOptionActivatedEvent, VoteParticipation } from '../poll-track.utils';
import { PollCreationComponent } from '../../poll/poll-creation/poll-creation';
import { PollStatusPanel } from '../../poll/poll-status/poll-status';

/** Story 8.8, AC7/AC8 : un vote actif, étiqueté par son scénario (et sa séance si le scénario en a
 * plusieurs) — remplace le signal `activePoll` unique qui ne représentait qu'« un » poll par Partie. */
export interface ActivePollEntry {
  scenario: ScenarioDto;
  seance: SeanceDto;
  /** 1-based, position de la séance dans `scenario.seances` — même convention que SeanceList. */
  seanceIndex: number;
  poll: SessionPollDto;
}

/** Libellés des créneaux, pour NOMMER un créneau en conflit (Story 36.4, AC2) — le dialogue
 *  nomme, il ne compte pas. */
const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soir',
  FULL_DAY: 'Journée',
};

/**
 * Story 36.7 — les positions du sélecteur, dans l'ordre de préférence.
 *
 * Sous la bande d'abord (le geste vient d'en haut), au-dessus si la place manque en bas — cas
 * réel et fréquent : la dernière ligne d'une grille de six semaines touche le bas de l'écran.
 * `cdkConnectedOverlayPush` rattrape ensuite les débordements latéraux.
 */
const PICKER_POSITIONS: ConnectedPosition[] = [
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 4 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -4 },
  { originX: 'end', originY: 'bottom', overlayX: 'end', overlayY: 'top', offsetY: 4 },
  { originX: 'end', originY: 'top', overlayX: 'end', overlayY: 'bottom', offsetY: -4 },
];

const CALENDAR_CELL_DATE_FORMAT = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'short',
  day: 'numeric',
  month: 'long',
});

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
    CalendarAgendaView,
    CalendarDetailRail,
    CalendarLayerToggle,
    ConstraintPanel,
    MatButtonToggleModule,
    MatButtonModule,
    AvailableSlotsPanel,
    PollCreationComponent,
    PollStatusPanel,
    VoteAnswerPicker,
    CdkConnectedOverlay,
  ],
  templateUrl: './calendar-view.html',
  styleUrl: './calendar-view.scss',
})
export class CalendarView implements OnInit {
  readonly mode = input<'personal' | 'mj'>('personal');

  private readonly availabilitySvc = inject(AvailabilityService);
  private readonly authSvc = inject(AuthService);
  private readonly partiesSvc = inject(PartiesService);
  private readonly pollSvc = inject(PollService);
  private readonly scenariosSvc = inject(ScenariosService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly location = inject(Location);
  private readonly snack = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);
  protected readonly theme = inject(ThemeToneService);
  private readonly contextualNav = inject(ContextualNavService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly declarations = signal<AvailabilityDeclarationDto[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<string | null>(null);

  protected readonly view = signal<'month' | 'week' | 'agenda'>('month');
  protected readonly sharedDate = signal<Date>(new Date());

  // ─── Couches du calendrier (Story 30.6, AC1/AC3/AC4/AC7, encadré n°2) ──────
  // Signal purement local, jamais persisté par la bascule elle-même — seul l'écran Compte (Story
  // 30.4) écrit `defaultCalendarLayers`. Initialisé au montage depuis le défaut du compte.
  protected readonly activeLayers = signal<CalendarLayerKey[]>([]);
  // Contenu de GET /me/calendar (contexte personnel uniquement, AC8/AC9) — jamais peuplé en
  // contexte de partie.
  protected readonly meCalendar = signal<MeCalendarDto | null>(null);
  protected readonly meCalendarLoading = signal(false);

  /** 5 couches hors contexte de partie (disponibilite-groupe absente, AD-16/AC8), 6 en contexte
   *  de partie. */
  protected readonly availableLayerKeys = computed<CalendarLayerKey[]>(() =>
    this.partieId()
      ? [...CALENDAR_LAYER_KEYS]
      : CALENDAR_LAYER_KEYS.filter((k) => k !== 'disponibilite-groupe'),
  );

  private defaultLayersForContext(partieContext: boolean): CalendarLayerKey[] {
    const base = this.authSvc.currentUser()?.defaultCalendarLayers ?? DEFAULT_CALENDAR_LAYER_KEYS;
    return partieContext ? base : base.filter((k) => k !== 'disponibilite-groupe');
  }

  protected toggleLayer(key: CalendarLayerKey): void {
    this.activeLayers.update((keys) =>
      keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key],
    );
  }

  protected isLayerActive(key: CalendarLayerKey): boolean {
    return this.activeLayers().includes(key);
  }

  /** AC4/AC7 : comparaison d'ensemble complète (ajouts ET retraits), pas seulement les couches
   *  ajoutées — un retrait doit rester détecté (encadré n°2). */
  protected readonly isOverridden = computed(() => {
    const current = this.activeLayers();
    const def = this.defaultLayersForContext(!!this.partieId());
    if (current.length !== def.length) return true;
    const defSet = new Set(def);
    return current.some((k) => !defSet.has(k));
  });

  /** Aucun appel réseau : réaffecte l'état local depuis le défaut du compte (encadré n°2). */
  protected resetToDefault(): void {
    this.activeLayers.set(this.defaultLayersForContext(!!this.partieId()));
  }

  protected readonly visibleDeclarations = computed<AvailabilityDeclarationDto[]>(() => {
    const active = this.activeLayers();
    const showAvail = active.includes('mes-disponibilites');
    const showUnavail = active.includes('mes-indisponibilites');
    return this.declarations().filter((d) => (d.kind === 'AVAILABLE' ? showAvail : showUnavail));
  });

  /** Garde anti-double-ouverture du dialogue de résolution (Story 36.4). */
  private readonly conflictDialogOpen = signal(false);

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
  // (computed), pas peuplés séparément, pour rester cohérents après tout rechargement.
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

  // Story 30.6, AC4/AC2 : séances de mes parties dont l'inscription est ouverte — dérivation
  // séparée de `eligibleSeances()` (qui sert un besoin différent, MJ-only : lancer un vote).
  // Même règle que `buildOpenInscriptionsLayer` côté serveur (Story 30.5) : `inscription.max`
  // défini, aucune date validée (ni poll.chosenDate ni inscription.dateValidee).
  private openInscriptionSeances(): { scenario: ScenarioDto; seance: SeanceDto }[] {
    const out: { scenario: ScenarioDto; seance: SeanceDto }[] = [];
    for (const scenario of this.scenarios()) {
      for (const seance of scenario.seances) {
        if (seance.inscription?.max == null) continue;
        const validated = seance.poll?.chosenDate ?? seance.inscription?.dateValidee;
        if (validated) continue;
        out.push({ scenario, seance });
      }
    }
    return out;
  }

  // Story 30.6, Task 6/AC2 : liste chronologique unique fusionnant les couches actives — deux
  // chemins de source distincts selon le contexte (encadré n°1) :
  // - Contexte de partie (`partieId()` renseigné) : dérivée des signaux déjà chargés par cette
  //   page (`scenarios`, `activePolls`, `availableSlots`/`heatmap`), aucun appel réseau de plus
  //   (AC9).
  // - Contexte personnel (`partieId()` absent) : dérivée de `meCalendar()` (Story 30.5, AC8), qui
  //   porte déjà `mes-seances`/`votes-en-cours`/`inscriptions-ouvertes` filtrées par plage.
  //
  // Story 36.1, encadré n°2 : la dérivation est faite UNE SEULE FOIS, sans filtrage par couche.
  // Deux consommateurs en dépendent, avec des besoins opposés :
  //  - la vue Agenda ne veut que les couches actives (`agendaEntries()`, ci-dessous) ;
  //  - le rail de détail a besoin des entrées NON filtrées, parce qu'une séance dont la couche
  //    est éteinte doit continuer de rendre son créneau indisponible (FR-50 / AC6). Filtrer ici
  //    ferait disparaître l'indisponibilité en même temps que le titre.
  // Le filtrage par couche vit donc en aval, et seulement sur ce qui est NOMMÉ.
  private readonly allCalendarEntries = computed<AgendaEntry[]>(() => {
    const entries: AgendaEntry[] = [];
    const pid = this.partieId();

    if (pid) {
      for (const scenario of this.scenarios()) {
        for (const seance of scenario.seances) {
          const date = seance.poll?.chosenDate ?? seance.inscription?.dateValidee;
          if (!date) continue;
          entries.push({
            key: `seance-${seance.id}`,
            type: 'mes-seances',
            date: date.substring(0, 10),
            label: scenario.title,
            detail: seance.poll?.chosenSlot ?? undefined,
            slot: seance.poll?.chosenSlot ?? 'FULL_DAY',
            // AC7 : en contexte de partie, `scenarios()` ne contient QUE les scénarios de cette
            // partie — une séance d'une autre partie n'arrive jamais ici, et n'est donc ni
            // nommée ni navigable. Elle n'existe que sous forme d'indisponibilité anonyme,
            // dérivée côté serveur (AD-9).
            partieId: pid,
            scenarioId: scenario.id,
            seanceId: seance.id,
            // Story 36.5 — gratuits ici : le SeanceDto complet est déjà chargé.
            seanceHeure: seance.heureRdv,
            seanceLieu: seance.lieu,
            seanceNote: seance.notePratique,
          });
        }
      }
      // Story 36.6, AC8 — UNE entrée par OPTION, jamais une par sondage. Avant cette story, un
      // vote proposant vendredi ET samedi ne marquait que le vendredi : l'entrée unique portait
      // la date de la PREMIÈRE option, et tous les autres créneaux proposés restaient muets en
      // Mois, en Semaine et au rail. C'est ce que corrige l'éclatement ci-dessous.
      //
      // AD-20 : les compteurs et ma réponse se dérivent ici, côté client, de `PollOptionDto.votes`
      // — cet écran détient déjà la charge utile complète. Aucun appel réseau n'en part.
      const myId = this.authSvc.currentUser()?.id;
      for (const entry of this.activePolls()) {
        for (const option of entry.poll.options) {
          const mine = option.votes.find((v) => v.userId === myId);
          entries.push({
            key: `poll-${entry.poll.id}-${option.id}`,
            type: 'votes-en-cours',
            date: option.date.substring(0, 10),
            label: entry.scenario.title,
            // Story 36.6 — le CRÉNEAU, comme pour une séance. Le « N option(s) proposée(s) »
            // d'avant décrivait le SONDAGE ; répété sur chacune de ses options éclatées, il
            // devenait un bruit trompeur (constaté à l'œil dans l'Agenda). Ce que la ligne doit
            // dire, c'est le créneau qu'elle propose — traduit, comme SLOT_LABELS le fait déjà
            // pour les séances (revue de code du 36.6 : le code brut fuitait ici).
            detail: SLOT_LABELS[option.slot],
            slot: option.slot,
            vote: {
              // Story 36.7 — le triplet d'identité de l'action. En contexte de partie il vient de
              // la route ; il est porté jusqu'à la bande pour que le sélecteur de réponse n'ait
              // rien à recomposer.
              partieId: pid,
              pollId: entry.poll.id,
              optionId: option.id,
              yes: option.votes.filter((v) => v.answer === 'YES').length,
              maybe: option.votes.filter((v) => v.answer === 'MAYBE').length,
              no: option.votes.filter((v) => v.answer === 'NO').length,
              // Le dénominateur vient du serveur (`membersCount`) et JAMAIS de `members()`, qui
              // n'est chargé qu'en mode MJ : un joueur n'a aucun effectif en mémoire.
              total: entry.poll.membersCount,
              myAnswer: mine ? mine.answer : null,
            },
          });
        }
      }
      for (const { scenario, seance } of this.openInscriptionSeances()) {
        entries.push({
          key: `inscription-${seance.id}`,
          type: 'inscriptions-ouvertes',
          date: '',
          label: scenario.title,
          detail: `${seance.inscription!.inscrits.length}/${seance.inscription!.max} inscrits`,
        });
      }
      for (const slot of this.heatmap()) {
        if (slot.available === 0 && slot.unavailable === 0) continue;
        entries.push({
          key: `groupe-${slot.date}-${slot.slot}`,
          type: 'disponibilite-groupe',
          date: slot.date,
          label: `${slot.slot} — ${slot.available}/${slot.total} disponibles`,
          detail: slot.unavailable > 0 ? `${slot.unavailable} indisponible(s)` : undefined,
          slot: slot.slot,
        });
      }
    } else {
      const mc = this.meCalendar();
      if (mc) {
        for (const s of mc['mes-seances']) {
          entries.push({
            key: `seance-${s.seanceId}`,
            type: 'mes-seances',
            date: s.date,
            label: `${s.partieName} — ${s.scenarioTitle}`,
            detail: s.slot,
            slot: s.slot,
            partieId: s.partieId,
            scenarioId: s.scenarioId,
            seanceId: s.seanceId,
            // Story 36.5, AC6 — le second chemin d'alimentation. Sans ces trois lignes ET
            // l'enrichissement de MyCalendarSeanceEntry côté serveur, les informations pratiques
            // marcheraient en contexte de partie et manqueraient sur profile/calendar.
            seanceHeure: s.heureRdv,
            seanceLieu: s.lieu,
            seanceNote: s.notePratique,
          });
        }
        // Story 36.6, AC8/AC6 — même éclatement par option qu'en contexte de partie, mais les
        // agrégats sont ici SERVIS (D-17) : le calendrier personnel n'a pas la charge utile des
        // votants, et ne doit pas l'avoir (AD-9). L'appel unique existant les porte désormais ;
        // aucun appel supplémentaire n'est émis.
        for (const p of mc['votes-en-cours']) {
          // 🚨 Dégradation honnête, trouvée à la vérification visuelle : pendant un déploiement,
          // un client neuf peut interroger une API qui ne sert pas encore les agrégats. Sans
          // cette garde, le rail affichait « NaN / undefined ». On préfère NE PAS rendre de piste
          // plutôt qu'en rendre une vide, qui affirmerait faussement « personne n'a répondu ».
          const servedAggregates = typeof p.membersCount === 'number';
          for (const option of p.options) {
            entries.push({
              // `date`/`slot` sont toujours servis, même par une API dégradée (pré-36.6) —
              // contrairement à `optionId`, absent de cette forme. Une clé bâtie sur `optionId`
              // collisionnerait alors entre toutes les options d'un même vote (revue de code du
              // 36.6).
              key: `poll-${p.pollId}-${option.date}-${option.slot}`,
              type: 'votes-en-cours',
              date: option.date,
              label: p.partieName,
              // Idem contexte de partie (cf. commentaire ci-dessus, ligne ~332).
              detail: SLOT_LABELS[option.slot],
              slot: option.slot,
              vote: !servedAggregates
                ? undefined
                : {
                    // Story 36.7 — ici le `partieId` ne peut PAS venir de la route : le
                    // calendrier personnel agrège plusieurs parties. Il vient de l'entrée
                    // elle-même (`MyCalendarPollEntry.partieId`), et c'est le seul endroit de
                    // l'application où voter dans la mauvaise partie serait possible.
                    partieId: p.partieId,
                    pollId: p.pollId,
                    optionId: option.optionId,
                    yes: option.yes,
                    maybe: option.maybe,
                    no: option.no,
                    total: p.membersCount,
                    myAnswer: option.myAnswer,
                  },
            });
          }
        }
        for (const i of mc['inscriptions-ouvertes']) {
          entries.push({
            key: `inscription-${i.seanceId}`,
            type: 'inscriptions-ouvertes',
            date: '',
            label: `${i.partieName} — ${i.scenarioTitle}`,
            detail: `${i.inscritsCount}/${i.inscriptionMax} inscrits`,
          });
        }
      }
    }

    for (const d of this.declarations()) {
      entries.push({
        key: `decl-${d.id}`,
        type: d.kind === 'AVAILABLE' ? 'mes-disponibilites' : 'mes-indisponibilites',
        date: d.startDate ?? '',
        label: d.recurKind === 'RECURRING' ? 'Récurrent' : 'Ponctuel',
        detail: d.slot,
        slot: d.slot,
      });
    }

    return entries;
  });

  // Story 30.6, Task 6/AC2 : liste chronologique unique fusionnant les couches ACTIVES.
  // Le filtre par type est exactement équivalent à l'ancien gating bloc par bloc, y compris pour
  // les déclarations (dont `visibleDeclarations()` applique le même mapping kind → couche).
  protected readonly agendaEntries = computed<AgendaEntry[]>(() => {
    const active = new Set(this.activeLayers());
    return this.allCalendarEntries().filter((e) => active.has(e.type));
  });

  /** Story 36.2 — les entrées **non filtrées** transmises à la vue Mois, qui arbitre la préséance
   *  bande par bande. Volontairement distinct d'`agendaEntries()` : la case doit continuer de
   *  rendre un créneau indisponible quand la couche « mes séances » est éteinte (FR-50), ce
   *  qu'une liste déjà filtrée rendrait impossible. */
  protected readonly calendarEntries = computed<AgendaEntry[]>(() => this.allCalendarEntries());

  // ─── Rail de détail (Story 36.1) ──────────────────────────────────────────
  // Signaux DÉDIÉS, distincts de `selectedDate`/`selectedSlot` : ces derniers appartiennent au
  // ConstraintPanel et sont liés à `panelOpen`/`closePanel()`. Les réutiliser viderait le rail à
  // chaque fermeture du panneau (encadré n°1, piège n°1).
  protected readonly railDate = signal<Date | null>(null);
  protected readonly railSlot = signal<DaySlot | null>(null);

  /** AC3 — au repos, le prochain jour portant quelque chose ; à défaut, aujourd'hui (jamais un
   *  rail blanc). Dérivé de la liste COMPLÈTE (`allCalendarEntries()`), pas des couches actives :
   *  le rail suit, il ne se commande pas — désactiver une couche ne doit pas le faire sauter vers
   *  un autre jour. */
  private readonly railDateKey = computed<string>(() => {
    const touched = this.railDate();
    if (touched) return toDateKey(touched);
    const todayKey = toDateKey(new Date());
    return nextMeaningfulDate(this.allCalendarEntries(), todayKey) ?? todayKey;
  });

  /** AC5 — purement dérivé des signaux déjà chargés : aucun appel réseau n'part d'ici. */
  protected readonly railDetail = computed(() =>
    buildDayDetail(
      this.railDateKey(),
      this.allCalendarEntries(),
      this.activeLayers(),
      this.visibleDeclarations(),
    ),
  );

  // Story 30.6, revue de code (AC1) : marqueur Mois/Semaine pour la couche `mes-seances` — dérivé
  // d'agendaEntries() pour ne jamais dupliquer la logique de source (AD-17). `inscriptions-ouvertes`
  // n'a structurellement pas de date (aucune séance validée), reste Agenda-only.
  protected readonly seanceMarkerDates = computed<Set<string>>(() => {
    const dates = new Set<string>();
    for (const entry of this.agendaEntries()) {
      if (entry.type === 'mes-seances' && entry.date) dates.add(entry.date);
    }
    return dates;
  });

  protected readonly pollPanelOpen = signal(false);
  // Story 8.7, AC1/AC2 : renseigné depuis ?seanceId=... (arrivée depuis SeanceList) — verrouille
  // PollCreationComponent sur cette séance, ouvre automatiquement le panneau sans re-clic du MJ.
  protected readonly lockedSeanceId = signal<string | null>(null);
  protected readonly members = signal<PartieMemberDto[]>([]);
  /** true pendant qu'une requête choose/close est en cours — évite une double action concurrente (double-clic, choix + annulation simultanés). */
  protected readonly pollActionPending = signal(false);

  // ─── Story 36.7 — le sélecteur de réponse de vote ─────────────────────────
  // UN SEUL sélecteur pour les quatre surfaces (case du Mois, cellule de Semaine, rail, Agenda) :
  // elles signalent l'option activée, c'est ici qu'on l'ouvre et qu'on écrit. Deux
  // implémentations produiraient deux façons de répondre selon l'écran.
  //
  // 🚨 L'ancre est l'élément DÉJÀ RENDU que la surface a touché (bande, cellule, bouton de
  // ligne) — jamais un nœud ajouté pour l'occasion : un nœud de plus dans une cellule casserait
  // le hit-test du glissement, et aucun test ne le verrait.
  protected readonly pickerVote = signal<VoteParticipation | null>(null);
  protected readonly pickerAnchor = signal<HTMLElement | null>(null);
  protected readonly pickerLabel = signal('');
  /** L'élément à qui rendre le focus à la fermeture — sans quoi un utilisateur clavier retombe
   *  en haut du document (AC7). */
  private pickerReturnFocus: HTMLElement | null = null;
  protected readonly PICKER_POSITIONS = PICKER_POSITIONS;

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

  constructor() {
    // Story 19.1 (AC3) : un vote/une clôture/l'ouverture d'un nouveau sondage émettent déjà sur
    // partie:{id} (Story 18.1, PollService/ScenariosService backend) — recharge à la fois les
    // scénarios/séances (ScenariosService, pour activePolls/eligibleSeances) ET les créneaux
    // calculés/heatmap (PollService, non concerné par ScenariosService.changed mais recalculés
    // par la même mutation sous-jacente) : réutilise loadScenarios()/refreshMjPanels() existantes.
    effect(() => {
      const change = this.scenariosSvc.changed();
      const id = this.partieId();
      if (!id || !matchesPartie(change, id)) return;
      untracked(() => {
        // Story 36.7 — un vote/retrait tiers peut avoir clos le sondage ou fait disparaître
        // l'option affichée : le sélecteur ouvert référencerait alors des données périmées, et
        // son ancre peut devenir un nœud détaché une fois la grille reconstruite ci-dessous.
        this.closePicker();
        void this.loadScenarios(id);
        void this.refreshMjPanels();
      });
    });

    // Bug fix (temps réel) : une déclaration de dispo/indispo d'un autre membre ne rafraîchissait
    // jamais le calendrier — AvailabilityService.changed() est un simple compteur (pas de
    // { partieId } comme ScenariosService), aucun filtrage matchesPartie possible ici ; sans risque
    // car ce composant ne reçoit l'événement SSE que sur SA propre connexion partie:{id} (le
    // serveur ne route jamais un événement d'une autre Partie vers cette connexion). Garde firstRun
    // (même piège que partout ailleurs, Stories 19.2/20.1/20.2/21.*) : le signal peut déjà porter
    // une valeur avant le montage.
    let firstRun = true;
    effect(() => {
      this.availabilitySvc.changed();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => void this.refreshMjPanels());
    });
  }

  async ngOnInit(): Promise<void> {
    this.contextualNav.set({ title: this.theme.tone()['nav.calendar'] });
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

    // Story 30.6, Task 1 : état des couches actives, initialisé depuis le défaut du compte —
    // jamais persisté par la bascule elle-même (encadré n°2). `disponibilite-groupe` retirée hors
    // contexte de partie (AC8).
    this.activeLayers.set(this.defaultLayersForContext(!!id));

    if (id) {
      this.partieId.set(id);
      this.realtime.connect(partieTopic(id));
      this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(id)));
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
      // Revue de code Story 29.4 : la navigation interne ci-dessus (mêmes route/composant,
      // seuls les query params from/to changent) déclenche NavigationStart -> clear() sur
      // ContextualNavService, qui vide le bandeau posé en tête de cette méthode — ngOnInit ne
      // se relance pas (même instance). Repositionner le titre juste après.
      this.contextualNav.set({ title: this.theme.tone()['nav.calendar'] });
      if (this.isMjMode()) {
        this.members.set(await this.partiesSvc.members(id).catch(() => []));
      }
    } else {
      // Story 30.6, AC8/AC9 : contexte personnel — un seul appel GET /me/calendar pour les 5
      // couches temporelles, jamais depuis un contexte de partie.
      await Promise.all([
        this.loadDeclarations(),
        this.loadMeCalendarForRange(this.fromDateStr(), this.toDateStr()),
      ]);
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

  /** Aucun état à mettre à jour — force un cycle de détection de changements zoneless sur
   *  (change), pour que [disabled] (qui lit seanceSelect.value directement) reflète la
   *  sélection courante. Même pattern que SeanceList.onCapacityFormInput(). */
  protected noop(): void {}

  /**
   * Story 36.1, AC2 : le rail suit tout toucher de case, « quelle que soit la raison du toucher ».
   *
   * ⚠️ Story 36.3, AC1 — ce handler est **amputé, pas supprimé**. Il n'ouvre plus le panneau de
   * déclaration : le toucher arme désormais une sélection dans la vue enfant, et le panneau se
   * rejoint par « Autre… » (`onDeclarationPanelRequested`). C'est le renversement demandé par
   * FR-57 : « la sélection est le geste, le panneau est le chemin avancé ». Les quatre lignes de
   * préparation du panneau ont migré telles quelles dans le handler ci-dessous.
   */
  protected onSlotSelected(event: SlotSelectedEvent): void {
    this.railDate.set(event.date);
    this.railSlot.set(event.slot);
  }

  /**
   * Story 36.3, AC4/AC10 — « Autre… » de la barre de sélection. **Seul chemin** vers
   * `ConstraintPanel` depuis cette story, donc seul chemin vers la contrainte récurrente
   * (story 1.7), la modification, la suppression et la découpe d'une récurrente.
   *
   * `selectedExisting` est indispensable : sans lui le panneau s'ouvrirait en création alors
   * qu'une déclaration couvre déjà la cellule, et la suppression comme la découpe deviendraient
   * inatteignables.
   */
  protected onDeclarationPanelRequested(event: SlotSelectedEvent): void {
    this.railDate.set(event.date);
    this.railSlot.set(event.slot);

    this.selectedDate.set(event.date);
    this.selectedSlot.set(event.slot);
    this.selectedExisting.set(this.findMatchingDeclaration(event.date, event.slot));
    this.pendingDto.set(null);
    this.panelOpen.set(true);
  }

  /** Story 36.1, AC11 — activer une ligne du rail ouvre LE SCÉNARIO qui porte la séance. Aucun
   *  écran de séance n'existe dans l'application : une séance n'a d'existence qu'à l'intérieur de
   *  son scénario, qui porte le contexte utile (chronologie, autres séances, compte rendu). */
  protected async onScenarioActivated(target: RailTarget): Promise<void> {
    await this.router.navigate(['/parties', target.partieId, 'scenarios', target.scenarioId]);
  }

  /** Story 36.4, D-18 — un conflit ne fait plus échouer le geste : il OUVRE une résolution.
   *
   *  Les deux vues effacent leur sélection AVANT de connaître le résultat (`onSelectionCommit`) :
   *  `event.cells` est donc la seule chose qui survive au 409, et c'est elle qui permet à la fois
   *  de NOMMER les créneaux (AC2) et de rejouer le lot résolu (AC12). On la retient ici.
   *
   *  Un geste produit au plus DEUX appels : le premier, puis le lot résolu. « Au cas par cas »
   *  n'en ajoute aucun — c'est un parcours interne au dialogue (AC10). */
  protected async onBatchDeclareRequested(event: {
    cells: SelectedCell[];
    kind: AvailKind;
  }): Promise<void> {
    const items = buildBatchItems(event.cells, event.kind);
    try {
      await this.availabilitySvc.createDeclarationBatch(items);
      await this.loadDeclarations();
      await this.refreshMjPanels();
    } catch (err) {
      if (err instanceof ConflictError) {
        await this.resolveBatchConflicts(err, event.cells, event.kind, items);
        return;
      }
      this.snack.open('Impossible d’enregistrer ces disponibilités. Réessayez.', undefined, {
        duration: 5000,
      });
    }
  }

  private async resolveBatchConflicts(
    err: ConflictError,
    cells: SelectedCell[],
    kind: AvailKind,
    items: CreateAvailabilityBatchItem[],
  ): Promise<void> {
    // AC14 : un conflit INTERNE au lot reste irrésoluble — aucun des deux créneaux n'est
    // « l'existant », « Remplacer » n'y aurait aucun sens. Le serveur le signe via `internal`
    // (Story 36.4 — remplace le sondage par préfixe d'id de la Story 30.2, revue de code).
    const resolvable = err.conflicts.filter((c) => typeof c.batchIndex === 'number' && !c.internal);
    if (resolvable.length === 0) {
      const labels = err.conflicts.map((c) => c.startDate ?? c.dayOfWeek).join(', ');
      this.snack.open(
        labels
          ? `Ces créneaux se contredisent entre eux (${labels}). Rien n'a été enregistré.`
          : "Ces créneaux se contredisent entre eux. Rien n'a été enregistré.",
        undefined,
        { duration: 5000 },
      );
      return;
    }

    // Garde anti-double-ouverture (patron `dialogPending()` de PollStatusPanel) : posée avant
    // tout await, sans quoi deux gestes rapprochés ouvriraient deux dialogues concurrents. Le
    // second geste est notifié plutôt que silencieusement perdu (revue de code Story 36.4).
    if (this.conflictDialogOpen()) {
      this.snack.open(
        'Une résolution de conflit est déjà en cours. Terminez-la avant de recommencer.',
        undefined,
        { duration: 5000 },
      );
      return;
    }
    this.conflictDialogOpen.set(true);
    try {
      const conflictedIndexes = new Set(resolvable.map((c) => c.batchIndex as number));
      const kindLabel = kind === 'AVAILABLE' ? 'disponible' : 'indisponible';
      const seanceExceptions = this.seanceCoveredCells(cells, conflictedIndexes);
      const data: ConflictDialogData = {
        kindLabel,
        intentLabel: this.describeSelection(cells),
        conflicts: resolvable.map((c) => ({
          batchIndex: c.batchIndex as number,
          label: this.describeCell(cells[c.batchIndex as number]),
        })),
        // Les cellules d'exception séance ne sont ni en conflit ni « libres » : le compteur
        // « Les N autres passent en… » ne doit pas les recompter (AC2/AC11, revue de code).
        freeCount: cells.length - conflictedIndexes.size - seanceExceptions.length,
        seanceExceptions,
      };

      const ref = this.dialog.open(ConflictDialog, { data });
      const resolution = (await firstValueFrom(
        ref.afterClosed(),
      )) as ConflictResolutionByIndex | null;
      if (!resolution) return;

      // Un seul appel portant TOUT le lot, chaque créneau en conflit muni de sa décision.
      const resolved = items.map((item, index) =>
        resolution[index] ? { ...item, conflictResolution: resolution[index] } : item,
      );
      try {
        await this.availabilitySvc.createDeclarationBatch(resolved);
      } catch (resubmitErr) {
        // Une résolution peut elle-même échouer sur un nouveau 409 (conflit interne révélé
        // seulement après résolution de l'externe, ou collision de course) : on ne l'avale pas
        // dans le message générique, on relance la résolution avec les conflits à jour
        // (revue de code Story 36.4).
        if (resubmitErr instanceof ConflictError) {
          this.conflictDialogOpen.set(false);
          await this.resolveBatchConflicts(resubmitErr, cells, kind, resolved);
          return;
        }
        throw resubmitErr;
      }
      await this.loadDeclarations();
      await this.refreshMjPanels();
    } catch {
      this.snack.open('Impossible d’enregistrer ces disponibilités. Réessayez.', undefined, {
        duration: 5000,
      });
    } finally {
      this.conflictDialogOpen.set(false);
    }
  }

  /** Créneaux de la sélection couverts par une séance et qui ne sont PAS en conflit : ce sont
   *  eux que le dialogue signale en exception (AC11). Ils ne peuvent structurellement pas
   *  figurer dans `conflicts` — l'indisponibilité dérivée d'une séance n'est jamais persistée
   *  (AD-9), il n'y a rien à écraser. Dérivé d'`allCalendarEntries()`, déjà en mémoire pour les
   *  deux contextes : aucun appel réseau supplémentaire. */
  private seanceCoveredCells(cells: SelectedCell[], conflicted: Set<number>): string[] {
    const seances = this.allCalendarEntries().filter((e) => e.type === 'mes-seances');
    if (seances.length === 0) return [];
    const labels: string[] = [];
    cells.forEach((cell, index) => {
      if (conflicted.has(index)) return;
      const key = toDateKey(cell.date);
      const covered = seances.some((e) => e.date === key && entryCoversSlot(e.slot, cell.slot));
      if (covered) labels.push(this.describeCell(cell));
    });
    return labels;
  }

  /** ⚠️ Le créneau est OMIS quand il vaut la journée entière. Vérifié à l'écran : « jeu. 20 août ·
   *  Journée · ven. 21 août · Journée · … » emploie le même séparateur entre la date et le créneau
   *  qu'entre deux créneaux, si bien qu'on ne distingue plus les items de la liste. Le contrat d'UI
   *  écrit d'ailleurs « Mar 4 · Ven 7 · Dim 9 », sans créneau. Il reste nommé dès qu'il porte une
   *  information (Matin / Après-midi / Soir). */
  private describeCell(cell: SelectedCell | undefined): string {
    if (!cell) return 'Créneau inconnu';
    const date = CALENDAR_CELL_DATE_FORMAT.format(cell.date);
    return cell.slot === 'FULL_DAY' ? date : `${date} · ${SLOT_LABELS[cell.slot]}`;
  }

  /** Rappelle l'intention du geste sous le titre du dialogue — « du 3 au 9 août, le soir ». */
  private describeSelection(cells: SelectedCell[]): string {
    if (cells.length === 0) return 'sur aucun créneau';
    if (cells.length === 1) return `le ${this.describeCell(cells[0])}`;
    const sorted = [...cells].sort((a, b) => a.date.getTime() - b.date.getTime());
    const from = CALENDAR_CELL_DATE_FORMAT.format(sorted[0].date);
    const to = CALENDAR_CELL_DATE_FORMAT.format(sorted[sorted.length - 1].date);
    return `sur ${cells.length} créneaux, du ${from} au ${to}`;
  }

  protected onViewChange(value: string): void {
    // Story 36.7 — changer de vue démonte la grille qui ancre le sélecteur ouvert.
    this.closePicker();
    this.view.set(value as 'month' | 'week' | 'agenda');
  }

  protected async onMonthDateChange(d: Date): Promise<void> {
    // Story 36.7 — naviguer de mois reconstruit les cases : l'ancre du sélecteur ouvert (une
    // bande déjà rendue) serait détachée sans que ses données restent valides.
    this.closePicker();
    this.sharedDate.set(d);
    const id = this.partieId();
    if (id) {
      await this.loadHeatmap(id, d);
    } else {
      // Story 30.6, AC10 : la plage affichée du calendrier personnel change — GET /me/calendar
      // est rappelé avec la nouvelle plage, jamais un cache silencieusement périmé.
      const { from, to } = CalendarView.monthGridRange(d);
      await this.loadMeCalendarForRange(from, to);
    }
  }

  protected async onWeekDateChange(d: Date): Promise<void> {
    // Story 36.7 — même motif que `onMonthDateChange`.
    this.closePicker();
    this.sharedDate.set(d);
    if (!this.partieId()) {
      const weekStart = getWeekStart(d);
      const weekEnd = new Date(
        Date.UTC(weekStart.getUTCFullYear(), weekStart.getUTCMonth(), weekStart.getUTCDate() + 6),
      );
      await this.loadMeCalendarForRange(
        CalendarView.toIsoDate(weekStart),
        CalendarView.toIsoDate(weekEnd),
      );
    }
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

  /**
   * Story 36.7, AC1 — une surface signale qu'une option de vote a été activée : on ouvre le
   * sélecteur, ancré sur l'élément touché.
   *
   * Les surfaces ont déjà tranché *quand* : elles n'émettent que si elles rendent une piste sur
   * ce créneau (couche allumée, rang gagnant `vote`, agrégats servis) et jamais pendant une
   * sélection armée. Rien de tout cela n'est réévalué ici — une seconde règle diveregerait de la
   * première au premier changement.
   */
  protected onVoteOptionActivated(event: VoteOptionActivatedEvent): void {
    this.pickerVote.set(event.vote);
    this.pickerAnchor.set(event.anchor);
    this.pickerLabel.set(this.composePickerLabel(event.date, event.slot));
    this.pickerReturnFocus = event.anchor;
  }

  /** « ven. 28 août — soir ». Composé ICI et non dans le sélecteur : les formateurs vivent déjà
   *  dans ce fichier, et le sélecteur reste un composant de rendu pur. */
  private composePickerLabel(date: Date, slot: DaySlot): string {
    const day = CALENDAR_CELL_DATE_FORMAT.format(date);
    return slot === 'FULL_DAY' ? day : `${day} — ${SLOT_LABELS[slot].toLowerCase()}`;
  }

  protected closePicker(): void {
    this.pickerVote.set(null);
    this.pickerAnchor.set(null);
    // Le focus revient à la ligne ou à la bande d'où l'on vient (AC7). `isConnected` : la surface
    // a pu être re-rendue entre-temps (rechargement après écriture).
    const back = this.pickerReturnFocus;
    this.pickerReturnFocus = null;
    if (back?.isConnected) back.focus();
  }

  /** AC4 — `Échap` ferme sans rien changer.
   *
   *  🚨 C'est bien le `keydown` de l'OVERLAY, jamais celui de la grille : celle-ci a déjà le
   *  sien, qui ANNULE la sélection en cours. Les deux ne doivent jamais se déclencher l'un
   *  l'autre. */
  protected onPickerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      event.stopPropagation();
      this.closePicker();
    }
  }

  /** AC8/AC9/AC10/AC11 — répondre. */
  protected async onVoteAnswerChosen(answer: VoteAnswer): Promise<void> {
    const vote = this.pickerVote();
    if (!vote || this.pollActionPending()) return;
    await this.writeVote(
      vote,
      () => this.pollSvc.castVote(vote.partieId, vote.pollId, { optionId: vote.optionId, answer }),
      'success.vote_cast',
      this.theme.tone()['poll.cast_error'],
    );
  }

  /** AC3 — retirer. **Seul chemin de retrait du calendrier** depuis cette story. */
  protected async onVoteWithdrawn(): Promise<void> {
    const vote = this.pickerVote();
    if (!vote || this.pollActionPending()) return;
    await this.writeVote(
      vote,
      () => this.pollSvc.withdrawVote(vote.partieId, vote.pollId, vote.optionId),
      'success.vote_withdrawn',
      this.theme.tone()['poll.withdraw_error'],
    );
  }

  /**
   * Le corps commun des deux écritures — un seul endroit où vivent la garde d'unicité, le
   * rechargement et le traitement de l'échec.
   *
   * 🚨 **On recharge, on ne reconstruit pas.** `PollResponseComponent` fabrique un
   * `SessionPollDto` optimiste à la main parce qu'il n'a pas de rechargement sous la main ; ici
   * `loadScenarios()` existe. Un rechargement coûte un appel sur une ACTION utilisateur (jamais
   * au rendu — l'AC7 de la 36.6 porte sur l'affichage) et garantit que les quatre surfaces
   * disent la même chose, la dérivation étant unique depuis la 36.6.
   *
   * 🚨 **On recharge AUSSI en cas d'échec** : un vote a pu être clos entre l'affichage et le
   * geste (le serveur répond alors 400), et le calendrier personnel n'est pas câblé sur SSE —
   * l'écran affichait donc peut-être un vote qui n'existe plus (AC10).
   */
  private async writeVote(
    vote: VoteParticipation,
    write: () => Promise<void>,
    successToneKey: 'success.vote_cast' | 'success.vote_withdrawn',
    errorMessage: string,
  ): Promise<void> {
    this.pollActionPending.set(true);
    this.error.set(null);
    let ok = false;
    try {
      await write();
      ok = true;
    } catch {
      this.error.set(errorMessage);
    } finally {
      this.pollActionPending.set(false);
    }
    // Revue de code 36.7 : fermer APRÈS l'écriture, jamais avant — sinon `[busy]` (câblé sur
    // `pollActionPending`) ne peut jamais s'afficher (le sélecteur a déjà disparu), et un échec
    // perd son contexte visuel au moment précis où l'utilisateur l'attend.
    this.closePicker();

    if (ok) this.snack.open(this.theme.tone()[successToneKey], undefined, { duration: 3000 });

    // Les deux contextes n'ont pas la même source : contexte de partie ⇒ les scénarios (d'où
    // `activePolls`) ; calendrier personnel ⇒ `GET /me/calendar`, qui n'a AUCUN temps réel.
    const partieId = this.partieId();
    if (partieId) await this.loadScenarios(partieId);
    else await this.loadMeCalendarForRange(this.fromDateStr(), this.toDateStr());
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
    // Revue de code Story 29.4 : même piège que ngOnInit — cette navigation interne vide le
    // bandeau contextuel via NavigationStart -> clear(), à repositionner.
    this.contextualNav.set({ title: this.theme.tone()['nav.calendar'] });
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

  private static toIsoDate(d: Date): string {
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
  }

  /** Calcule exactement la grille du mois affiché (même logique que buildMonth : 6×7 = 42 jours) —
   *  `centerDate` est un Date UTC-midnight (émis par displayDateChange) → utiliser getUTC*.
   *  Story 30.6 : extrait de `loadHeatmap` (comportement inchangé) pour être réutilisé par
   *  `onMonthDateChange` en contexte personnel (AC10). */
  private static monthGridRange(centerDate: Date): { from: string; to: string } {
    const year = centerDate.getUTCFullYear();
    const month = centerDate.getUTCMonth();
    const firstOfMonth = new Date(Date.UTC(year, month, 1));
    const dow = firstOfMonth.getUTCDay();
    const startOffset = dow === 0 ? 6 : dow - 1;
    const gridStart = new Date(Date.UTC(year, month, 1 - startOffset));
    const gridEnd = new Date(
      Date.UTC(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + 41),
    );
    return { from: CalendarView.toIsoDate(gridStart), to: CalendarView.toIsoDate(gridEnd) };
  }

  private async loadHeatmap(id: string, centerDate: Date = new Date()): Promise<void> {
    const { from, to } = CalendarView.monthGridRange(centerDate);
    try {
      this.heatmap.set(await this.pollSvc.getHeatmap(id, from, to));
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

  // Story 30.6, AC8/AC9/AC10 : un seul appel pour les couches temporelles du calendrier
  // personnel — jamais appelée en contexte de partie.
  // Revue de code : identifiant de requête incrémental — une navigation rapide (mois/semaine
  // suivant·e) peut déclencher plusieurs appels getMyCalendar() qui ne résolvent pas dans l'ordre ;
  // seule la réponse de la dernière requête émise est appliquée.
  private meCalendarReqId = 0;

  private async loadMeCalendarForRange(from: string, to: string): Promise<void> {
    this.fromDateStr.set(from);
    this.toDateStr.set(to);
    this.meCalendarLoading.set(true);
    const reqId = ++this.meCalendarReqId;
    try {
      const result = await this.availabilitySvc.getMyCalendar(from, to);
      if (reqId !== this.meCalendarReqId) return;
      this.meCalendar.set(result);
      this.error.set(null);
    } catch {
      if (reqId !== this.meCalendarReqId) return;
      // Revue de code (AC10) : ne jamais laisser la plage précédente affichée comme si elle
      // était à jour — signaler l'échec et vider les couches temporelles plutôt que de les
      // laisser silencieusement périmées.
      this.meCalendar.set(null);
      this.error.set('Impossible de charger le calendrier pour cette période.');
    } finally {
      if (reqId === this.meCalendarReqId) this.meCalendarLoading.set(false);
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
