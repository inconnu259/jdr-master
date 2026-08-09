import {
  Component,
  DestroyRef,
  OnInit,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { DaySlot, InvitationDto, PartieDto, PartySignalCode } from '@master-jdr/shared';
import { MyPartiesService } from '../../core/my-parties/my-parties.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { PartySignalsService } from '../../core/parties/party-signals.service';
import { dominantSignal, sortByPriority } from '../../core/parties/party-signal-priority';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { AuthService } from '../../core/auth/auth.service';
import { RealtimeService, userTopic } from '../../core/realtime/realtime.service';
import { gameSystemName, partieKindLabel } from '../../core/parties/parties.util';
import { ContextualNavService } from '../../core/navigation/contextual-nav.service';

/** Signaux purement informatifs (jamais une action à faire) — exclus du regroupement « ce qui
 *  t'attend » (Task 7) et de la teinte de priorité (Task 6, cf. party-signal-priority.ts). */
const NON_ACTIONABLE_SIGNALS: readonly PartySignalCode[] = [
  'PROCHAINE_SEANCE_CONNUE',
  'PARTIE_TERMINEE',
];

/** Au plus 2 badges visibles, le reste résumé par un compteur (AC3). */
const MAX_VISIBLE_BADGES = 2;

/** Même patron que `partie-detail.ts` (SLOT_LABELS) — réutilisé ici pour le badge
 *  `PROCHAINE_SEANCE_CONNUE`, qui doit afficher la date réelle (DESIGN.md §2/mockup
 *  `q8-navigation.html`, ex. « 12 août, soirée »), pas un libellé générique. */
const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soirée',
  FULL_DAY: 'Journée',
};

/** Teinte de carte (DESIGN.md §7.2 StateRail) — les 4 mêmes teintes que la palette de statut du
 *  thème, quel que soit le mode d'affichage. Toujours renseignée : `tiles()` calcule une valeur
 *  pour chaque partie, il n'existe pas de cas « sans teinte ». */
export type TileTint = 'todo' | 'live' | 'soon' | 'done';

