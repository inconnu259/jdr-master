---
baseline_commit: 5fd6e148c9bc7c1bcad5f3bd38887b2c72fedebe
---

# Story 3.5 : Notifications in-app & widgets d'intégration

Status: done

## Story

As a GM or player,
I want to be notified of vote activity and see scheduling info on every relevant screen,
So that I never miss a pending action.

## Acceptance Criteria

**AC1 — Badge de vote en attente dans la navigation (compteur)**

Given un joueur est membre d'une ou plusieurs parties avec un poll OPEN
When il consulte n'importe quelle page de l'application
Then un badge numérique apparaît dans la navigation (`Shell`), affichant le nombre de parties ayant un poll OPEN pour ce joueur
And ce badge est masqué si ce nombre est 0
And **déjà fait (story 3.3) — ne pas re-livrer** : le badge "Vote en attente" par carte sur le dashboard joueur

**AC2 — Vue MJ : qui n'a pas encore répondu**

Given le MJ consulte le panneau de résultat du vote (`PollStatusPanel`, `/parties/:id/calendar` mode MJ)
When tous les membres (joueurs) de la partie ont répondu à toutes les options du poll
Then une bannière `theme.tone()['alert.all_responded']` s'affiche ("tous ont répondu")
And, sinon, la liste des membres n'ayant pas répondu à toutes les options s'affiche via `theme.tone()['alert.missing_player']` (un item par membre manquant, `{name}` remplacé)

**AC3 — Statut du vote sur la page de la partie**

Given la page `/parties/:id` (`PartieDetail`) est affichée
When un poll OPEN existe pour cette partie
Then le widget de planification affiche une ligne de statut : `theme.tone()['poll.status_summary']` avec `{responded}`/`{total}` remplacés par le décompte réel de membres ayant répondu / total de membres
And un lien est affiché : vers `/parties/:id/calendar` pour le MJ (réutilise `theme.tone()['cta.find_date']`), vers `/parties/:id/guild-calendar` pour un joueur (réutilise `theme.tone()['poll.vote_pending']`)
And si aucun poll OPEN n'existe, cette section ne s'affiche pas (comportement actuel inchangé)

**AC4 — Badge dashboard joueur navigue vers le vote (déjà fait)**

Given le badge "vote en attente" existe déjà sur le dashboard joueur (story 3.3, `dashboard.html`)
Then **aucun changement requis** — le lien pointe déjà vers `/parties/:id/guild-calendar`, qui affiche déjà `PollResponseComponent`. Vérifié dans le code actuel, rien à livrer pour cet AC.

**AC5 — Microcopy thématisée + tests**

Given toutes les nouvelles notifications ci-dessus
When l'utilisateur change de thème
Then tous les textes changent immédiatement via les signals `ThemeToneService.tone`
And la suite de tests couvre :
  1. `poll.util.spec.ts` : `getMissingVoters()` et `getRespondedCount()` — cas complet/partiel/aucun membre/poll sans options
  2. `open-polls.service.spec.ts` : le signal `count` reflète le nombre de polls OPEN parmi `playerParties()`
  3. `poll-status.spec.ts` : bannière "tous ont répondu" vs liste des manquants, selon l'input `members`
  4. `partie-detail.spec.ts` : ligne de statut X/Y affichée quand un poll OPEN existe, absente sinon ; lien correct MJ vs joueur
  5. `shell.spec.ts` (nouveau) : badge visible avec le bon compte, masqué si 0
  6. `dashboard.spec.ts` (nouveau, minimal) : `openPolls` provient bien de `OpenPollsService` (pas de logique dupliquée)

## Tasks/Subtasks

- [x] Task 1 — Helper partagé `poll.util.ts` (AC2, AC3, AC5)
  - [x] Créer `apps/web/src/app/core/poll/poll.util.ts` : `getMissingVoters(poll, members)`, `getRespondedCount(poll, members)`
  - [x] Créer `apps/web/src/app/core/poll/poll.util.spec.ts`

- [x] Task 2 — Tone keys (AC2, AC3)
  - [x] `apps/web/src/app/core/theme/tones.ts` — ajouter `alert.all_responded`, `poll.status_summary` dans les 3 thèmes

