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
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type {
  DaySlot,
  InvitationDto,
  ListViewMode,
  PartieDto,
  PartieSort,
  PartieStatus,
  PartySignalCode,
} from '@master-jdr/shared';
import { PARTIE_SORTS } from '@master-jdr/shared';
import {
  ListControlBar,
  type ListControlBarSortOption,
} from '../../shared/list-control-bar/list-control-bar';
import { MyPartiesService } from '../../core/my-parties/my-parties.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { PartySignalsService } from '../../core/parties/party-signals.service';
import {
  dominantCategory,
  dominantSignal,
  sortByPriority,
} from '../../core/parties/party-signal-priority';
import { pinFavorites, sortParties } from '../../core/parties/party-sort';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { AuthService } from '../../core/auth/auth.service';
import { AccountService } from '../../core/account/account.service';
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
  imports: [
    RouterLink,
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    NgTemplateOutlet,
    ListControlBar,
  ],
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
  private readonly account = inject(AccountService);
  private readonly realtime = inject(RealtimeService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly contextualNav = inject(ContextualNavService);

  protected readonly allParties = this.myPartiesSvc.allParties;
  protected readonly hasMjParties = this.myPartiesSvc.hasMjParties;
  protected readonly received = signal<InvitationDto[]>([]);
  protected readonly openPolls = this.openPollsSvc.openPolls;
  protected readonly system = gameSystemName;
  protected readonly kind = partieKindLabel;

  /** Critères de filtre (AC2/AC5) — purement transitoires (écran), jamais mémorisés sur le compte
   *  (EXPERIENCE.md §4.2 : seul le tri par défaut vit dans les préférences). */
  protected readonly roleFilter = signal<'all' | 'mj' | 'player'>('all');
  protected readonly statusFilter = signal<'all' | PartieStatus>('all');
  /** Révélation temporaire des parties terminées (AC6, « restent accessibles à la demande ») —
   *  n'écrit jamais la préférence `hideFinishedParties`, contrairement à la case à cocher. */
  protected readonly showFinishedOverride = signal(false);

  /** Recherche par nom (Story 29.9) — purement transitoire (écran), même statut que
   *  `roleFilter`/`statusFilter` : jamais mémorisée, jamais comptée dans `hasDeviatedFromDefault`
   *  (une saisie de consultation, pas un réglage — même décision que `MyCharacters`). */
  protected readonly searchQuery = signal('');

  protected readonly sortOptions = PARTIE_SORTS;
  /** Critère de tri effectif — lu depuis le compte, défaut 'urgence' si non connecté (garde). */
  protected readonly partiesSort = computed<PartieSort>(
    () => this.auth.currentUser()?.partiesSort ?? 'urgence',
  );
  protected readonly hideFinishedParties = computed(
    () => this.auth.currentUser()?.hideFinishedParties ?? false,
  );
  /** Mode d'affichage effectif (Story 29.9, AC1/AC4) — même patron que `partiesSort`. */
  protected readonly partiesViewMode = computed<ListViewMode>(
    () => this.auth.currentUser()?.partiesViewMode ?? 'medium',
  );
  /** Options de tri résolues pour `ListControlBar` — le composant partagé reste agnostique du
   *  thème, `Dashboard` résout déjà les libellés via `sortLabel()`. */
  protected readonly sortOptionsForBar = computed<ListControlBarSortOption[]>(() =>
    this.sortOptions.map((sort) => ({ value: sort, label: this.sortLabel(sort) })),
  );
  /** Seuls les filtres rôle/statut « dévient » d'un défaut (AC6) — `partiesSort`/`partiesViewMode`/
   *  `hideFinishedParties` se persistent immédiatement à chaque changement (patron fire-and-forget
   *  déjà établi) et ne peuvent donc jamais s'écarter d'eux-mêmes après coup (Dev Notes). */
  protected readonly hasDeviatedFromDefault = computed(
    () => this.roleFilter() !== 'all' || this.statusFilter() !== 'all',
  );
  /** Densité d'affichage (AC1) — une seule classe CSS pilotant toutes les grilles de la page. */
  protected readonly gridDensityClass = computed(() => `grid--${this.partiesViewMode()}`);
  /** Bouton de révélation (AC6) : visible seulement si le masquage est actif, pas déjà levé, et
   *  qu'il existe au moins une partie terminée à révéler **sous le filtre de rôle actif** — jamais
   *  un bouton dont le clic ne changerait rien (Review Findings : ignorer `roleFilter()` affichait
   *  le bouton même quand les seules parties terminées appartenaient au rôle filtré). */
  protected readonly hasHiddenFinished = computed(() => {
    if (!this.hideFinishedParties() || this.showFinishedOverride() || this.statusFilter() !== 'all')
      return false;
    const role = this.roleFilter();
    return this.allParties().some(
      (p) => p.status === 'TERMINEE' && (role === 'all' || p.role === role),
    );
  });

  /** Filtres rôle/statut + masquage des terminées (AC2, AC5, AC6) — appliqués côté front à la
   *  liste déjà chargée, jamais par un appel serveur supplémentaire. Le masquage ne s'applique
   *  que si le filtre statut est 'all' : filtrer explicitement sur « Terminées » est déjà une
   *  façon d'y accéder « à la demande », cohérente avec le bouton de révélation. */
  private readonly filteredParties = computed<PartieDto[]>(() => {
    const role = this.roleFilter();
    const status = this.statusFilter();
    const query = this.searchQuery().trim().toLowerCase();
    const hideFinished =
      this.hideFinishedParties() && !this.showFinishedOverride() && status === 'all';
    return this.allParties().filter((p) => {
      if (role !== 'all' && p.role !== role) return false;
      if (status !== 'all' && p.status !== status) return false;
      if (hideFinished && p.status === 'TERMINEE') return false;
      if (query && !p.name.toLowerCase().includes(query)) return false;
      return true;
    });
  });

  /** Une entrée par partie affichée (Tasks 6/7), désormais calculée sur `filteredParties()`
   *  (Story 29.8) plutôt que `allParties()` — badges/teinte/priorité inchangés (AC4). */
  private readonly tiles = computed<PartieTileVm[]>(() => {
    const signalsMap = this.partySignalsSvc.signals();
    return this.filteredParties().map((partie) => {
      const signals = signalsMap.get(partie.id)?.signals ?? [];
      // PARTIE_TERMINEE est exclu des badges affichés (revue utilisateur post-29.7) : redondant
      // avec .status-indicator, déjà affiché à côté du titre pour toute partie TERMINEE.
      const displaySignals = signals.filter((s) => s !== 'PARTIE_TERMINEE');
      const sorted = sortByPriority(displaySignals);
      const visibleSignals = sorted.slice(0, MAX_VISIBLE_BADGES);
      const moreCount = Math.max(0, sorted.length - MAX_VISIBLE_BADGES);
      // AC8 : ordre de priorité de teinte « bloque le démarrage » > « échéance »/« en retard ».
      // La palette de statut (--jdr-status-*, Story 29.0) est un invariant à 4 teintes ; faute
      // d'une 5e teinte dédiée (décision UX non tranchée, cf. Review Findings), « échéance » et
      // « en retard » partagent la teinte `soon`, distincte de `todo` réservée au blocage.
      const category = dominantCategory(displaySignals);
      const tint: TileTint =
        partie.status === 'TERMINEE'
          ? 'done'
          : category === 'blocking'
            ? 'todo'
            : category === 'deadline' || category === 'overdue'
              ? 'soon'
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

  /** Tri + favoris en tête (Story 29.8, AC1/AC3), appliqué une seule fois sur `tiles()` — jamais
   *  redondant avec les intertitres, qui filtrent ensuite ce même tableau déjà ordonné. Favoris
   *  toujours en tête au sein de n'importe quel sous-groupe : `pinFavorites()` est une partition
   *  stable sur tout le tableau, donc l'ordre relatif favori-avant-non-favori survit à un filtre
   *  ultérieur (Dev Notes : « appliquée après le tri, avant le découpage en intertitres »). */
  private readonly orderedTiles = computed<PartieTileVm[]>(() => {
    const ts = this.tiles();
    const byPartieId = new Map<string, PartieTileVm>(ts.map((t) => [t.partie.id, t]));
    const sortedParties = pinFavorites(
      sortParties(
        ts.map((t) => t.partie),
        this.partiesSort(),
        this.partySignalsSvc.signals(),
      ),
    );
    return sortedParties.map((p) => byPartieId.get(p.id)!);
  });

  /** Quatre intertitres (AC10) — décision d'implémentation (aucune AC ne tranche l'ordre exact
   *  entre « a un signal d'action » et le statut EN_COURS/A_VENIR) : une partie non terminée avec
   *  au moins un signal actionnable va dans « ce qui t'attend », quel que soit son statut ;
   *  sinon elle se range par statut. Une partie TERMINEE va toujours dans « terminées », même si
   *  elle porte un signal de fin actionnable (compte-rendu/rapport manquant) — cohérent avec AC5
   *  (une partie terminée ne porte plus de signal *d'action*, seulement des signaux de fin).
   *  N'existent que pour le tri 'urgence' (Story 29.8, décision documentée en Dev Notes/Completion
   *  Notes) : tout autre critère bascule sur `flatTiles`, une liste plate unique. */
  protected readonly awaitingTiles = computed(() =>
    this.orderedTiles().filter(
      (t) => t.partie.status !== 'TERMINEE' && Dashboard.hasActionableSignal(t.signals),
    ),
  );
  protected readonly ongoingTiles = computed(() =>
    this.orderedTiles().filter(
      (t) => t.partie.status === 'EN_COURS' && !Dashboard.hasActionableSignal(t.signals),
    ),
  );
  protected readonly upcomingTiles = computed(() =>
    this.orderedTiles().filter(
      (t) => t.partie.status === 'A_VENIR' && !Dashboard.hasActionableSignal(t.signals),
    ),
  );
  protected readonly finishedTiles = computed(() =>
    this.orderedTiles().filter((t) => t.partie.status === 'TERMINEE'),
  );
  /** Liste plate (Story 29.8) utilisée à la place des 4 intertitres dès que le tri s'écarte de
   *  'urgence' — trier par nom/date/type/statut à l'intérieur de 4 groupes n'aurait pas de sens
   *  pour un utilisateur qui veut un ordre global (Dev Notes, décision documentée). */
  protected readonly flatTiles = this.orderedTiles;

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

  /** Sous-ligne du mode liste (AC1, DESIGN.md §4.1) — « Rôle · libellé du signal dominant ».
   *
   *  §4.1 est explicite : « En mode liste, la pastille n'est jamais seule » — elle est doublée du
   *  libellé du signal dominant. Sans signal, on retombe sur le libellé de teinte (« En cours »,
   *  « À venir », « Terminée »), jamais sur rien : c'est cette ligne qui satisfait P-1 en mode
   *  liste, là où les modes moyen/grand s'appuient sur les badges et `.status-indicator`.
   *  Le rôle y est repris parce que `.role-indicator` n'est pas rendu dans ce gabarit. */
  protected rowSummary(t: PartieTileVm): string {
    const tone = this.theme.tone();
    const role = t.partie.role === 'mj' ? tone['dashboard.role_mj'] : tone['dashboard.role_player'];
    const detail = t.dominant ? this.badgeLabel(t.dominant, t.partie) : this.tintLabel(t.tint);
    return `${role} · ${detail}`;
  }

  /** Compteur unique du mode liste (§4.1 bis : « En mode liste, un seul compteur ») — le total des
   *  signaux affichables, pas les deux badges + « +N » des modes moyen/grand. */
  protected rowCount(t: PartieTileVm): number {
    return t.visibleSignals.length + t.moreCount;
  }

  /** Libellé accessible du compteur — le nombre nu ne dit pas de quoi il parle. */
  protected rowCountAriaLabel(n: number): string {
    return this.theme.tone()['dashboard.row_signal_count_aria'].replace('{n}', String(n));
  }

  /** Libellé de thème d'un critère de tri (Story 29.8) — clé `dashboard.sort_<critère>`. */
  protected sortLabel(sort: PartieSort): string {
    return this.theme.tone()[`dashboard.sort_${sort}`] ?? sort;
  }

  /** Libellé non chromatique de l'étoile de favori (jamais l'icône/la couleur seule, AC1). */
  protected favoriteAriaLabel(isFavorite: boolean): string {
    return isFavorite
      ? this.theme.tone()['dashboard.favorite_remove_aria']
      : this.theme.tone()['dashboard.favorite_add_aria'];
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

  /** Mémorisation du critère de tri (AC3) — appliqué immédiatement côté client (déjà reflété par
   *  `partiesSort()`, lu depuis `auth.currentUser()`), l'appel réseau est fire-and-forget (même
   *  patron que `theme-selector.ts` : un échec isolé n'empêche pas le tri de s'appliquer).
   *  Review Findings : un échec serveur restaure l'ancienne valeur locale plutôt que de laisser
   *  l'UI mentir sur ce qui est réellement persisté. */
  protected onSortChange(sort: PartieSort): void {
    const previous = this.auth.currentUser();
    if (previous) this.auth.currentUser.set({ ...previous, partiesSort: sort });
    this.account.updatePreferences({ partiesSort: sort }).catch(() => {
      if (previous) this.auth.currentUser.set(previous);
    });
  }

  /** Préférence « masquer les parties terminées » (AC6) — même patron fire-and-forget que le tri,
   *  même rollback en cas d'échec (Review Findings). */
  protected onHideFinishedChange(hide: boolean): void {
    const previous = this.auth.currentUser();
    if (previous) this.auth.currentUser.set({ ...previous, hideFinishedParties: hide });
    this.account.updatePreferences({ hideFinishedParties: hide }).catch(() => {
      if (previous) this.auth.currentUser.set(previous);
    });
    // Un nouveau réglage repart sans révélation temporaire active (évite l'incohérence « masquage
    // activé mais case déjà levée par un clic précédent »).
    this.showFinishedOverride.set(false);
  }

  /** Mode d'affichage (Story 29.9, AC1/AC3) — même patron fire-and-forget + rollback que
   *  `onSortChange()`/`onHideFinishedChange()` (Review Findings Story 29.8, à ne pas régresser). */
  protected onViewModeChange(mode: ListViewMode): void {
    const previous = this.auth.currentUser();
    if (previous) this.auth.currentUser.set({ ...previous, partiesViewMode: mode });
    this.account.updatePreferences({ partiesViewMode: mode }).catch(() => {
      if (previous) this.auth.currentUser.set(previous);
    });
  }

  /** Rétablit les filtres transitoires (Story 29.9, AC6) — seuls réglages comptés dans
   *  `hasDeviatedFromDefault()`, jamais mémorisés côté compte. */
  protected onResetRequested(): void {
    this.roleFilter.set('all');
    this.statusFilter.set('all');
  }

  /** Garde anti-double-clic (Review Findings) — un `partieId` déjà en vol ignore les clics
   *  suivants tant que la requête + le rechargement n'ont pas abouti. */
  private readonly pendingFavorites = signal<ReadonlySet<string>>(new Set());

  /** Vrai si un clic sur l'étoile de cette partie est déjà en cours de traitement. */
  protected isFavoritePending(partieId: string): boolean {
    return this.pendingFavorites().has(partieId);
  }

  /** Favori (AC1) — rechargement ciblé selon le rôle de CETTE partie, jamais les deux listes
   *  (même patron que `accept()`/`decline()`, qui ne rechargent que ce qui a pu changer). */
  protected async toggleFavorite(partie: PartieDto): Promise<void> {
    if (this.pendingFavorites().has(partie.id)) return;
    this.pendingFavorites.update((s) => new Set(s).add(partie.id));
    try {
      if (partie.isFavorite) {
        await this.account.removeFavorite(partie.id);
      } else {
        await this.account.addFavorite(partie.id);
      }
      if (partie.role === 'mj') await this.myPartiesSvc.refreshMjParties();
      else await this.myPartiesSvc.refreshPlayerParties();
    } finally {
      this.pendingFavorites.update((s) => {
        const next = new Set(s);
        next.delete(partie.id);
        return next;
      });
    }
  }
}