export interface PartieTileVm {
  partie: PartieDto;
  signals: PartySignalCode[];
  visibleSignals: PartySignalCode[];
  moreCount: number;
  dominant: PartySignalCode | null;
  tint: TileTint;
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule, NgTemplateOutlet],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly myPartiesSvc = inject(MyPartiesService);
  private readonly invitations = inject(InvitationsService);
  private readonly openPollsSvc = inject(OpenPollsService);
  private readonly partySignalsSvc = inject(PartySignalsService);
  protected readonly theme = inject(ThemeToneService);
  private readonly auth = inject(AuthService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly contextualNav = inject(ContextualNavService);

  protected readonly allParties = this.myPartiesSvc.allParties;
  protected readonly hasMjParties = this.myPartiesSvc.hasMjParties;
  protected readonly received = signal<InvitationDto[]>([]);
  protected readonly openPolls = this.openPollsSvc.openPolls;
  protected readonly system = gameSystemName;
  protected readonly kind = partieKindLabel;

  /** Une entrée par partie affichée (Tasks 6/7) — pure fonction de `allParties()` +
   *  `PartySignalsService.signals()`, aucun recalcul de `role`/`status` (AC4). */
  private readonly tiles = computed<PartieTileVm[]>(() => {
    const signalsMap = this.partySignalsSvc.signals();
    return this.allParties().map((partie) => {
      const signals = signalsMap.get(partie.id)?.signals ?? [];
      // PARTIE_TERMINEE est exclu des badges affichés (revue utilisateur post-29.7) : redondant
      // avec .status-indicator, déjà affiché à côté du titre pour toute partie TERMINEE.
      const displaySignals = signals.filter((s) => s !== 'PARTIE_TERMINEE');
      const sorted = sortByPriority(displaySignals);
      const visibleSignals = sorted.slice(0, MAX_VISIBLE_BADGES);
      const moreCount = Math.max(0, sorted.length - MAX_VISIBLE_BADGES);
      const tint: TileTint =
        partie.status === 'TERMINEE'
          ? 'done'
          : Dashboard.hasActionableSignal(signals)
            ? 'todo'
            : partie.status === 'EN_COURS'
              ? 'live'
              : 'soon';
      return {
        partie,
        signals,
        visibleSignals,
        moreCount,
        dominant: dominantSignal(displaySignals),
        tint,
      };
    });
  });

  private static hasActionableSignal(signals: readonly PartySignalCode[]): boolean {
    return signals.some((s) => !NON_ACTIONABLE_SIGNALS.includes(s));
  }

  /** Quatre intertitres (AC10) — décision d'implémentation (aucune AC ne tranche l'ordre exact
   *  entre « a un signal d'action » et le statut EN_COURS/A_VENIR) : une partie non terminée avec
   *  au moins un signal actionnable va dans « ce qui t'attend », quel que soit son statut ;
   *  sinon elle se range par statut. Une partie TERMINEE va toujours dans « terminées », même si
   *  elle porte un signal de fin actionnable (compte-rendu/rapport manquant) — cohérent avec AC5
   *  (une partie terminée ne porte plus de signal *d'action*, seulement des signaux de fin). */
  protected readonly awaitingTiles = computed(() =>
    this.tiles().filter(
      (t) => t.partie.status !== 'TERMINEE' && Dashboard.hasActionableSignal(t.signals),
    ),
  );
  protected readonly ongoingTiles = computed(() =>
    this.tiles().filter(
      (t) => t.partie.status === 'EN_COURS' && !Dashboard.hasActionableSignal(t.signals),
    ),
  );
  protected readonly upcomingTiles = computed(() =>
    this.tiles().filter(
      (t) => t.partie.status === 'A_VENIR' && !Dashboard.hasActionableSignal(t.signals),
    ),
  );
  protected readonly finishedTiles = computed(() =>
    this.tiles().filter((t) => t.partie.status === 'TERMINEE'),
  );

  /** Libellé de thème d'un code de signal — clé `partie.signal_<code>` en minuscule. */
  protected signalLabel(code: PartySignalCode): string {
    return this.theme.tone()[`partie.signal_${code.toLowerCase()}`] ?? code;
  }

  /** Gabarit « +{n} » (AC3) — même patron `.replace()` que `partie.notice_invited` ailleurs. */
  protected moreLabel(n: number): string {
    return this.theme.tone()['partie.signal_more_count'].replace('{n}', String(n));
  }

  /** Libellé d'un badge de signal — cas particulier `PROCHAINE_SEANCE_CONNUE` (Bug fix, revue
   *  utilisateur post-29.7) : affiche la date réelle (`Partie.nextSessionDate`/`nextSessionSlot`,
   *  déjà chargés, jamais recalculés — AD-3) plutôt qu'un libellé générique, conformément au
   *  mockup `q8-navigation.html` (« 12 août, soirée ») et à DESIGN.md §2/§3. Même patron de
   *  formatage que `partie-detail.ts` (`SLOT_LABELS` + `Intl.DateTimeFormat`). */
  protected badgeLabel(code: PartySignalCode, partie: PartieDto): string {
    if (code === 'PROCHAINE_SEANCE_CONNUE' && partie.nextSessionDate) {
      try {
        const date = new Intl.DateTimeFormat('fr-FR', {
          day: 'numeric',
          month: 'long',
          timeZone: 'UTC',
        }).format(new Date(partie.nextSessionDate));
        const slot = partie.nextSessionSlot ? `, ${SLOT_LABELS[partie.nextSessionSlot]}` : '';
        return `${date}${slot}`;
      } catch {
        return this.signalLabel(code);
      }
    }
    return this.signalLabel(code);
  }

  /** Teinte d'un badge (AC9 + retour utilisateur post-29.7) : `PROCHAINE_SEANCE_CONNUE` est une
   *  information, pas une action à faire — il ne doit pas porter la couleur d'urgence
   *  `--jdr-status-todo` comme les autres badges, mais `--jdr-status-soon` (« à venir »),
   *  cohérent avec la teinte de carte `.tile--soon`. */
  protected badgeTone(code: PartySignalCode): 'todo' | 'soon' {
    return code === 'PROCHAINE_SEANCE_CONNUE' ? 'soon' : 'todo';
  }

  /** Icône du signal non chromatique accompagnant la teinte de carte pour les tuiles sans badge
   *  visible (AC9 : jamais la couleur seule) — cf. `tintLabel()`. */
  protected tintIcon(tint: TileTint): string {
    return tint === 'live' ? 'play_circle' : tint === 'soon' ? 'schedule' : 'flag';
  }

  /** Libellé non chromatique doublant la teinte de carte `.tile--live`/`.tile--soon`/`.tile--closed`
   *  (Patch revue de code, Story 29.7 : ces tuiles pouvaient n'afficher qu'une couleur sans aucun
   *  badge quand la partie ne porte aucun signal, violant AC9/P-1). `.tile--awaiting` (todo) n'a pas
   *  besoin de ce fallback : elle n'existe que lorsqu'un signal actionnable est présent, donc au
   *  moins un badge est toujours visible. */
  protected tintLabel(tint: TileTint): string {
    if (tint === 'done') return this.theme.tone()['dashboard.status_closed_badge'];
    if (tint === 'live') return this.theme.tone()['dashboard.section_ongoing'];
    return this.theme.tone()['dashboard.section_upcoming'];
  }

  constructor() {
    // Story 21.1 (AC2) : réagit au signal générique InvitationsService.changed (RealtimeService).
    // PIÈGE (même classe que Story 20.1/20.2, mais SANS le piège de timing associé) : Dashboard a
    // DÉJÀ un chargement dédié dans ngOnInit(). La première exécution d'un effect() a lieu à la
    // CONSTRUCTION du composant — un garde firstRun neutralise cette première exécution pour
    // éviter un refetch redondant avec celui que ngOnInit() fait juste après.
    let firstRun = true;
    effect(() => {
      this.invitations.changed();
      if (firstRun) {
        firstRun = false;
        return;
      }
      untracked(() => void this.loadInvitations());
    });
  }

  async ngOnInit(): Promise<void> {
    this.contextualNav.set({ title: this.theme.tone()['nav.my_games'] });
    const id = this.auth.currentUser()?.id;
    if (id) {
      this.realtime.connect(userTopic(id));
      this.destroyRef.onDestroy(() => this.realtime.disconnect(userTopic(id)));
    }
    await this.loadInvitations();
  }

  async accept(inv: InvitationDto): Promise<void> {
    await this.invitations.accept(inv.id);
    this.received.update((list) => list.filter((i) => i.id !== inv.id));
    await this.myPartiesSvc.refreshPlayerParties();
  }

  async decline(inv: InvitationDto): Promise<void> {
    await this.invitations.decline(inv.id);
    this.received.update((list) => list.filter((i) => i.id !== inv.id));
  }

  private async loadInvitations(): Promise<void> {
    try {
      this.received.set(await this.invitations.listReceived());
    } catch {
      this.received.set([]);
    }
  }
}