- [x] Task 3 — `OpenPollsService` partagé (AC1) — élimine la duplication avec le dashboard
  - [x] Créer `apps/web/src/app/core/poll/open-polls.service.ts`
  - [x] Créer `apps/web/src/app/core/poll/open-polls.service.spec.ts`

- [x] Task 4 — Refactor `Dashboard` pour consommer `OpenPollsService` (AC1)
  - [x] `apps/web/src/app/features/dashboard/dashboard.ts` — retirer `openPolls`/`loadOpenPolls`/`loadOpenPollsSeq`/l'`effect()` dupliqué, consommer `OpenPollsService.openPolls` directement
  - [x] Créer `apps/web/src/app/features/dashboard/dashboard.spec.ts` (nouveau, minimal)

- [x] Task 5 — Badge de navigation dans `Shell` (AC1)
  - [x] `apps/web/src/app/layout/shell/shell.ts` — injecter `OpenPollsService`, exposer `openPollsCount`
  - [x] `apps/web/src/app/layout/shell/shell.html` — `matBadge` sur l'icône compte, masqué si 0
  - [x] Créer `apps/web/src/app/layout/shell/shell.spec.ts` (nouveau)

- [x] Task 6 — `CalendarView` : charger les membres de la partie pour le MJ (AC2)
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` — injecter `PartiesService`, charger `members` si `isMjMode()`, passer à `<app-poll-status>`
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` — brancher `[members]="members()"`

- [x] Task 7 — `PollStatusPanel` : bannière/liste des non-votants (AC2, AC5)
  - [x] `apps/web/src/app/features/poll/poll-status/poll-status.ts` — input `members`, `missingVoters`/`allResponded` computed
  - [x] `apps/web/src/app/features/poll/poll-status/poll-status.html` — bannière ou liste
  - [x] `apps/web/src/app/features/poll/poll-status/poll-status.scss` — styles
  - [x] Étendre `apps/web/src/app/features/poll/poll-status/poll-status.spec.ts`

- [x] Task 8 — `PartieDetail` : statut du vote (AC3, AC5)
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` — injecter `PollService`, charger le poll actif, computed `respondedCount`
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.html` — section de statut dans `.scheduling-widget`
  - [x] Étendre `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` — **ajouter un provider `PollService` mocké** (absent aujourd'hui, sinon DI cassée par l'injection réelle de `HttpClient`)

- [x] Task 9 — Validation finale
  - [x] `docker compose exec web pnpm test` — 0 régression (21 fichiers / 112 tests passent, +22 nouveaux tests)

## Dev Notes

### Vue d'ensemble

Story assez large : 2 nouveaux fichiers utilitaires/service, 1 refactor (Dashboard), 3 composants étendus (Shell, CalendarView+PollStatusPanel, PartieDetail). **AC1 et AC4 sont partiellement déjà couverts** par la story 3.3 (badge par carte sur le dashboard) — ne pas dupliquer ce travail, seulement ajouter le compteur de navigation manquant.

**Fichiers nouveaux :**
- `apps/web/src/app/core/poll/poll.util.ts` + `.spec.ts`
- `apps/web/src/app/core/poll/open-polls.service.ts` + `.spec.ts`
- `apps/web/src/app/layout/shell/shell.spec.ts`
- `apps/web/src/app/features/dashboard/dashboard.spec.ts`

**Fichiers modifiés :**
- `apps/web/src/app/core/theme/tones.ts`
- `apps/web/src/app/features/dashboard/dashboard.ts`
- `apps/web/src/app/layout/shell/shell.ts`, `shell.html`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`, `.html`
- `apps/web/src/app/features/poll/poll-status/poll-status.ts`, `.html`, `.scss`, `.spec.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`, `.html`, `.spec.ts`

---

### Task 1 — `poll.util.ts`

**Fichier :** `apps/web/src/app/core/poll/poll.util.ts` (nouveau)

```typescript
import type { PartieMemberDto, SessionPollDto } from '@master-jdr/shared';

/** Membres n'ayant pas répondu à TOUTES les options du poll (interprétation de "a répondu" = a voté sur chaque option). */
export function getMissingVoters(poll: SessionPollDto, members: PartieMemberDto[]): PartieMemberDto[] {
  return members.filter(m =>
    !poll.options.every(opt => opt.votes.some(v => v.userId === m.userId)),
  );
}

