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
  EVENING: 'Soirée',
  FULL_DAY: 'Journée',
};
import { AuthService } from '../../../core/auth/auth.service';
import { CharacterService } from '../../../core/characters/character.service';
import { characterName, findContentEntry } from '../../../core/characters/character.util';
import { PartiesService } from '../../../core/parties/parties.service';
import { ModeService } from '../../../core/mode/mode.service';
import { ScenariosService } from '../../../core/scenarios/scenarios.service';
import { getRespondedCount } from '../../../core/poll/poll.util';
import { ThemeToneService } from '../../../core/theme/theme-tone.service';
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
import { HommeDragonSheet } from '../../homme-dragon/homme-dragon-sheet/homme-dragon-sheet';

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
  ],
  templateUrl: './partie-detail.html',
  styleUrl: './partie-detail.scss',
})
export class PartieDetail implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly auth = inject(AuthService);
  private readonly parties = inject(PartiesService);
  private readonly modeSvc = inject(ModeService);
  private readonly scenariosSvc = inject(ScenariosService);
  private readonly announcementsSvc = inject(AnnouncementsService);
  private readonly characterSvc = inject(CharacterService);
  private readonly dialog = inject(MatDialog);
  private readonly breakpointObserver = inject(BreakpointObserver);
  protected readonly theme = inject(ThemeToneService);
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
  private announcementsReqId = 0;
  protected readonly campaignAnnouncements = computed(() =>
    this.announcements().filter((a) => a.scenarioId === null),
  );
  protected readonly campaignScopeLabel = computed(() =>
    this.partie()?.kind === 'ONE_SHOT'
      ? this.theme.tone()['announcement.scope_oneshot_label']
      : this.theme.tone()['announcement.scope_campaign_label'],
  );
  protected readonly gameSystemContent = signal<GameSystemContentDto | null>(null);
  protected readonly search = signal('');
  protected readonly results = signal<UserSearchResultDto[]>([]);
  protected readonly notice = signal<string | null>(null);
  protected readonly inviteEmail = signal('');
  protected readonly invitingByEmail = signal(false);
  protected readonly inviteEmailError = signal<string | null>(null);
  protected readonly showTroupe = signal(false);

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

  constructor() {
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

    // Bug-fix hors story (retour utilisateur, 2026-07-17) : `partie` n'était chargée qu'une fois
    // au montage (ngOnInit) — un changement fait ailleurs (autre onglet, PartieForm en édition)
    // restait invisible sans F5, y compris l'apparition/disparition d'onglets pilotés par
    // `p.gameSystemId`/`p.kind` (ex. l'onglet Homme Dragon). Recharge au retour de focus de
    // l'onglet navigateur — patch ciblé, pas la solution systémique (cf. deferred-work.md).
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void this.refreshPartie();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    this.destroyRef.onDestroy(() =>
      document.removeEventListener('visibilitychange', onVisibilityChange),
    );
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
      return this.theme
        .tone()
        ['poll.status_summary'].replace('{responded}', String(this.respondedCount()))
        .replace('{total}', String(this.members().length));
    }
    return `${polls.length} votes de date en cours`;
  }

  async ngOnInit(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    if (!id) return;
    this.showTroupe.set(false);
    this.partie.set(await this.parties.get(id));
    await this.loadMembers();
    await this.loadActivePolls(id);
    this.announcements.set(await this.announcementsSvc.listAll(id).catch(() => []));
    this.characters.set(await this.characterSvc.listByPartie(id).catch(() => []));
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
      data: { message: `Retirer ${member.pseudo} de « ${p.name} » ?` },
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

  async confirmDelete(p: PartieDto): Promise<void> {
    const ref = this.dialog.open(ConfirmDialog, {
      data: { message: `Supprimer « ${p.name} » ? Cette action est irréversible.` },
    });
    if (!(await firstValueFrom(ref.afterClosed()))) return;
    await this.parties.remove(p.id);
    await this.modeSvc.refreshMjParties();
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
    const p = this.partie();
    if (!p) return;
    this.showXpPanel.set(false);
    this.characters.set(await this.characterSvc.listByPartie(p.id).catch(() => []));
    await this.loadXpDistributions();
  }

  /** Story 9.2 : recharge la liste après publication — sans ça, l'annonce fraîchement publiée par
   *  le MJ n'apparaîtrait dans son propre flux qu'au prochain rechargement de page. */
  protected async onAnnouncementPublished(): Promise<void> {
    const p = this.partie();
    if (!p) return;
    const reqId = ++this.announcementsReqId;
    const list = await this.announcementsSvc.listAll(p.id).catch(() => this.announcements());
    if (reqId === this.announcementsReqId) this.announcements.set(list);
  }
}
