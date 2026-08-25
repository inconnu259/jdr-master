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
import { DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatDialog } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { BreakpointObserver } from '@angular/cdk/layout';
import { toSignal } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
import { map } from 'rxjs/operators';
import type {
  AnnouncementDto,
  CharacterDto,
  CharacterGroupRoleDto,
  DaySlot,
  GameSystemContentDto,
  InviteLinkDto,
  PartieDto,
  PartieMemberDto,
  SessionPollDto,
  UserSearchResultDto,
  XpDistributionDto,
} from '@master-jdr/shared';

const SLOT_LABELS: Record<DaySlot, string> = {
  MORNING: 'Matin',
  AFTERNOON: 'Après-midi',
  EVENING: 'Soir',
  FULL_DAY: 'Journée',
};
import { AuthService } from '../../../core/auth/auth.service';
import { CharacterService } from '../../../core/characters/character.service';
import { characterName, findContentEntry } from '../../../core/characters/character.util';
import { PartiesService } from '../../../core/parties/parties.service';
import { RealtimeService, partieTopic } from '../../../core/realtime/realtime.service';
import { ambiguousUserIds } from '../../../shared/identity/identity-ambiguity.util';
import { MyPartiesService } from '../../../core/my-parties/my-parties.service';
import { ScenariosService, matchesPartie } from '../../../core/scenarios/scenarios.service';
import { getRespondedCount } from '../../../core/poll/poll.util';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
import { ContextualNavService } from '../../../core/navigation/contextual-nav.service';
import { gameSystemName, partieKindLabel } from '../../../core/parties/parties.util';
import { ConfirmDialog } from '../confirm-dialog/confirm-dialog';
import { CharacterSummaryCard } from '../../characters/character-summary-card/character-summary-card';
import { RosterRail } from '../roster-rail/roster-rail';
import { RosterStrip } from '../roster-strip/roster-strip';
import { XpDistributionPanel } from '../xp-distribution-panel/xp-distribution-panel';
import { XpHistory } from '../xp-history/xp-history';
import { ScenarioDrafts } from '../../scenarios/scenario-drafts/scenario-drafts';
import { ScenarioOneShotTab } from '../../scenarios/scenario-one-shot-tab/scenario-one-shot-tab';
import { ScenarioTimeline } from '../../scenarios/scenario-timeline/scenario-timeline';
import { AnnouncementFormComponent } from '../../announcements/announcement-form/announcement-form';
import { AnnonceCard } from '../../announcements/annonce-card/annonce-card';
import { AnnouncementsService } from '../../../core/announcements/announcements.service';
import { UnseenAnnouncementsService } from '../../../core/announcements/unseen-announcements.service';
import { scrollToAnnouncement } from '../../../core/announcements/scroll-to-announcement.util';
import { CharacterRolesService } from '../../../core/character-roles/character-roles.service';
import { HommeDragonSheet } from '../../homme-dragon/homme-dragon-sheet/homme-dragon-sheet';
import { IdentityLabel } from '../../../shared/identity/identity-label';

/** Index de l'onglet "Invitations" — toujours en 2e position pour le MJ (jamais d'onglet "Ma fiche" pour lui). */
const MJ_INVITATIONS_TAB_INDEX = 1;