export function getRespondedCount(poll: SessionPollDto, members: PartieMemberDto[]): number {
  return members.length - getMissingVoters(poll, members).length;
}
```

**⚠️ Interprétation documentée** : un membre est considéré "a répondu" seulement s'il a voté sur **chaque** option du poll (pas juste une). C'est la lecture la plus naturelle de l'AC2 du spec ("a player has responded to all options in the poll"). Si `poll.options` est vide, `every()` sur un tableau vide retourne `true` — tous les membres comptent comme "répondu" (pas d'options = rien à manquer). Comportement volontaire, pas un bug.

**Test `poll.util.spec.ts`** — cas à couvrir : tous ont répondu (missing=[]), aucun n'a répondu (missing=members), réponse partielle (a voté sur 1/2 options → toujours "manquant"), liste de membres vide, poll sans options.

---

### Task 2 — Tone Keys

Ajouter dans `apps/web/src/app/core/theme/tones.ts`, section "calendrier & vote" des 3 thèmes :

| Clé | grimoire-emeraude | foret-ancienne | medieval-steampunk |
|-----|---------------------|----------------|-------------------|
| `alert.all_responded` | `'Tous les compagnons ont répondu au vote.'` | `'Tous les habitants ont répondu à l\'appel.'` | `'Tout l\'équipage a répondu au registre.'` |
| `poll.status_summary` | `'Vote ouvert — {responded}/{total} compagnons ont répondu'` | `'Vote ouvert — {responded}/{total} habitants ont répondu'` | `'Registre ouvert — {responded}/{total} membres ont répondu'` |

`poll.status_summary` utilise le même pattern de substitution que `partie.notice_invited` (`{name}`) — ici deux placeholders : `.replace('{responded}', String(n)).replace('{total}', String(m))`.

**Clé déjà existante, réutilisée sans modification** : `alert.missing_player` (`'{name} n\'a pas encore consulté l\'oracle.'` etc.) — déjà présente dans les 3 thèmes depuis l'Epic 2, exactement comme le spec l'exige pour AC2 ("using `ThemeToneService.tone['alert.missing_player']`"). Ne PAS créer de nouvelle clé pour ce cas.

---

### Task 3 — `OpenPollsService`

**Fichier :** `apps/web/src/app/core/poll/open-polls.service.ts` (nouveau)

Reprend exactement la logique déjà écrite dans `Dashboard` (story 3.3/3.4) — extraction pure, aucun changement de comportement, juste un déplacement pour partage avec `Shell`.

```typescript
import { Injectable, computed, effect, inject, signal } from '@angular/core';
import type { SessionPollDto } from '@master-jdr/shared';
import { ModeService } from '../mode/mode.service';
import { PollService } from './poll.service';

@Injectable({ providedIn: 'root' })
export class OpenPollsService {
  private readonly modeSvc = inject(ModeService);
  private readonly pollSvc = inject(PollService);

  readonly openPolls = signal<Map<string, SessionPollDto>>(new Map());
  readonly count = computed(() => this.openPolls().size);

  private seq = 0;

  constructor() {
    effect(() => {
      const parties = this.modeSvc.playerParties();
      if (parties.length > 0) void this.refresh();
    });
  }

