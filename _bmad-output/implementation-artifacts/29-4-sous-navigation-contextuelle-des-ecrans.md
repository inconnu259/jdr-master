---
baseline_commit: 002aa32ec193f3c7dfb50cc7d2f02bcd4302f64f
---

# Story 29.4: Sous-navigation contextuelle des écrans

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que le bandeau du haut m'indique où je suis et que chaque écran propose ses propres sections quand il en a,
so that je comprenne d'un coup d'œil ce que je regarde et ce que je peux y faire, sans deviner.

## Contexte

**Quatrième story de l'épic 29**, insérée par `correct-course` (2026-08-08) juste après 29.3 (barre à 4 destinations, `done`) — son seul prérequis réel. En utilisant 29.3, l'utilisateur a identifié que le bandeau du haut du `Shell` (le `mat-toolbar` avec juste « master-jdr ») reste vide sur tous les écrans, et que rien ne signale localement « où je suis » sur les écrans qui ont des sous-sections.

**Direction validée sur maquette** avec l'utilisateur le 2026-08-09 (workflow `bmad-ux`, Update mode) : voir [`_bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/mockups/key-partie-detail-navigation-contextuelle.html`](../planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/mockups/key-partie-detail-navigation-contextuelle.html) et `EXPERIENCE.md` § Navigation contextuelle locale / Component Patterns §4.8 / `DESIGN.md` §7.6 bis `ContextualHeader`.

**Ce que cette story livre :**
1. Un **bandeau contextuel** (titre + sous-titre optionnel), affiché sur les 5 écrans authentifiés (Dashboard, MyCharacters, CalendarView, Account, PartieDetail), remplaçant le vide actuel.
2. La **sous-navigation locale** de l'écran de détail d'une partie (`PartieDetail`) — qui existe **déjà** (`mat-tab-group` interne) — n'a **aucune reconstruction à faire** : seule sa distinction visuelle vis-à-vis de la barre globale doit être vérifiée (voir Task 2, probablement déjà conforme par défaut Material).

**Ce que cette story ne livre PAS** (29.5, story suivante) : le découpage de la fiche personnage en sections (équipement/journal sortis) — cette story-ci pose seulement le mécanisme générique du bandeau contextuel, que 29.5 réutilisera.

### Écart entre la maquette et l'implémentation réelle — lu dans le code, pas dans la maquette

La maquette montre un wordmark réduit (« jdr ») **à l'intérieur** du bandeau contextuel, en supposant que le `mat-toolbar` disparaîtrait sur mobile. **Ce n'est pas le cas** : `Shell` (livré par 29.3) affiche le `mat-toolbar` avec le wordmark complet (« master-jdr ») **à tout moment, sur les deux formats** (`apps/web/src/app/layout/shell/shell.html` lignes 1-6, inchangé par 29.3, `.logo` juste réduit en taille sous 767px). Le rôle de repère de marque est donc **déjà couvert**. **Décision retenue pour cette story** : le bandeau contextuel ne porte **pas** son propre wordmark — seulement le titre et le sous-titre optionnel. Écart mineur assumé par rapport à la maquette, découvert à la lecture du code réel de 29.3 (le mock illustrait l'intention, pas un mandat DOM littéral — cf. `EXPERIENCE.md` : « en cas de conflit avec une planche de `.working/`, ce document gagne »).

## Acceptance Criteria

1. **Given** j'ouvre un écran de l'application, **When** le bandeau du haut s'affiche, **Then** il porte un titre contextuel à l'écran (par exemple le nom de la partie sur son écran de détail), **And** il ne reste jamais vide comme aujourd'hui, **And** un sous-titre n'apparaît que lorsqu'il apporte une information utile non visible ailleurs sur l'écran (par exemple le rôle MJ/joueur sur l'écran de détail d'une partie) — jamais systématique.
2. **Given** la barre à quatre destinations (Parties, Personnages, Calendrier, Compte), **When** n'importe quel écran s'affiche, y compris ceux dotés d'une sous-navigation locale, **Then** elle reste visible et atteignable en un geste, **And** le bandeau contextuel s'ajoute à elle, il ne la remplace ni ne la masque jamais.
3. **Given** un écran contextualisé s'affiche (par exemple le détail d'une partie), **When** la barre à quatre destinations est rendue, **Then** aucune de ses entrées ne porte la teinte ni l'`aria-current` actifs, y compris celle par laquelle on est arrivé, **And** c'est le bandeau contextuel (et la sous-navigation locale quand elle existe) qui répondent seuls à « où suis-je ».
4. **Given** l'écran de détail d'une partie, **When** il s'affiche, **Then** sa sous-navigation locale existante (`mat-tab-group` : Détails, Ma fiche, Invitations, Scénarios, Chronologie selon le rôle) reste **exactement** la même — aucune reconstruction — **And** elle est visuellement distincte de la barre globale.
5. **Given** une section de la sous-navigation locale active, **When** elle s'affiche, **Then** elle est distinguée autrement que par la seule couleur, selon le même principe que l'entrée active de la barre globale (29.3, AC3).
6. **Given** un écran sans sous-navigation locale propre (Dashboard, Mes personnages, Calendrier, Compte), **When** il s'affiche, **Then** le bandeau contextuel porte un titre mais aucune sous-navigation locale vide n'apparaît.