@Component({
  selector: 'app-partie-detail',
  imports: [
    RouterLink,
    FormsModule,
    DatePipe,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatInputModule,
    MatListModule,
    MatTabsModule,
    CharacterSummaryCard,
    RosterRail,
    RosterStrip,
    XpDistributionPanel,
    XpHistory,
    ScenarioDrafts,
    ScenarioOneShotTab,
    ScenarioTimeline,
    AnnouncementFormComponent,
    AnnonceCard,
    HommeDragonSheet,
    IdentityLabel,
  ],
  templateUrl: './partie-detail.html',
  styleUrl: './partie-detail.scss',
})
export class PartieDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly parties = inject(PartiesService);
  private readonly realtime = inject(RealtimeService);
  private readonly myPartiesSvc = inject(MyPartiesService);
  private readonly scenariosSvc = inject(ScenariosService);
  private readonly announcementsSvc = inject(AnnouncementsService);
  private readonly unseenAnnouncementsSvc = inject(UnseenAnnouncementsService);
  private readonly characterRolesSvc = inject(CharacterRolesService);
  private readonly characterSvc = inject(CharacterService);
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly theme = inject(ThemeToneService);
  private readonly contextualNav = inject(ContextualNavService);
  private readonly destroyRef = inject(DestroyRef);

  private static readonly DESKTOP_QUERY = '(min-width: 1024px)';

  /** Aucun champ de capacité/nombre de places max sur `PartieDto` — le slot "+ Inviter" du roster
   *  reste donc toujours visible pour le MJ (seul rôle habilité à inviter), sans notion de capacité. */
  protected readonly hasFreeSlot = true;

  protected readonly partie = signal<PartieDto | null>(null);
  protected readonly members = signal<PartieMemberDto[]>([]);
  // Story 8.8 (revue de code) : plusieurs votes actifs peuvent désormais coexister sur une même
  // Partie (Décision 2) — remplace l'ancien `activePoll` unique (`PollService.getCurrentPoll()`,
  // hypothèse « un seul poll par Partie » invalidée). Chargé via ScenariosService.listAll(), même
  // source que CalendarView/ScenarioTimeline.
  protected readonly activePolls = signal<SessionPollDto[]>([]);
  protected readonly links = signal<InviteLinkDto[]>([]);
  protected readonly characters = signal<CharacterDto[]>([]);
  protected readonly xpDistributions = signal<XpDistributionDto[]>([]);
  protected readonly showXpPanel = signal(false);
  protected readonly showAnnouncementForm = signal(false);
  // Story 9.2 : liste complète (campagne + scopée) chargée une fois, filtrée côté client par
  // consommateur (AD-6 — même principe que activePolls/ScenariosService.listAll()).
  protected readonly announcements = signal<AnnouncementDto[]>([]);
  // Story 29.13 (révision) : id transmis en query param par le bandeau du Shell — consommé une
  // seule fois dès que l'annonce apparaît dans campaignAnnouncements() (cf. effect() au constructeur).
  private pendingScrollAnnouncementId = this.route.snapshot.queryParamMap.get('announcementId');
  private announcementsReqId = 0;
  private characterRolesReqId = 0;
  // Story 27.3 : liste des rôles de groupe assignés sur cette Partie, chargée une fois puis
  // rafraîchie sur le signal temps réel (même principe que announcements/characters).
  protected readonly characterRoles = signal<CharacterGroupRoleDto[]>([]);
  protected readonly campaignAnnouncements = computed(() =>
    this.announcements().filter((a) => a.scenarioId === null),
  );
  protected readonly campaignScopeLabel = computed(() =>
    this.partie()?.kind === 'ONE_SHOT'
      ? this.theme.tone()['announcement.scope_oneshot_label']
      : this.theme.tone()['announcement.scope_campaign_label'],
  );
  // Story 29.13 (révision) : le marquage « vue » se déclenche sur un clic explicite de l'utilisateur
  // sur AnnonceCard (opened()), plus au simple affichage.
  protected readonly unseenAnnouncementIds = computed(
    () => new Set(this.unseenAnnouncementsSvc.unseenAnnouncements().map((a) => a.id)),
  );
  protected readonly gameSystemContent = signal<GameSystemContentDto | null>(null);
  protected readonly search = signal('');
  protected readonly results = signal<UserSearchResultDto[]>([]);
  protected readonly notice = signal<string | null>(null);
  protected readonly inviteEmail = signal('');
  protected readonly invitingByEmail = signal(false);
  protected readonly inviteEmailError = signal<string | null>(null);
  protected readonly showTroupe = signal(false);
  protected readonly referenceAssetError = signal<string | null>(null);
  protected readonly downloadingReferenceAsset = signal(false);
  protected readonly prepAssetError = signal<string | null>(null);
  protected readonly downloadingPrepAsset = signal(false);

  /** Le MJ a accès à l'invitation et à la gestion des membres/liens. */
  protected readonly isMj = computed(() => this.partie()?.mjId === this.auth.currentUser()?.id);

  /** Personnages de l'utilisateur courant sur cette partie (pas ceux des autres joueurs). */
  protected readonly myCharacters = computed(() => {
    const userId = this.auth.currentUser()?.id;
    return this.characters().filter((c) => c.userId === userId);
  });

  protected readonly characterName = characterName;

  /** `isMatched` est synchrone — évite un flash d'un rendu desktop sur un premier chargement mobile. */
  protected readonly isDesktop = toSignal(
    this.breakpointObserver.observe(PartieDetail.DESKTOP_QUERY).pipe(map((r) => r.matches)),
    { initialValue: this.breakpointObserver.isMatched(PartieDetail.DESKTOP_QUERY) },
  );

  /** Liens d'invitation actifs uniquement — un lien révoqué ne doit plus jamais s'afficher (cf. AC6). */
  protected readonly activeLinks = computed(() => this.links().filter((l) => !l.revoked));

  /** Membres autres que le MJ — utilisé pour l'action « Retirer » dans l'onglet Invitations. */
  protected readonly otherMembers = computed(() => {
    const mjId = this.partie()?.mjId;
    return this.members().filter((m) => m.userId !== mjId);
  });

  /** AC3 : ambiguïté calculée sur `members()` en entier (pas `otherMembers()`) — détection
   *  cohérente entre la Troupe mobile et la gestion des membres (deux vues du même roster). */
  protected readonly ambiguousMembers = computed(() => ambiguousUserIds(this.members()));

  protected isMemberAmbiguous(userId: string): boolean {
    return this.ambiguousMembers().has(userId);
  }

  /** FR-4b/AC1 : l'utilisateur courant partage-t-il son nom affiché avec un autre membre — joueur
   *  ou MJ (jamais un `Membership`, cf. Découverte story 28.3, comparé séparément via `partie().mjDisplayName`) ? */
  protected readonly homonymousWith = computed(() => {
    const me = this.auth.currentUser();
    const p = this.partie();
    if (!me) return false;
    const displayName = me.displayName;
    if (this.members().some((m) => m.userId !== me.id && m.displayName === displayName))
      return true;
    return !!p && p.mjId !== me.id && p.mjDisplayName === displayName;
  });

  /** Mémorisé en `sessionStorage` (pas de préférence compte persistée, AC2) — s'efface à la
   *  fermeture de l'onglet, l'avertissement peut alors réapparaître dans une nouvelle session. */
  protected readonly homonymyDismissed = signal(false);

  private homonymyStorageKey(partieId: string, userId: string): string {
    return `homonymy-dismissed:${partieId}:${userId}`;
  }

  /** Revue de code : `sessionStorage` peut lever (navigation privée Safari ancienne génération,
   *  iframe sandboxée, politique de blocage du stockage) — ne doit jamais faire échouer le
   *  chargement de la page ni l'action « Ignorer », juste dégrader silencieusement. */
  private readHomonymyDismissed(partieId: string, userId: string): boolean {
    try {
      return !!sessionStorage.getItem(this.homonymyStorageKey(partieId, userId));
    } catch {
      return false;
    }
  }

  protected dismissHomonymyWarning(): void {
    const p = this.partie();
    const me = this.auth.currentUser();
    if (!p || !me) return;
    try {
      sessionStorage.setItem(this.homonymyStorageKey(p.id, me.id), '1');
    } catch {
      // Dégradation silencieuse : le bandeau reste ignoré pour ce rendu, mais réapparaîtra
      // potentiellement à la prochaine navigation si le stockage reste inaccessible.
    }
    this.homonymyDismissed.set(true);
  }

  /** Onglet "Ma fiche" (joueur mobile) sélectionné par défaut ; sinon "Détails" (index 0). */
  protected readonly defaultTabIndex = computed(() => (!this.isMj() && !this.isDesktop() ? 1 : 0));

  private readonly manualTabIndex = signal<number | null>(null);

  protected readonly selectedTabIndex = computed(
    () => this.manualTabIndex() ?? this.defaultTabIndex(),
  );

  /** Combinaison qui détermine l'ensemble des onglets rendus — un changement invalide toute sélection manuelle
   *  antérieure (ex. joueur mobile sur "Ma fiche" qui redimensionne vers desktop, où cet onglet n'existe pas). */
  private readonly tabSetKey = computed(() => `${this.isMj()}-${this.isDesktop()}`);

  protected onTabIndexChange(index: number): void {
    this.manualTabIndex.set(index);
  }

  /** Ouvre l'onglet Invitations depuis le slot "+ Inviter" du roster (MJ uniquement — seul rôle où cet onglet existe). */
  protected openInvitationsTab(): void {
    if (this.isMj()) this.manualTabIndex.set(MJ_INVITATIONS_TAB_INDEX);
  }

  protected onSelectRosterCharacter(event: { characterId: string }): void {
    const p = this.partie();
    if (p) this.openCharacterSheet(p.id, event.characterId);
  }

  /** Slot "créer mon personnage" du roster desktop (joueur sans personnage sur cette partie) —
   *  seul point d'entrée équivalent au CTA de l'onglet "Ma fiche" (mobile) sur cette vue. */
  protected createCharacter(p: PartieDto): void {
    void this.router.navigate(['/parties', p.id, 'characters', 'new'], {
      queryParams: { gameSystemId: p.gameSystemId },
    });
  }

  /** Label de classe résolu depuis le contenu seedé (jamais codé en dur). */
  protected classLabel(character: CharacterDto): string {
    const classId = (character.sheetData as { classId?: string })?.classId;
    const entry = findContentEntry<{ label?: string }>(this.gameSystemContent(), 'class', classId);
    return entry?.label ?? '';
  }

  /** Champ fonction stable (pas une méthode liée) pour l'input `classLabelFor` de RosterRail/RosterStrip. */
  protected readonly classLabelFor = (character: CharacterDto): string =>
    this.classLabel(character);

  /** Libellé du rôle de groupe assigné à ce personnage, ou null (Story 27.3) — réutilise
   *  `findContentEntry`/`gameSystemContent` déjà en place pour `classLabelFor`, aucun nouveau fetch. */
  protected readonly roleLabelFor = (character: CharacterDto): string | null => {
    const role = this.characterRoles().find((r) => r.characterId === character.id);
    if (!role) return null;
    // Revue de code : .trim() — un libellé de catalogue mal saisi avec un espace de tête/fin ne
    // doit jamais produire un badge visuellement vide (charAt(0) = espace) tout en restant "truthy".
    const label = findContentEntry<{ label?: string }>(
      this.gameSystemContent(),
      'groupRole',
      role.roleKey,
    )?.label?.trim();
    return label || null;
  };

  constructor() {
    // Story 29.4 : bandeau contextuel — réactif (partie() se résout de façon asynchrone), pas un
    // simple appel statique dans ngOnInit(). Correction post-test : le sous-titre porte le
    // système de jeu et le type de partie (ex. « Ryuutama · Campagne épisodique ») — portait
    // auparavant le rôle MJ, retiré du bandeau (déjà visible via les actions MJ-only de l'écran).
    // Reprend le mat-card-header retiré de la carte (partie-detail.html) plutôt que de dupliquer.
    effect(() => {
      const p = this.partie();
      if (!p) return;
      this.contextualNav.set({
        title: p.name,
        subtitle: `${this.system(p.gameSystemId)} · ${this.kind(p.kind)}`,
      });
    });

    effect(() => {
      if (this.isMj()) void this.loadLinks();
    });

    effect(() => {
      if (this.isMj()) void this.loadXpDistributions();
    });

    effect(() => {
      this.tabSetKey();
      untracked(() => this.manualTabIndex.set(null));
    });

    // Story 18.3 : remplace le patch visibilitychange (retour de focus d'onglet, bug-fix
    // 2026-07-17, AC2 — un seul mécanisme de rafraîchissement pour ce composant) par le signal
    // temps réel SSE. `id` vient du snapshot de route, lu une seule fois (même limitation
    // préexistante que `ngOnInit`, qui fait de même) : si Angular réutilisait cette instance de
    // composant sur un simple changement de `:id` (comportement par défaut pour une route
    // `parties/:id` sans `RouteReuseStrategy` custom — vérifié, aucune n'est déclarée dans cette
    // app), la connexion resterait liée à l'ancien id. Aucun parcours de navigation actuel de
    // l'app ne déclenche ce cas (pas de lien direct d'une Partie vers une autre) — limitation
    // connue, différée (revue de code Story 18.3, voir deferred-work.md), pas propre au SSE.
    const id = this.route.snapshot.paramMap.get('id');
    if (id) {
      this.realtime.connect(partieTopic(id));
      this.destroyRef.onDestroy(() => this.realtime.disconnect(partieTopic(id)));
    }
    // Garde firstRun (même piège que partout ailleurs, cf. l'effect characterSvc.changed() juste
    // en dessous) : le signal peut déjà porter une valeur avant le montage — sans cette garde,
    // refreshPartie()/loadMembers() étaient rechargés une seconde fois inutilement au montage, en
    // plus du chargement initial.
    let firstRunParties = true;
    effect(() => {
      this.parties.changed();
      if (firstRunParties) {
        firstRunParties = false;
        return;
      }
      // Bug fix (temps réel) : un nouveau membre (invitation acceptée, lien rejoint) n'apparaissait
      // jamais dans le roster/l'onglet Invitations sans recharger — étend le rechargement déjà
      // déclenché ici sur tout événement partie: (même wildcard générique que refreshPartie()) à
      // la liste des membres.
      untracked(() => {
        void this.refreshPartie();
        void this.loadMembers();
      });
    });

    // Bug fix (temps réel) : le MJ ne voyait jamais apparaître un personnage nouvellement créé par
    // un joueur sans recharger — CharacterService.changed() est un simple compteur (comme dans
    // CharacterSheet), aucun filtrage matchesPartie possible/nécessaire ici. Garde firstRun (même
    // piège que partout ailleurs) : le signal peut déjà porter une valeur avant le montage.
    let firstRunCharacters = true;
    effect(() => {
      this.characterSvc.changed();
      if (firstRunCharacters) {
        firstRunCharacters = false;
        return;
      }
      untracked(() => void this.reloadCharacters());
    });

    // Bug fix (temps réel, production) : un nouveau sondage de date créé sur une Séance pendant
    // que cette page est déjà ouverte n'apparaissait jamais dans le widget "Vote ouvert"
    // (activePolls n'était chargé qu'une fois dans ngOnInit). Même garde `matchesPartie` que
    // CalendarView/ScenarioEditor/ScenarioDrafts pour ce même signal.
    let firstRunScenarios = true;
    effect(() => {
      const change = this.scenariosSvc.changed();
      if (firstRunScenarios) {
        firstRunScenarios = false;
        return;
      }
      if (!id || !matchesPartie(change, id)) return;
      untracked(() => void this.loadActivePolls(id));
    });

    // Bug fix (temps réel, production) : une annonce publiée par le MJ (ou dans un autre onglet)
    // n'apparaissait jamais sans recharger la page — AnnouncementsService n'était pas câblé au
    // signal temps réel.
    let firstRunAnnouncements = true;
    effect(() => {
      this.announcementsSvc.changed();
      if (firstRunAnnouncements) {
        firstRunAnnouncements = false;
        return;
      }
      untracked(() => void this.reloadAnnouncements());
    });

    // Story 27.3 : un rôle de groupe assigné/retiré par le MJ n'apparaissait jamais dans le
    // roster des autres membres déjà sur la page sans recharger — même garde firstRun que les
    // autres effects temps réel de ce composant.
    let firstRunCharacterRoles = true;
    effect(() => {
      this.characterRolesSvc.changed();
      if (firstRunCharacterRoles) {
        firstRunCharacterRoles = false;
        return;
      }
      untracked(() => void this.reloadCharacterRoles());
    });

    // Story 29.13 (révision du 2026-08-13, retour utilisateur) : clic sur le bandeau du Shell —
    // force l'onglet "Détails" (0, où vivent les annonces de campagne) puis défile jusqu'à
    // l'annonce visée dès qu'elle apparaît dans campaignAnnouncements(). Après `tabSetKey()`
    // (qui remet `manualTabIndex` à `null` à chaque changement MJ/desktop) pour ne pas être écrasé.
    effect(() => {
      const id = this.pendingScrollAnnouncementId;
      if (!id) return;
      const found = this.campaignAnnouncements().some((a) => a.id === id);
      if (!found) return;
      untracked(() => {
        this.pendingScrollAnnouncementId = null;
        this.manualTabIndex.set(0);
        scrollToAnnouncement(id);
      });
    });
  }

  /** Story 29.13 (révision) : « j'ouvre l'annonce » = clic explicite sur AnnonceCard, plus le
   *  simple affichage (qui refermait la notification avant que l'utilisateur n'ait pu la voir). */
  protected markAnnouncementOpened(announcementId: string): void {
    void this.unseenAnnouncementsSvc.markRead(announcementId);
  }

  /** Recharge `characters` seul (roster) — réutilisé par l'effet temps réel et par
   *  `onXpDistributed()` (extrait pour éviter la duplication de `listByPartie(...).catch(...)`).
   *  Bug fix (revue de code) : un échec réseau transitoire ne doit jamais vider le roster affiché —
   *  même risque déjà corrigé pour `MyPartiesService` (garder le dernier état connu bon). */
  private async reloadCharacters(): Promise<void> {
    const p = this.partie();
    if (!p) return;
    try {
      this.characters.set(await this.characterSvc.listByPartie(p.id));
    } catch {
      // Échec transitoire : on garde le dernier état connu bon, pas de `.set([])`.
    }
  }

  /** Recharge `partie` sans re-déclencher tout `ngOnInit` (membres/scénarios/annonces restent
   *  inchangés) — évite un aller-retour réseau superflu pour des données qui ont leurs propres
   *  chemins de rafraîchissement déjà établis (`loadMembers`, `onAnnouncementPublished`, etc.). */
  private async refreshPartie(): Promise<void> {
    const id = this.partie()?.id;
    if (!id) return;
    this.partie.set(await this.parties.get(id));
  }

  /** Libellé formaté de la prochaine séance, ou null si aucune date confirmée. */
  protected readonly nextSessionLabel = computed(() => {
    const p = this.partie();
    if (!p?.nextSessionDate) return null;
    try {
      const d = new Date(p.nextSessionDate);
      const date = new Intl.DateTimeFormat('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        timeZone: 'UTC',
      })
        .format(d)
        .toLocaleLowerCase('fr-FR');
      const slot = p.nextSessionSlot ? ` — ${SLOT_LABELS[p.nextSessionSlot]}` : '';
      return `${date}${slot}`;
    } catch {
      return null;
    }
  });

  protected readonly system = gameSystemName;
  protected readonly kind = partieKindLabel;

  // Un seul poll actif → détail « X/Y réponses » précis (comportement historique conservé).
  // Plusieurs → l'agrégation par réponse individuelle n'a plus de sens à ce niveau (chaque poll a
  // son propre roster de réponses), le libellé devient un simple compte de votes en cours.
  protected readonly respondedCount = computed(() => {
    const polls = this.activePolls();
    return polls.length === 1 ? getRespondedCount(polls[0], this.members()) : 0;
  });

  protected pollStatusLabel(): string {
    const polls = this.activePolls();
    if (polls.length === 1) {
      // Deferred-work (2026-08-24) : `{total}` prend `poll.membersCount` (MJ compris, valeur
      // serveur), pas `this.members().length` (exclut le MJ, `GET /parties/:id/members` ne lui
      // pose jamais de ligne `Membership`) — même dénominateur que le panneau du calendrier
      // (story 36.6), qui avait le même bug à deux Y avant sa correction.
      return this.theme
        .tone()
        ['poll.status_summary'].replace('{responded}', String(this.respondedCount()))
        .replace('{total}', String(polls[0].membersCount));
    }
    return `${polls.length} votes de date en cours`;
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.showTroupe.set(false);
    this.partie.set(await this.parties.get(id));
    const me = this.auth.currentUser();
    if (me) {
      this.homonymyDismissed.set(this.readHomonymyDismissed(id, me.id));
    }
    await this.loadMembers();
    await this.loadActivePolls(id);
    this.announcements.set(await this.announcementsSvc.listAll(id).catch(() => []));
    this.characters.set(await this.characterSvc.listByPartie(id).catch(() => []));
    this.characterRoles.set(await this.characterRolesSvc.listForPartie(id).catch(() => []));
    this.gameSystemContent.set(
      await this.characterSvc.getGameSystemContent(this.partie()!.gameSystemId).catch(() => null),
    );
    // loadLinks() déclenché réactivement par effect() dans le constructeur
  }

  protected openCharacterSheet(partieId: string, characterId: string): void {
    this.router.navigate(['/parties', partieId, 'characters', characterId]);
  }

  async runSearch(): Promise<void> {
    const q = this.search().trim();
    this.notice.set(null);
    if (!q) {
      this.results.set([]);
      return;
    }
    const found = await this.parties.searchUsers(q);
    // On masque le MJ et les membres déjà présents.
    const memberIds = new Set(this.members().map((m) => m.userId));
    this.results.set(found.filter((u) => u.id !== this.partie()?.mjId && !memberIds.has(u.id)));
  }

  async invite(user: UserSearchResultDto): Promise<void> {
    const p = this.partie();
    if (!p) return;
    await this.parties.inviteUser(p.id, user.id);
    this.results.update((list) => list.filter((u) => u.id !== user.id));
    this.notice.set(this.theme.tone()['partie.notice_invited'].replace('{name}', user.pseudo));
  }

  async inviteByEmail(): Promise<void> {
    if (this.invitingByEmail()) return; // évite les doubles soumissions (Entrée répétée, double-clic)
    const p = this.partie();
    const email = this.inviteEmail().trim();
    if (!p || !email) return;
    this.invitingByEmail.set(true);
    this.inviteEmailError.set(null);
    try {
      const result = await this.parties.inviteByEmail(p.id, email);
      if (result.ok) {
        this.notice.set(this.theme.tone()['partie.notice_invited_email'].replace('{email}', email));
        this.inviteEmail.set('');
      } else {
        this.inviteEmailError.set(this.theme.tone()['partie.notice_invite_email_error']);
      }
    } catch {
      this.inviteEmailError.set(this.theme.tone()['partie.notice_invite_email_error']);
    } finally {
      this.invitingByEmail.set(false);
    }
  }

  async removeMember(member: PartieMemberDto): Promise<void> {
    const p = this.partie();
    if (!p) return;
    const ref = this.dialog.open(ConfirmDialog, {
      data: { message: `Retirer ${member.displayName} de « ${p.name} » ?` },
    });
    if (!(await firstValueFrom(ref.afterClosed()))) return;
    await this.parties.removeMember(p.id, member.userId);
    await this.loadMembers();
  }

  async createLink(): Promise<void> {
    const p = this.partie();
    if (!p) return;
    await this.parties.createInviteLink(p.id, {});
    await this.loadLinks();
  }

  async revokeLink(link: InviteLinkDto): Promise<void> {
    await this.parties.revokeInviteLink(link.id);
    await this.loadLinks();
  }

  joinUrl(token: string): string {
    return `${location.origin}/join/${token}`;
  }

  async copyLink(token: string): Promise<void> {
    await navigator.clipboard?.writeText(this.joinUrl(token));
    this.notice.set(this.theme.tone()['partie.notice_copy']);
  }

  /** Réversible (AC2) — pas de `ConfirmDialog`, contrairement à `confirmDelete()` (irréversible).
   *  Mise à jour directe du signal local, même immédiateté que `invite()`/`createLink()`. */
  async closeGame(p: PartieDto): Promise<void> {
    this.partie.set(await this.parties.close(p.id));
  }

  async reopenGame(p: PartieDto): Promise<void> {
    this.partie.set(await this.parties.reopen(p.id));
  }

  async confirmDelete(p: PartieDto): Promise<void> {
    const ref = this.dialog.open(ConfirmDialog, {
      data: { message: `Supprimer « ${p.name} » ? Cette action est irréversible.` },
    });
    if (!(await firstValueFrom(ref.afterClosed()))) return;
    await this.parties.remove(p.id);
    await this.myPartiesSvc.refreshMjParties();
    void this.router.navigate(['/']);
  }

  private async loadMembers(): Promise<void> {
    const p = this.partie();
    if (p) this.members.set(await this.parties.members(p.id));
  }

  private async loadActivePolls(partieId: string): Promise<void> {
    try {
      const scenarios = await this.scenariosSvc.listAll(partieId);
      const polls: SessionPollDto[] = [];
      for (const scenario of scenarios) {
        for (const seance of scenario.seances) {
          if (seance.poll?.status === 'OPEN') polls.push(seance.poll);
        }
      }
      this.activePolls.set(polls);
    } catch {
      // non-bloquant — le bandeau reste utilisable sans la liste des votes actifs
    }
  }

  private async loadLinks(): Promise<void> {
    const p = this.partie();
    if (p) this.links.set(await this.parties.inviteLinks(p.id));
  }

  private async loadXpDistributions(): Promise<void> {
    const p = this.partie();
    if (p) this.xpDistributions.set(await this.parties.listXpDistributions(p.id));
  }

  /** Après une distribution confirmée : recharge `characters`/`xpDistributions` — c'est le parent
   *  qui recharge, pas le panneau lui-même (AD-10, pas de rechargement indépendant par composant). */
  protected async onXpDistributed(): Promise<void> {
    if (!this.partie()) return;
    this.showXpPanel.set(false);
    await this.reloadCharacters();
    await this.loadXpDistributions();
  }

  /** Story 9.2 : recharge la liste après publication — sans ça, l'annonce fraîchement publiée par
   *  le MJ n'apparaîtrait dans son propre flux qu'au prochain rechargement de page. Réutilisée par
   *  l'effect `announcementsSvc.changed()` (bug fix temps réel, cf. constructeur). */
  protected async onAnnouncementPublished(): Promise<void> {
    await this.reloadAnnouncements();
  }

  private async reloadAnnouncements(): Promise<void> {
    const p = this.partie();
    if (!p) return;
    const reqId = ++this.announcementsReqId;
    const list = await this.announcementsSvc.listAll(p.id).catch(() => this.announcements());
    if (reqId === this.announcementsReqId) this.announcements.set(list);
  }

  /** Story 27.3 : recharge `characterRoles` seul — un échec réseau transitoire ne doit jamais
   *  vider les badges déjà affichés (même discipline que `reloadCharacters()`). Revue de code :
   *  garde d'ordre de requêtes (même pattern que `reloadAnnouncements()`) — deux événements
   *  `changed()` rapprochés ne doivent jamais laisser une réponse périmée écraser un état plus frais. */
  private async reloadCharacterRoles(): Promise<void> {
    const p = this.partie();
    if (!p) return;
    const reqId = ++this.characterRolesReqId;
    const list = await this.characterRolesSvc
      .listForPartie(p.id)
      .catch(() => this.characterRoles());
    if (reqId === this.characterRolesReqId) this.characterRoles.set(list);
  }

  /**
   * Story 12.1/12.2 : téléchargement d'une fiche de référence Ryuutama servie telle quelle.
   * `section` scope l'état de chargement/erreur à la section appelante (`.reference-sheets` vs
   * `.prep-sheets`) — deux sections distinctes peuvent coexister sur le même écran (MJ sur une
   * Partie Ryuutama), un état partagé ferait fuiter l'erreur/le disabled de l'une vers l'autre.
   */
  protected async downloadAsset(key: string, section: 'reference' | 'prep'): Promise<void> {
    const p = this.partie();
    const downloading =
      section === 'reference' ? this.downloadingReferenceAsset : this.downloadingPrepAsset;
    const error = section === 'reference' ? this.referenceAssetError : this.prepAssetError;
    if (!p || downloading()) return;
    error.set(null);
    downloading.set(true);
    try {
      const blob = await this.characterSvc.getGameSystemAsset(p.id, p.gameSystemId, key);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${key}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      error.set(this.theme.tone()['partie.asset_download_error']);
    } finally {
      downloading.set(false);
    }
  }
}