  private async refresh(): Promise<void> {
    const parties = this.modeSvc.playerParties();
    if (parties.length === 0) return;
    const seq = ++this.seq;
    const results = await Promise.allSettled(
      parties.map(p =>
        this.pollSvc.getCurrentPoll(p.id).then(poll => ({ id: p.id, poll })),
      ),
    );
    if (seq !== this.seq) return;
    const map = new Map<string, SessionPollDto>();
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.poll) {
        map.set(r.value.id, r.value.poll);
      }
    }
    this.openPolls.set(map);
  }
}
```

**Test `open-polls.service.spec.ts`** — pattern similaire à `mode.service.spec.ts` : mock `ModeService.playerParties` (signal) + `PollService.getCurrentPoll`, vérifier que `count()` reflète le nombre de polls OPEN retournés, et que `openPolls()` (Map) est correctement peuplée.

---

### Task 4 — Refactor `Dashboard`

**Fichier :** `apps/web/src/app/features/dashboard/dashboard.ts`

État actuel (post story 3.4) — À SUPPRIMER : `openPolls` (signal privé), `loadOpenPollsSeq`, le `constructor()` avec `effect()`, `loadOpenPolls()` (méthode privée). Remplacer par :

```typescript
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import type { InvitationDto } from '@master-jdr/shared';
import { ModeService } from '../../core/mode/mode.service';
import { InvitationsService } from '../../core/invitations/invitations.service';
import { OpenPollsService } from '../../core/poll/open-polls.service';
import { ThemeToneService } from '../../core/theme/theme-tone.service';
import { gameSystemName, partieKindLabel } from '../../core/parties/parties.util';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  private readonly modeSvc = inject(ModeService);
  private readonly invitations = inject(InvitationsService);
  private readonly openPollsSvc = inject(OpenPollsService);
  protected readonly theme = inject(ThemeToneService);

  protected readonly mode = this.modeSvc.mode;
  protected readonly parties = this.modeSvc.mjParties;
  protected readonly playerParties = this.modeSvc.playerParties;
  protected readonly received = signal<InvitationDto[]>([]);
  protected readonly openPolls = this.openPollsSvc.openPolls;
  protected readonly system = gameSystemName;
  protected readonly kind = partieKindLabel;

  async ngOnInit(): Promise<void> {
    await this.loadInvitations();
  }

  async accept(inv: InvitationDto): Promise<void> {
    await this.invitations.accept(inv.id);
    this.received.update((list) => list.filter((i) => i.id !== inv.id));
    await this.modeSvc.refreshPlayerParties();
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
```

**`dashboard.html` : aucun changement** — `openPolls().has(p.id)` continue de fonctionner à l'identique puisque `openPolls` est désormais un alias direct vers le signal du service partagé (même shape `Map<string, SessionPollDto>`).

**Test `dashboard.spec.ts`** (nouveau — ce composant n'a actuellement AUCUN test) : pattern `TestBed` + mock `OpenPollsService` avec un signal `openPolls` préréempli, vérifier que le badge `.poll-badge` apparaît pour une partie présente dans la map, absent sinon. Voir `calendar-view.spec.ts` pour le style de mocks/providers utilisé dans ce projet (`provideRouter([])`, `provideAnimationsAsync()`).

---

### Task 5 — Badge de navigation `Shell`

**Fichier :** `apps/web/src/app/layout/shell/shell.ts`

Ajouter :

```typescript
import { MatBadgeModule } from '@angular/material/badge';
import { OpenPollsService } from '../../core/poll/open-polls.service';

// Dans imports: [..., MatBadgeModule]
// Dans la classe :
private readonly openPollsSvc = inject(OpenPollsService);
protected readonly openPollsCount = this.openPollsSvc.count;
```

**Fichier :** `apps/web/src/app/layout/shell/shell.html`

Sur le bouton icône compte (ligne ~21) :

```html
<button
  mat-icon-button
  [matBadge]="openPollsCount()"
  [matBadgeHidden]="openPollsCount() === 0"
  matBadgeColor="warn"
  matBadgeSize="small"
  [matMenuTriggerFor]="menu"
  aria-label="Menu utilisateur"
>
  <mat-icon>account_circle</mat-icon>
</button>
```

**⚠️ Interprétation AC1** ("le badge est visible dans la navigation si plusieurs parties ont un poll ouvert") : lu comme "affiche le compte de parties à poll OPEN, particulièrement utile quand il y en a plusieurs" — pas une condition stricte "seulement si ≥ 2". Le badge s'affiche dès que le compte est ≥ 1, masqué à 0. Cohérent avec le premier Given/When/Then de l'AC1 qui décrit déjà le cas à 1 seule partie.

**Test `shell.spec.ts`** (nouveau — ce composant n'a actuellement AUCUN test). Providers à mocker : `AuthService` (`currentUser` signal), `ModeService` (`mode`, `hasMjParties` signals), `ThemeToneService` (`tone` signal via `TONE_MAP`, voir `partie-detail.spec.ts` pour le pattern), `OpenPollsService` (`count` signal), `provideRouter([])`. Vérifier : `matBadge` reflète `openPollsCount()`, badge absent (`matBadgeHidden`) quand count=0.

---

### Task 6 — `CalendarView` charge les membres

**Fichier :** `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`

État actuel (post story 3.4) : injecte déjà `PollService`, `MatSnackBar`. Ajouter :

```typescript
import { PartiesService } from '../../../core/parties/parties.service';
import type { PartieMemberDto } from '@master-jdr/shared'; // ajouter à l'import type existant

// injection :
private readonly partiesSvc = inject(PartiesService);

// nouveau signal :
protected readonly members = signal<PartieMemberDto[]>([]);
```

Dans `ngOnInit()`, après le chargement de `activePoll` (dans le bloc `if (id) { ... }`), ajouter :

```typescript
if (this.isMjMode()) {
  this.members.set(await this.partiesSvc.members(id).catch(() => []));
}
```

**Fichier :** `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`

```html
<app-poll-status [poll]="activePoll()!" [members]="members()" [busy]="pollActionPending()" (chosen)="onChooseDate($event)" />
```

**⚠️ CRITIQUE — Test existant à corriger** : `calendar-view.spec.ts` ne fournit actuellement **aucun provider `PartiesService`**. Comme pour `PollService` dans `partie-detail.spec.ts` (voir Task 8), injecter `PartiesService` réellement casserait la DI de tous les tests existants (dépendance `HttpClient` non fournie). **Ajouter impérativement** `{ provide: PartiesService, useValue: { members: vi.fn().mockResolvedValue([]) } }` aux providers de `createCalendarView()` dans `calendar-view.spec.ts`.

---

### Task 7 — `PollStatusPanel` : bannière/liste

**Fichier :** `apps/web/src/app/features/poll/poll-status/poll-status.ts`

Ajouter aux imports : `import { getMissingVoters } from '../../../core/poll/poll.util';` et `import type { PartieMemberDto } from '@master-jdr/shared';` (étendre l'import type existant).

```typescript
readonly members = input<PartieMemberDto[]>([]);

protected readonly missingVoters = computed(() => getMissingVoters(this.poll(), this.members()));
protected readonly allResponded = computed(() =>
  this.members().length > 0 && this.missingVoters().length === 0,
);

protected missingAlert(pseudo: string): string {
  return this.theme.tone()['alert.missing_player'].replace('{name}', pseudo);
}
```

`computed` doit être ajouté à l'import `@angular/core` existant.

**Fichier :** `apps/web/src/app/features/poll/poll-status/poll-status.html` — ajouter en haut du `<div class="poll-status">`, après le titre/scenario, avant `<ul class="poll-status__options">` :

```html
@if (members().length > 0) {
  @if (allResponded()) {
    <p class="poll-status__all-responded">{{ theme.tone()['alert.all_responded'] }}</p>
  } @else if (missingVoters().length > 0) {
    <ul class="poll-status__missing" aria-label="N'ont pas encore répondu">
      @for (m of missingVoters(); track m.userId) {
        <li>{{ missingAlert(m.pseudo) }}</li>
      }
    </ul>
  }
}
```

**SCSS** — ajouter `.poll-status__all-responded` (couleur succès, ex. `var(--mat-sys-primary, green)`) et `.poll-status__missing` (liste simple, `font-size: 0.8rem`, couleur atténuée).

**Tests à ajouter dans `poll-status.spec.ts`** : fournir `members` via `fixture.componentRef.setInput('members', [...])`, vérifier bannière "tous ont répondu" si tous les membres ont voté sur toutes les options du `fakePoll` existant, vérifier la liste des manquants sinon (adapter `fakePoll` ou ajouter un 3e membre non-votant pour ce cas).

---

### Task 8 — `PartieDetail` : statut du vote

**Fichier :** `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`

Ajouter :

```typescript
import { PollService } from '../../../core/poll/poll.service';
import { getRespondedCount } from '../../../core/poll/poll.util';
import type { SessionPollDto } from '@master-jdr/shared'; // étendre l'import type existant

// injection :
private readonly pollSvc = inject(PollService);

// nouveau signal :
protected readonly activePoll = signal<SessionPollDto | null>(null);

// computed :
protected readonly respondedCount = computed(() =>
  this.activePoll() ? getRespondedCount(this.activePoll()!, this.members()) : 0,
);

protected pollStatusLabel(): string {
  return this.theme.tone()['poll.status_summary']
    .replace('{responded}', String(this.respondedCount()))
    .replace('{total}', String(this.members().length));
}
```

Dans `ngOnInit()`, après `await this.loadMembers();` :

```typescript
this.activePoll.set(await this.pollSvc.getCurrentPoll(id).catch(() => null));
```

**Fichier :** `apps/web/src/app/features/parties/partie-detail/partie-detail.html` — dans `.scheduling-widget`, après le bloc `nextSessionLabel`/`no_session` existant, avant les liens `cta.find_date`/`cta.guild_calendar` :

```html
@if (activePoll(); as poll) {
  <p class="poll-status-line">{{ pollStatusLabel() }}</p>
}
```

Puis modifier les liens existants pour réutiliser `poll.vote_pending` côté joueur quand un poll est actif (sinon garder `cta.guild_calendar`) :

```html
@if (isMj()) {
  <a mat-flat-button color="primary" [routerLink]="['/parties', p.id, 'calendar']">
    {{ theme.tone()['cta.find_date'] }}
  </a>
} @else {
  <a mat-stroked-button [routerLink]="['/parties', p.id, 'guild-calendar']">
    {{ activePoll() ? theme.tone()['poll.vote_pending'] : theme.tone()['cta.guild_calendar'] }}
  </a>
}
```

**⚠️ CRITIQUE — Test existant à corriger** : `partie-detail.spec.ts` ne fournit actuellement **aucun provider `PollService`**. Injecter `PollService` réellement (via `inject(PollService)`) échouerait en DI car ce service utilise `HttpClient`, non fourni dans ce test (`provideHttpClient()` absent du TestBed). **Ajouter impérativement** `{ provide: PollService, useValue: { getCurrentPoll: vi.fn().mockResolvedValue(null) } }` aux providers de `createFixture()` dans `partie-detail.spec.ts`, sinon les 3 tests existants cassent immédiatement à la création du composant.

**Tests à ajouter dans `partie-detail.spec.ts`** : poll OPEN présent → `.poll-status-line` visible avec le bon texte (mock `getCurrentPoll` + `members` avec un mix voté/non-voté) ; pas de poll → `.poll-status-line` absente ; lien joueur utilise `poll.vote_pending` quand un poll est actif.

---

### Patterns à respecter

- Mêmes conventions que 3.2/3.3/3.4 : standalone components, signals, `@if/@for`, `firstValueFrom()` HTTP
- `effect()` dans `constructor()` pour réagir à des signals peuplés de façon asynchrone (pattern déjà établi dans `Dashboard`/`PartieDetail`)
- `MatBadgeModule` : `import { MatBadgeModule } from '@angular/material/badge';` — non utilisé ailleurs dans le projet, premier usage ici
- Commandes tests : `docker compose exec web pnpm test`

### Ce qui est déjà fait (ne pas re-livrer)

- Badge "Vote en attente" par carte sur le dashboard joueur (story 3.3, `dashboard.html:52-62`)
- Navigation du badge dashboard vers `/parties/:id/guild-calendar` → `PollResponseComponent` (story 3.3)
- Tone key `poll.vote_pending` (story 3.3)

### Hors périmètre (au-delà de cette story)

- Bouton de relance (`cta.send_reminder`, clé de ton déjà existante mais jamais câblée) — mentionné dans la conversation utilisateur comme un besoin futur, explicitement reporté
- Masquer le badge dashboard pour un joueur ayant déjà répondu à toutes les options (deferred depuis la review de 3.3)

## Dev Agent Record

### Debug Log

**Découverte technique importante (tests) :** un test de `partie-detail.spec.ts` vérifiant qu'un `ngOnInit` asynchrone (3 `await` séquentiels : `partie`, `members`, `activePoll`) peuple correctement un signal lu par le template a d'abord échoué de façon persistante (`activePoll()` restait `null`) malgré plusieurs cycles `fixture.detectChanges() + await fixture.whenStable()`. Investigation par logs a montré que `getCurrentPoll` (mock `vi.fn().mockResolvedValue(...)`) était bien appelé et résolvait la bonne valeur, mais que `whenStable()` ne garantissait PAS le drainage complet de cette chaîne de promesses simples (non liées à `HttpClient`, donc invisibles au tracking interne d'Angular) dans cet environnement de test zoneless. Aucun test préexistant dans ce projet n'avait jamais réellement exercé ce scénario (tous fixaient l'état de façon synchrone dans le test plutôt que de laisser `ngOnInit` le peupler nativement). **Fix :** remplacer l'attente par une boucle de drainage explicite de microtasks (`for (...) { await Promise.resolve(); fixture.detectChanges(); }`) avant le `whenStable()` final — robuste indépendamment du mécanisme interne de stabilité d'Angular. Ce pattern est à réutiliser pour tout futur test similaire (composant avec plusieurs `await` chaînés dans `ngOnInit` peuplant des signaux lus par le template).

### Completion Notes

Implémentation complète des 9 tasks de la story :
- `poll.util.ts` : helper pur `getMissingVoters()`/`getRespondedCount()`, testé indépendamment (6 tests).
- Tone keys `alert.all_responded` et `poll.status_summary` ajoutées dans les 3 thèmes (réutilise `alert.missing_player` existant sans duplication, comme prescrit).
- `OpenPollsService` créé — extraction pure de la logique déjà présente dans `Dashboard` (aucun changement de comportement), désormais partagée avec `Shell`.
- `Dashboard` refactoré pour consommer `OpenPollsService.openPolls` directement — suppression de la duplication (`loadOpenPolls`/`loadOpenPollsSeq`/`effect()` propre au composant).
- `Shell` : badge `matBadge` sur l'icône compte, reflète `OpenPollsService.count()`, masqué à 0.
- `CalendarView` : charge les membres de la partie (`PartiesService.members()`) uniquement en mode MJ, transmis à `PollStatusPanel`.
- `PollStatusPanel` : bannière "tous ont répondu" ou liste des non-votants selon l'input `members`.
- `PartieDetail` : ligne de statut "Vote ouvert — X/Y membres ont répondu" + lien contextualisé (MJ vs joueur, réutilise `poll.vote_pending` si un poll est actif).
- **2 pièges DI anticipés dans les Dev Notes, effectivement rencontrés et corrigés** : `partie-detail.spec.ts` et `calendar-view.spec.ts` ne fournissaient aucun mock `PollService`/`PartiesService` respectivement — ajoutés pour éviter une DI cassée par l'injection réelle de `HttpClient`.
- 22 nouveaux tests Vitest répartis sur 6 fichiers (2 nouveaux : `shell.spec.ts`, `dashboard.spec.ts`).
- Suite complète : 21 fichiers de test / 112 tests, 0 échec.

## File List

**Fichiers nouveaux :**
- `apps/web/src/app/core/poll/poll.util.ts`
- `apps/web/src/app/core/poll/poll.util.spec.ts`
- `apps/web/src/app/core/poll/open-polls.service.ts`
- `apps/web/src/app/core/poll/open-polls.service.spec.ts`
- `apps/web/src/app/layout/shell/shell.spec.ts`
- `apps/web/src/app/features/dashboard/dashboard.spec.ts`

**Fichiers modifiés :**
- `apps/web/src/app/core/theme/tones.ts`
- `apps/web/src/app/features/dashboard/dashboard.ts`
- `apps/web/src/app/layout/shell/shell.ts`
- `apps/web/src/app/layout/shell/shell.html`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`
- `apps/web/src/app/features/poll/poll-status/poll-status.ts`
- `apps/web/src/app/features/poll/poll-status/poll-status.html`
- `apps/web/src/app/features/poll/poll-status/poll-status.scss`
- `apps/web/src/app/features/poll/poll-status/poll-status.spec.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts`

### Review Findings

- [x] [Review][Patch] `OpenPollsService.refresh()` ne se déclenche jamais quand `playerParties()` passe de non-vide à vide — RÉSOLU : l'`effect()` appelle désormais `refresh()` inconditionnellement, et `refresh()` vide explicitement `openPolls` (au lieu d'un early-return silencieux) quand `parties.length === 0`, avec incrémentation de `seq` pour invalider correctement tout rafraîchissement en vol. Test ajouté (transition non-vide → vide). [`open-polls.service.ts:16-27`]
- [x] [Review][Patch] Aucune couverture de test pour la garde "members vide" de `PollStatusPanel` — RÉSOLU : test ajouté vérifiant `allResponded() === false` et `missingVotersForOption() === []` avec `members` non fourni (valeur par défaut `[]`). [`poll-status.spec.ts`]
- [x] [Review][Defer] Un membre qui rejoint la partie APRÈS la création d'une option de vote apparaît immédiatement comme "manquant" sur cette option historique (et inversement, un membre retiré disparaît de tous les décomptes) — comportement plausible mais non documenté comme intentionnel, aucun test ne couvre ce cas. [`poll.util.ts`]
- [x] [Review][Defer] La chaîne réactive `ModeService.playerParties()` → `OpenPollsService.effect()` → `Shell`/`Dashboard` n'est jamais testée de bout en bout (chaque composant mocke `OpenPollsService` directement) — seul `open-polls.service.spec.ts` teste le service isolément. Risque de régression silencieuse si le câblage casse. [`shell.spec.ts`, `dashboard.spec.ts`]
- [x] [Review][Defer] `OpenPollsService.refresh()` absorbe silencieusement les échecs de `getCurrentPoll` via `Promise.allSettled` — une partie dont la requête échoue disparaît de `openPolls` de façon indiscernable d'un "pas de vote en cours", sans indication d'erreur. Pattern hérité du code original de `Dashboard` (story 3.3), pas une régression introduite ici. [`open-polls.service.ts:27-38`]
- [x] [Review][Dismiss] Clés de ton `alert.missing_player`/`poll.vote_pending` "manquantes" — faux positif vérifié : présentes dans les 3 thèmes depuis les stories 2.x/3.3, simplement absentes du diff car non modifiées par cette story.
- [x] [Review][Dismiss] `<app-poll-status>` prétendument rendu hors mode MJ avec `members` vide — faux positif vérifié : le composant n'est rendu que dans le bloc `@if (isMjMode())` de `calendar-view.html`, jamais côté joueur (qui utilise `PollResponseComponent`).
- [x] [Review][Dismiss] Binding template `@if (activePoll(); as poll)` avec `poll` non utilisé — cosmétique, `pollStatusLabel()` relit `activePoll()` en interne sans divergence possible, aucun impact fonctionnel.
- [x] [Review][Dismiss] `missingVotersForOption(opt)` appelé deux fois par option et par cycle de détection de changements — perf négligeable à l'échelle réaliste d'une partie de JDR (quelques joueurs).
- [x] [Review][Dismiss] Boucle de drainage de microtasks dans `partie-detail.spec.ts` qualifiée de "test smell" — déjà documentée intentionnellement dans le Debug Log de cette story, pas une découverte nouvelle.
- [x] [Review][Dismiss] `PartieDetail.loadMembers()` inconditionnel MJ/joueur — vérifié non problématique : `listMembers` backend autorise MJ ou membre (`getViewable`), pas de risque 403.
- [x] [Review][Dismiss] Vérité vacueuse de `getMissingVoters` sur un poll sans options — déjà anticipé et testé intentionnellement (`poll.util.spec.ts`), cas théorique sans occurrence réelle (`SessionPoll` a toujours ≥1 option).