## Tasks / Subtasks

### Frontend — mécanisme générique

- [x] Task 1 — `ContextualNavService` (AC: #1, #2, #6)
  - [x] Créer `apps/web/src/app/core/navigation/contextual-nav.service.ts` (`providedIn: 'root'`, patron des autres services de `core/*`) :
    ```ts
    @Injectable({ providedIn: 'root' })
    export class ContextualNavService {
      readonly title = signal<string | null>(null);
      readonly subtitle = signal<string | null>(null);

      constructor() {
        // Vide le bandeau AVANT que le nouveau composant ne s'active — NavigationStart, jamais
        // NavigationEnd (qui se déclenche APRÈS ngOnInit() du nouveau composant : un clear() sur
        // NavigationEnd effacerait le titre que ce composant vient tout juste de poser).
        // Pas de takeUntilDestroyed() : service root, vit pour toute la durée de l'app — rien à
        // désabonner.
        inject(Router)
          .events.pipe(filter((e) => e instanceof NavigationStart))
          .subscribe(() => this.clear());
      }

      set(config: { title: string; subtitle?: string | null }): void {
        this.title.set(config.title);
        this.subtitle.set(config.subtitle ?? null);
      }

      clear(): void {
        this.title.set(null);
        this.subtitle.set(null);
      }
    }
    ```
    **Point critique, à ne pas inverser** : le nettoyage se fait sur `NavigationStart` (avant l'activation du nouveau composant), jamais sur `NavigationEnd` (après). Angular exécute `ngOnInit()` du composant nouvellement activé **avant** d'émettre `NavigationEnd` — un `clear()` sur `NavigationEnd` effacerait donc systématiquement le titre que le composant venait de poser dans son propre `ngOnInit()`.
  - [x] `apps/web/src/app/core/navigation/contextual-nav.service.spec.ts` : `set()` met à jour `title`/`subtitle` ; `clear()` les remet à `null` ; une navigation (`Router.navigateByUrl`/`.navigate()` avec `provideRouter([...])` de test) déclenche `clear()` — vérifier via un `set()` préalable suivi d'une navigation, `title()`/`subtitle()` doivent redevenir `null` juste après.

- [x] Task 2 — `Shell` rend le bandeau contextuel (AC: #1, #2, #3)
  - [x] `apps/web/src/app/layout/shell/shell.ts` : injecter `ContextualNavService`, exposer `protected readonly contextualNav = inject(ContextualNavService);`. Ne **pas** toucher au `mat-toolbar` existant (lignes 1-6) ni à la barre à 4 destinations (`<nav class="nav-bar">`, lignes 8-54) — ce sont deux blocs déjà livrés et testés par 29.3, aucun changement requis.
  - [x] `apps/web/src/app/layout/shell/shell.html` : ajouter, entre `</nav>` (fin de la barre à 4 destinations) et `<main class="content">`, un nouveau bloc :
    ```html
    @if (contextualNav.title(); as title) {
      <div class="contextual-header">
        <div class="titles">
          <span class="t1">{{ title }}</span>
          @if (contextualNav.subtitle(); as subtitle) {
            <span class="t2">{{ subtitle }}</span>
          }
        </div>
      </div>
    }
    ```
    Pas de wordmark ici (cf. Contexte — déjà couvert par le `mat-toolbar` existant).
  - [x] `apps/web/src/app/layout/shell/shell.scss` : styles `.contextual-header`/`.titles`/`.t1`/`.t2`, cohérents avec `.nav-bar` (même fond `var(--mat-sys-surface-container, #f5f5f5)`, même `border-bottom`), `.t1` en gras (poids 600-700, taille ~1rem, ellipsis si trop long), `.t2` en `var(--mat-sys-on-surface-variant, #666)`, taille ~0.75rem.
  - [x] AC3 — Vérifier (test, pas de nouveau code) : la barre à 4 destinations utilise déjà `routerLinkActive` avec correspondance de route par défaut (non-exacte sauf `/`) — une route enfant plus profonde qu'un des 4 liens (ex. `/parties/:id`) ne fait déjà **matcher aucune** des 4 entrées, donc aucune n'est active quand un écran contextualisé s'affiche. Comportement déjà obtenu par 29.3, rien à coder — seulement à tester explicitement pour cette story (cf. Task 4).

- [x] Task 3 — Câblage des 5 écrans authentifiés (AC: #1, #4, #6)
  - [x] `apps/web/src/app/features/dashboard/dashboard.ts` : dans `ngOnInit()`, `this.contextualNav.set({ title: this.theme.tone()['nav.my_games'] });` (injecter `ContextualNavService`). Redondance mineure acceptée : le `<h1>` existant de `dashboard.html:2` utilise déjà la même clé — laissé inchangé (ne pas toucher au template pour ce doublon, risque/gain disproportionné).
  - [x] `apps/web/src/app/features/characters/my-characters/my-characters.ts` : `ngOnInit()`, `this.contextualNav.set({ title: this.theme.tone()['my_characters.title'] });`. Même redondance acceptée avec le `<h1>` existant (`my-characters.html:2`).
  - [x] `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` : `ngOnInit()`, `this.contextualNav.set({ title: this.theme.tone()['nav.calendar'] });`. Cet écran n'a **aujourd'hui aucun titre** — pas de redondance ici, c'est un ajout net.
  - [x] `apps/web/src/app/features/account/account.ts` : ajouter `implements OnInit` + `ngOnInit(): void { this.contextualNav.set({ title: this.theme.tone()['account.title'] }); }` (la classe n'a actuellement aucun `ngOnInit`, cf. Dev Notes). Redondance mineure acceptée avec le `mat-card-title` existant (`account.html:2`).
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` : **réactif**, pas un simple appel statique dans `ngOnInit()` — le nom de la partie et le rôle (MJ/joueur) se chargent de façon asynchrone. Ajouter un `effect()` dans le constructeur (aux côtés des `effect()` déjà présents) :
    ```ts
    effect(() => {
      const p = this.partie();
      if (!p) return;
      this.contextualNav.set({
        title: p.name,
        subtitle: this.isMj() ? 'Maître' : null,
      });
    });
    ```
    Le sous-titre « Maître » n'apparaît que pour le MJ (AC1 : information utile ici — les actions disponibles diffèrent selon le rôle sur cet écran ; aucune valeur pour un joueur, donc `null`, jamais affiché). Redondance mineure acceptée avec `mat-card-title`/`p.name` existant (`partie-detail.html:4`) — ne **pas** toucher à la structure de carte existante pour ce doublon (surface de risque disproportionnée sur un composant déjà volumineux, cf. Dev Notes).
  - [x] AC4/AC5 — `mat-tab-group` de `PartieDetail` (`partie-detail.html:49`) : **aucun changement de structure**. Vérifier seulement (test, cf. Task 4) que l'onglet actif est déjà distingué au-delà de la couleur (Angular Material anime nativement un soulignement, une forme, en plus de la teinte — comportement par défaut du composant, jamais modifié par ce projet) et que le fond du groupe d'onglets (`mat-card-content`) est déjà visuellement distinct du fond de la barre globale (`var(--mat-sys-surface-container)`) — c'est déjà le cas par défaut, aucune classe CSS dédiée n'existe aujourd'hui sur le tab-group et aucune n'est requise par cette story.

- [x] Task 4 — Tests (AC: #1, #2, #3, #4, #5, #6)
  - [x] `apps/web/src/app/core/navigation/contextual-nav.service.spec.ts` : cf. Task 1.
  - [x] `apps/web/src/app/layout/shell/shell.spec.ts` : nouveau describe — injecter `ContextualNavService` dans le test, appeler `.set({ title: 'Les Cendres de Kavaan', subtitle: 'Maître' })`, `detectChanges()`, vérifier que `.contextual-header .t1`/`.t2` affichent le bon texte ; vérifier l'absence du bloc quand `title()` est `null` (état par défaut) ; vérifier qu'après une navigation (`Router.navigate(['/'])`) suivant un `.set()` manuel, le bandeau redevient vide (comportement du service, testé ici au niveau intégration avec le composant).
  - [x] `apps/web/src/app/features/dashboard/dashboard.spec.ts`, `my-characters.spec.ts`, `calendar-view.spec.ts`, `account.spec.ts` : un test chacun — `ContextualNavService` (réelle ou mock minimal `{ set: vi.fn() }`) reçoit un appel `set()` avec le titre attendu après `ngOnInit()`/montage.
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` : deux tests — le sous-titre vaut `'Maître'` quand `isMj()` est vrai, `null`/absent d'appel avec sous-titre quand joueur ; le titre suit `partie().name`.
  - [x] Test AC3 dans `shell.spec.ts` ou `partie-detail.spec.ts` (au choix, l'un suffit) : après navigation vers une route simulée de détail de partie (ou assertion directe sur le comportement déjà couvert par 29.3 — `routerLinkActive` non-exact ne matche aucune des 4 entrées sur une route enfant), aucune entrée de la barre globale ne porte `nav-bar__link--active`/`aria-current`.

### Corrections post-test (2026-08-09, retour utilisateur avant clôture)

L'utilisateur a testé l'implémentation en conditions réelles et identifié des écarts avec la maquette validée, tous issus de choix de scope pris pour limiter le risque pendant l'implémentation initiale. Plan validé en mode plan avant correction (`hazy-pondering-dewdrop.md`).

- [x] **A** — Bandeau mobile : le `mat-toolbar` (wordmark complet) et le bandeau contextuel s'empilaient en deux bandeaux sur mobile, contrairement à la maquette (un seul, wordmark réduit + titre). `shell.scss` masque désormais le `mat-toolbar` sous 767px ; `shell.html`/`shell.scss` ajoutent un wordmark compact (`.wordmark-compact`, « jdr ») dans `.contextual-header`, visible uniquement sur mobile. Desktop inchangé.
- [x] **B** — Titres redondants retirés : `<h1>` de `dashboard.html`/`my-characters.html`, `mat-card-title` de `account.html`/`partie-detail.html`. Le bandeau contextuel devient la seule source du titre ; `.titles .t1` grossi de 1rem à 1.3rem dans `shell.scss` pour compenser.
- [x] **G** (2026-08-09, second retour) — Sous-titres manquants sur le bandeau : `mat-card-header`/`mat-card-subtitle` (système · type, ex. « Ryuutama · Campagne épisodique ») entièrement retiré de `partie-detail.html` — cette info passe dans le sous-titre du bandeau contextuel (`ContextualNavService`), à la place du rôle « Maître » qui y était initialement (retiré du bandeau, reste visible via les actions MJ-only déjà à l'écran). Gain d'espace supplémentaire, la sous-navigation locale suit désormais directement le bandeau sans aucun en-tête de carte entre les deux, conforme à la maquette.
- [x] **C** — Écran Partie : `.detail-body` (roster-rail desktop + `mat-tab-group`) déplacé pour suivre immédiatement `mat-card-header`, avant l'avertissement d'homonymie et l'aperçu de troupe mobile (pure réorganisation du template, aucune logique d'onglet touchée). Palette des onglets restylée via surcharge de CSS custom properties Material (`--mat-tab-header-*-label-text-color`, `--mdc-tab-indicator-active-indicator-color`) vers `--jdr-accent-1`/`--mat-sys-on-surface-variant`, au lieu de la couleur primary M3 par défaut.
- [x] **D** — Bouton « retour à la liste » de l'écran Partie retiré (`partie-detail.html`, pointait vers `/`, déjà atteignable depuis la barre globale) ; clé de thème `partie.back_btn` retirée des 3 thèmes dans `tones.ts` (devenue inutilisée).
- [x] **E** — Bouton retour de `CalendarView` (Story 8.8, AC6) rendu conditionnel à `partieId()` — reste affiché sur les routes scopées à une Partie (`/parties/:id/calendar`, `/parties/:id/guild-calendar`, non atteignables depuis la barre globale), disparaît sur `/profile/calendar` (destination globale déjà accessible en un geste).
- [x] **F** — Bug de formatage de l'équipement sur la fiche personnage (signalé par l'utilisateur, sans lien avec cette story) : noté dans `sprint-status.yaml`, entrée `29-5-fiche-personnage-en-sections-routees`, à traiter à l'occasion du découpage de cette story future.

### Review Findings

- [x] [Review][Patch] Titre du bandeau contextuel porté par un `<span>`, pas un heading — perte de repère de landmark pour les lecteurs d'écran [apps/web/src/app/layout/shell/shell.html] — Corrigé : `role="heading" aria-level="1"` ajouté sur le `<span class="t1">` (décision utilisateur, pas de remplacement par `<h1>`).
- [x] [Review][Patch] Bandeau contextuel vidé peu après le chargement de CalendarView et après chaque recherche par plage de dates [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:215,237,422] — Corrigé : `contextualNav.set()` réémis juste après chacune des deux navigations internes (`ngOnInit`, `onSearch()`) qui déclenchaient `NavigationStart` → `clear()` sans que `ngOnInit` ne se relance (même instance de composant).
- [x] [Review][Patch] `mat-toolbar` masqué sans condition sur mobile — 6 routes authentifiées non câblées à `ContextualNavService` se retrouvent sans aucun bandeau [apps/web/src/app/layout/shell/shell.scss:70-72, apps/web/src/app/app.routes.ts] — Corrigé : masquage conditionné à `contextualNav.title()` (`[class.hidden-mobile]` sur `mat-toolbar`), le wordmark complet reste le repli sur les routes non câblées.
- [x] [Review][Patch] Titre du bandeau non réactif au changement de thème sur l'écran Compte, qui héberge pourtant le sélecteur de thème [apps/web/src/app/features/account/account.ts:200-202] — Corrigé : `contextualNav.set()` déplacé dans un `effect()` du constructeur (comme `PartieDetail`), `ngOnInit()`/`implements OnInit` retirés (devenus inutiles).
- [x] [Review][Defer] `PartieDetail` : le sous-titre du bandeau resterait périmé si Angular réutilisait l'instance de composant lors d'un changement direct de `:id` [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:337-345] — deferred, pre-existing (limitation déjà documentée depuis la Story 18.3, aucun parcours de navigation actuel ne la déclenche)

## Dev Notes

### Project Structure Notes

- **Nouveaux** : `apps/web/src/app/core/navigation/contextual-nav.service.ts`, `.spec.ts`.
- **Modifiés** : `apps/web/src/app/layout/shell/shell.html`/`.ts`/`.scss`/`.spec.ts` ; `apps/web/src/app/features/dashboard/dashboard.ts`/`.spec.ts` ; `apps/web/src/app/features/characters/my-characters/my-characters.ts`/`.spec.ts` ; `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`/`.spec.ts` ; `apps/web/src/app/features/account/account.ts`/`.spec.ts` ; `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`/`.spec.ts`.
- **Non touchés** : tous les templates `.html` des 5 écrans (aucune structure de carte/heading existante modifiée, cf. redondances mineures acceptées ci-dessus) ; `apps/web/src/app/layout/shell/shell.html` lignes 1-54 (mat-toolbar + barre à 4 destinations, déjà livrées par 29.3) ; `partie-detail.html:49` (`mat-tab-group`, aucune reconstruction) ; `app.routes.ts` ; toute logique backend.
- **Aucune nouvelle dépendance** — `@angular/core` (`signal`, `effect`, `inject`), `@angular/router` (`Router`, `NavigationStart`) et `rxjs` (`filter`) sont déjà utilisés ailleurs dans l'app.

### Ce qui doit continuer de fonctionner

- La barre à 4 destinations (29.3) — inchangée, ses tests existants (`shell.spec.ts`) doivent tous rester verts.
- Le `mat-tab-group` de `PartieDetail` et toute sa logique (`selectedTabIndex`, `onTabIndexChange`, `defaultTabIndex`, `tabSetKey`, `MJ_INVITATIONS_TAB_INDEX`, `openInvitationsTab()`) — **aucune modification**, cf. Task 3.
- Les `<h1>`/`mat-card-title` existants de Dashboard, MyCharacters, Account, PartieDetail — laissés en place tels quels (redondance mineure acceptée, cf. Task 3).
- Le chargement asynchrone de `PartieDetail.partie()` — le `effect()` du bandeau contextuel doit être purement réactif (jamais bloquer ni dupliquer un appel réseau).

### Hors périmètre

- Le découpage de la fiche personnage en sections (équipement/journal) — story 29.5, qui réutilisera `ContextualNavService` tel quel.
- Toute restructuration du layout interne de `PartieDetail` (déplacer le `mat-tab-group` plus haut dans le DOM pour qu'il soit visuellement collé au bandeau) — non demandé par les ACs, risque disproportionné sur un composant déjà volumineux (cf. Contexte).
- Un vrai logo graphique (question ouverte par l'utilisateur pendant la revue de la maquette, explicitement mise de côté, hors périmètre de cette story).
- Bouton « Retour » dédié — non nécessaire, la barre globale reste toujours accessible (29.3).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.4] — Story, Acceptance Criteria (reprises telles quelles), note d'insertion post-correct-course.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md#Navigation contextuelle locale] — Règle de neutralité de la barre globale (raisonnement complet), renvoi vers Component Patterns §4.8.
- [Source: .../EXPERIENCE.md#4.8 Bandeau contextuel] — Spécification comportementale : wordmark (non retenu ici, cf. Contexte), titre, sous-titre conditionnel ; déclencheur du sous-titre laissé à l'appréciation de l'écran.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/DESIGN.md#7.6 bis ContextualHeader] — Tokens visuels du bandeau (fond dégradé, tailles, `{colors.text-muted}` pour le sous-titre).
- [Source: .../DESIGN.md#7.6 BottomNav / TopNav] — Note de neutralité ajoutée : aucune entrée active sur écran contextualisé.
- [Source: mockups/key-partie-detail-navigation-contextuelle.html] — Maquette validée avec l'utilisateur (combo wordmark réduit + sous-titre conditionnel — nuancé par l'écart documenté en Contexte).
- [Source: apps/web/src/app/layout/shell/shell.html, shell.ts, shell.scss] — État actuel du `Shell` livré par 29.3, à étendre sans y toucher pour ses parties existantes.
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts, partie-detail.html] — Logique d'onglets existante (`selectedTabIndex`/`tabSetKey`/`MJ_INVITATIONS_TAB_INDEX`) à ne jamais reconstruire ; structure de carte (`mat-card-title`) à ne pas toucher.
- [Source: apps/web/src/app/features/dashboard/dashboard.html, my-characters.html, account.html] — `<h1>`/`mat-card-title` existants et leurs clés de thème, réutilisées telles quelles pour le titre du bandeau contextuel.
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts] — Écran sans titre existant, seul cas net (pas de redondance) de cette story.
- [Source: apps/web/src/app/core/theme/tones.ts] — Clés `nav.my_games`, `my_characters.title`, `nav.calendar`, `account.title` réutilisées telles quelles, aucune nouvelle clé requise pour cette story.
- [Source: _bmad-output/implementation-artifacts/29-3-navigation-a-quatre-destinations.md] — Story précédente : patron `routerLinkActive` non-exact déjà en place, badge de vote relogé sur Parties, leçon sur les pièges `matBadge`/`aria-hidden` (sans rapport direct mais même fichier `shell.html`, à ne pas régresser).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Suite Vitest web complète (`docker compose exec web pnpm ng test --watch=false`) : 84 fichiers, 1141 tests, tous verts.
- `docker compose exec web pnpm eslint <fichiers touchés> --fix` : propre après auto-fix (formatage Prettier uniquement). 3 erreurs pré-existantes non corrigées (`calendar-view.ts` lignes 279/317, `calendar-view.spec.ts` ligne 128) — confirmées par `git diff` comme hors du diff de cette story (aucune des 3 insertions de cette story n'est à proximité), non touchées.
- `docker compose exec web pnpm build` : compilation propre (tous les chunks générés, y compris `my-characters` légèrement grossi de 2.60 kB → 2.70 kB) ; échoue seulement sur `bundle initial exceeded maximum budget` (1.21 MB vs. budget 1 MB, `angular.json`) — confirmé **préexistant**, déjà signalé à l'identique par 29-2 et 29-3, taille identique (1.21 MB, aucune augmentation mesurable côté chemin eager malgré `ContextualNavService` ajouté à `Shell`). Hors périmètre (pas un AC, `angular.json` non listé dans les Tasks).
- **Corrections post-test (A-F)** : suite complète re-exécutée après chaque correction (pas seulement à la fin) — 1142 tests verts (un test ajouté nettement : bouton retour absent sur route globale du calendrier). Build re-vérifié après restyle des onglets : compilation propre, budget de bundle toujours seul point d'échec (1.21 MB, inchangé — `my-characters` même légèrement réduit à 2.50 kB après retrait du `<h1>`).
- **Revue de code (`bmad-code-review`, 2026-08-09)** : 3 couches parallèles (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Conformité spec confirmée intégralement (AC1-6, corrections A-G) par l'Acceptance Auditor. 4 patches appliqués après vérification directe du code (pas seulement du diff) : (1) `CalendarView` — `contextualNav.set()` réémis après les deux navigations internes (`ngOnInit`/`onSearch`) qui vidaient le bandeau via `NavigationStart` sans jamais le restaurer ; (2) `Shell` — `mat-toolbar` masqué sur mobile seulement quand `contextualNav.title()` est renseigné (`[class.hidden-mobile]`), au lieu d'un masquage inconditionnel qui laissait 6 routes authentifiées non câblées (formulaire de Partie, fiche/création de personnage, scénarios) sans aucun en-tête mobile ; (3) `Account` — `contextualNav.set()` déplacé dans un `effect()` du constructeur (`ngOnInit`/`implements OnInit` retirés), le titre du bandeau ne suivait pas un changement de thème effectué sans navigation sur cet écran qui héberge justement le sélecteur de thème ; (4) bandeau contextuel — `role="heading" aria-level="1"` ajouté sur `.t1` (décision utilisateur), qui était le seul repère de titre restant après le retrait des `<h1>`/`mat-card-title` mais ne portait aucune sémantique de heading. 1 item différé (`PartieDetail`, réutilisation d'instance de composant sur changement de `:id`, limitation pré-existante Story 18.3, aucun parcours actuel ne la déclenche) — voir `deferred-work.md`. Suite complète re-exécutée après les 4 patches : 1142 tests verts, build inchangé (budget de bundle pré-existant seul point d'échec).

### Completion Notes List

- Toutes les tâches (1-4) complétées, tous les ACs (#1-#6) satisfaits.
- `ContextualNavService` (nouveau, `core/navigation/`) : `title`/`subtitle` signaux, `set()`/`clear()`, auto-nettoyage sur `NavigationStart` (jamais `NavigationEnd`, cf. commentaire dans le code — piège documenté dans la story, vérifié par test dédié).
- `Shell` étendu (pas remanié) : nouveau bloc `.contextual-header` entre la barre à 4 destinations et `<main>`, purement additif — `mat-toolbar` et `<nav class="nav-bar">` de 29.3 non touchés.
- 5 écrans câblés : Dashboard/MyCharacters/CalendarView/Account (appel statique dans `ngOnInit()`, réutilisant les clés de thème déjà existantes) ; PartieDetail (réactif via `effect()`, sous-titre « Maître » uniquement pour le MJ).
- `PartieDetail.mat-tab-group` : **zéro modification** — vérifié par les 80 tests existants du composant, tous restés verts après les changements de cette story.
- AC3 (barre globale neutre sur écran contextualisé) : comportement déjà obtenu par la correspondance de route non-exacte de `routerLinkActive` (29.3) — testé explicitement pour cette story (`shell.spec.ts`, navigation vers une route enfant simulée `/parties/:id`).
- **Corrections post-test (2026-08-09)**, après retour utilisateur en conditions réelles : les redondances de titre initialement acceptées comme « mineures » se sont révélées réelles à l'usage (perte d'espace notable sur mobile) — `<h1>`/`mat-card-title` retirés des 5 écrans, bandeau contextuel grossi en compensation. Wordmark réduit réintroduit dans le bandeau (mobile uniquement, fusionné avec lui — le `mat-toolbar` s'empilait en un second bandeau). Sous-navigation locale de `PartieDetail` repositionnée (suit immédiatement le bandeau) et restylée (palette accent du thème). Bouton « retour à la liste » de `PartieDetail` retiré (redondant avec la barre globale) ; bouton retour de `CalendarView` rendu conditionnel (utile seulement hors de la destination globale).
- **Second retour (2026-08-09)** : le `mat-card-subtitle` (système · type) restait dans la carte de `PartieDetail`, jugé « non dupliqué » — l'utilisateur a signalé qu'il devait lui aussi rejoindre le bandeau (plus de place gagnée, plus de `mat-card-header` du tout). Le sous-titre du bandeau passe de « Maître » (rôle) à « Ryuutama · Campagne épisodique » (système · type) pour tous les viewers — choix utilisateur explicite entre les deux, question posée avant modification. Détail complet : section « Corrections post-test » des Tasks/Subtasks ci-dessus, plan validé dans `hazy-pondering-dewdrop.md`.
- **Troisième retour (2026-08-09)** : espace résiduel entre le bandeau et la sous-navigation locale, absent de la maquette — isolé à `PartieDetail` uniquement (confirmé par l'utilisateur, pas sur les autres écrans). `margin: 1rem auto` de `.detail` retiré (`margin: 0 auto`). Le padding-haut restant après ce premier correctif provient de `mat-card-content` — Material lui applique un padding par défaut pensé pour suivre un `mat-card-header`, désormais absent ; neutralisé (`padding-top: 0`), scopé à `.detail-body mat-card-content`. Pas de vérification visuelle possible (extension Chrome non connectée dans cet environnement) — raisonnement confirmé par la doc Angular Material (« `<mat-card>` n'ajoute aucun padding, seuls `mat-card-header`/`mat-card-content`/`mat-card-footer` en ajoutent ») et par comparaison avec `Account` (même retrait de titre, mais pas de `mat-card-content` dans sa structure — pas le même symptôme). À reconfirmer visuellement par l'utilisateur.

### File List

**Nouveaux**
- `apps/web/src/app/core/navigation/contextual-nav.service.ts`
- `apps/web/src/app/core/navigation/contextual-nav.service.spec.ts`

**Modifiés**
- `apps/web/src/app/layout/shell/shell.ts`
- `apps/web/src/app/layout/shell/shell.html`
- `apps/web/src/app/layout/shell/shell.scss`
- `apps/web/src/app/layout/shell/shell.spec.ts`
- `apps/web/src/app/features/dashboard/dashboard.ts`
- `apps/web/src/app/features/dashboard/dashboard.spec.ts`
- `apps/web/src/app/features/characters/my-characters/my-characters.ts`
- `apps/web/src/app/features/characters/my-characters/my-characters.spec.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`
- `apps/web/src/app/features/account/account.ts`
- `apps/web/src/app/features/account/account.spec.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts`

**Modifiés — corrections post-test**
- `apps/web/src/app/features/dashboard/dashboard.scss`
- `apps/web/src/app/features/characters/my-characters/my-characters.scss`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.scss`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/core/theme/tones.ts`

*(`shell.ts/.html/.scss`, `dashboard.html`, `my-characters.html`, `account.html`, `partie-detail.html`, `calendar-view.spec.ts` déjà listés ci-dessus, également modifiés pour les corrections.)*

**Modifiés — patches de revue de code**
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/layout/shell/shell.html`
- `apps/web/src/app/layout/shell/shell.scss`
- `apps/web/src/app/features/account/account.ts`

### Change Log

- 2026-08-09 : Implémentation complète de la story 29.4 — `ContextualNavService` (bandeau contextuel titre/sous-titre, auto-nettoyage sur `NavigationStart`), câblage des 5 écrans authentifiés, sous-navigation locale de `PartieDetail` réutilisée telle quelle. 1141 tests web verts, lint propre (hors 3 erreurs pré-existantes non touchées).
- 2026-08-09 : Corrections post-test (retour utilisateur avant clôture) — bandeau mobile fusionné (wordmark réduit + titre, un seul bandeau au lieu de deux), titres redondants retirés des 5 écrans, sous-navigation locale de `PartieDetail` repositionnée et restylée, bouton retour de `PartieDetail` retiré (redondant), bouton retour de `CalendarView` rendu conditionnel, note ajoutée à la story 29-5 pour un bug d'équipement hors périmètre. 1142 tests web verts, lint propre, build (budget pré-existant seul point d'échec).
- 2026-08-09 : Second retour utilisateur — `mat-card-header`/`mat-card-subtitle` de `PartieDetail` entièrement retiré, sous-titre du bandeau passé de « Maître » (rôle) à « système · type » (ex. « Ryuutama · Campagne épisodique »), choix confirmé avec l'utilisateur. 1142 tests web verts, lint propre, build inchangé.
- 2026-08-09 : Revue de code (`bmad-code-review`, 3 couches parallèles) — aucune violation de spec, 4 patches appliqués (bandeau vidé par les navigations internes du Calendrier, `mat-toolbar` masqué sans condition sur mobile, titre non réactif au thème sur Compte, `role="heading"` sur le titre du bandeau), 1 item différé (réutilisation d'instance `PartieDetail` sur changement de `:id`, pré-existant). Statut → `done`.