## Change Log

| Date | Change |
|------|--------|
| 2026-07-02 | Story créée (bmad-create-story) |
| 2026-07-02 | Implémentation complète (9 tasks). 112 tests passent, 0 régression. Découverte et documentation d'un pattern de test pour ngOnInit asynchrone en environnement zoneless. |
| 2026-07-02 | Vérification en direct (données réelles en base) + retour utilisateur : la granularité "manquant" globale (AC2) était trompeuse pour un vote partiel — un membre ayant répondu à 3 options sur 4 restait listé comme n'ayant "pas répondu", sans indiquer quelle date précise manquait. Affiné : `getMissingVotersForOption(opt, members)` ajouté dans `poll.util.ts`, la liste des manquants est désormais affichée **par option** (sous chaque créneau) au lieu d'une liste globale en tête de panneau. La bannière "tous ont répondu" reste globale (n'affiche que si vraiment personne ne manque nulle part). 4 nouveaux tests. 116 tests passent, 0 régression. Aucune restriction ajoutée côté soumission : un joueur peut toujours voter sur un sous-ensemble des dates. |
| 2026-07-02 | Code review (3 layers) : 0 decision-needed, 2 patch, 3 defer, 9 dismissed (dont 3 faux positifs vérifiés directement dans le code : clés de ton manquantes, `poll-status` hors mode MJ, binding template mort). 2 patches appliqués : `OpenPollsService` vide désormais correctement `openPolls` quand `playerParties()` devient vide, test ajouté pour la garde "members vide" de `PollStatusPanel`. 118 tests passent, 0 régression.
