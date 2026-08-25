---
baseline_commit: fcdad20bff53d72c6fc46ecd14f1d1941313df24
---

# Story 6.1: Nouvelle disposition de la page Partie (troupe + invitations)

Status: done

## Story

As a MJ ou joueur consultant une partie,
I want une page de détail de Partie moins encombrée, avec la troupe toujours accessible et les invitations dans leur propre espace,
so that je retrouve rapidement qui joue quoi sans naviguer dans un onglet surchargé, et je ne clique jamais sur un lien d'invitation qui n'existe plus.

## Acceptance Criteria

1. **Given** je suis MJ ou joueur et j'ouvre la page détail d'une Partie sur desktop (≥1024px), **When** la page se charge, **Then** un composant `RosterRail` remplace l'ancien onglet "Personnages" comme panneau permanent à gauche, replié par défaut (64px, avatars seuls), et se déplie au clic (260px, noms + classe) — jamais au survol. [Source: epics.md#Story 6.1, AC1 ; EXPERIENCE.md §2, §7]
2. **Given** je regarde `RosterRail` (ou `RosterStrip` mobile) et un participant est le MJ de la partie, **When** j'observe son avatar, **Then** il porte un anneau de couleur **et** un badge texte "MJ" (jamais la couleur seule) ; l'`aria-label` de chaque avatar (replié ou déplié) inclut le nom et le rôle complet. [Source: epics.md#Story 6.1, AC2 ; EXPERIENCE.md §7 Accessibility Floor]
3. **Given** il reste au moins une place libre dans la Partie, **When** je consulte le roster, **Then** un slot "+ Inviter" apparaît en dernier item, absent (pas grisé) si toutes les places sont pourvues ; il ouvre directement l'onglet "Invitations". [Source: epics.md#Story 6.1, AC3 ; DESIGN.md §7 RosterRail.invite-slot]
4. **Given** je suis MJ et j'ouvre la page sur mobile (<768px), **When** la page se charge, **Then** un `RosterStrip` horizontal scrollable s'affiche sous le titre, suivi des onglets "Détails" et "Invitations". [Source: epics.md#Story 6.1, AC4 ; EXPERIENCE.md §2]
5. **Given** je suis un joueur (pas MJ) et j'ouvre la page sur mobile (<768px), **When** la page se charge, **Then** aucun bandeau troupe ne s'affiche ; un onglet "Ma fiche" apparaît, sélectionné par défaut, montrant mon propre personnage sur cette Partie (ou la CTA de création s'il n'existe pas encore) ; un lien discret vers le reste de la troupe reste accessible depuis l'onglet "Détails". [Source: epics.md#Story 6.1, AC5 ; EXPERIENCE.md §2]
6. **Given** je suis MJ et je consulte le nouvel onglet "Invitations" (recherche + invitation par e-mail + liens, déplacés hors de "Détails"), **When** je révoque un lien, **Then** ce lien disparaît totalement de la liste au prochain rendu — jamais grisé ni barré. [Source: epics.md#Story 6.1, AC6 ; EXPERIENCE.md §5 State Patterns]
7. **Given** un contrôle tactile (slot "+ Inviter", items `RosterStrip`) a une taille visuelle sous 44px mobile / 36px desktop, **When** je le touche/clique près de son bord, **Then** la zone cliquable réelle atteint 44px/36px via un padding invisible, sans agrandir le glyphe visuel. [Source: epics.md#Story 6.1, AC7 ; EXPERIENCE.md §7]

**Hors scope de cette story** : tout ce qui dépend de données pas encore introduites en base — le niveau du personnage (`CharacterDto.level` n'existe pas avant la Story 6.2/6.3, cf. ARCHITECTURE-SPINE.md AD-1) n'est **pas** affiché dans le roster ici, malgré ce que suggère `EXPERIENCE.md` ("noms + niveaux") ; le roster affiche nom + classe (donnée déjà disponible via `classLabel()`). Les onglets Calendrier/Vote décrits dans certains mocks UX **n'existent pas comme des onglets dans l'app réelle** — ce sont des routes séparées (`/parties/:id/calendar`, `/parties/:id/guild-calendar`) déjà en place via le widget de planification de l'onglet "Détails" ; cette story ne les transforme pas en onglets et ne les modifie pas.

## Tasks / Subtasks

- [x] **Task 1 — Étendre `CharacterAvatar` aux nouvelles tailles** (AC: 1, 4)
  - [x] `apps/web/src/app/features/characters/character-avatar/character-avatar.ts` (UPDATE) : élargir `readonly size = input<44 | 64>(44)` en `input<26 | 38 | 44 | 64>(44)`.
  - [x] `character-avatar.html:5` (UPDATE) : la taille de police des initiales est un **ternaire codé en dur** (`size() === 64 ? 24 : 16`), pas une classe CSS — le généraliser en fonction/map `size → fontSize` (ex. `{26: 10, 38: 14, 44: 16, 64: 24}`) pour couvrir les 2 nouvelles tailles ; sinon les avatars 26px (`RosterStrip`) et 38px (`RosterRail`) héritent silencieusement d'un texte à 16px, trop grand pour le cercle.

- [x] **Task 2 — Nouveau composant `RosterRail` (desktop)** (AC: 1, 2, 3, 7)
  - [x] `apps/web/src/app/features/parties/roster-rail/roster-rail.ts` (+ `.html`, `.scss`), standalone, imports `[CharacterAvatar]`.
  - [x] Inputs : `members = input.required<PartieMemberDto[]>()`, `characters = input.required<CharacterDto[]>()`, `mjId = input.required<string>()`, `hasFreeSlot = input.required<boolean>()`, `classLabelFor = input.required<(c: CharacterDto) => string>()` (ou un `Map` précalculé par le parent — éviter d'exposer `gameSystemContent` au composant, garder l'API simple).
  - [x] Output : `selectCharacter = output<{ characterId: string }>()`, `openInvitations = output<void>()`.
  - [x] État interne `expanded = signal(false)`, bascule au `(click)` sur tout le rail (pas de hover) ; largeur `64px`/`260px` (transition `width`, respecte `prefers-reduced-motion`). *(Implémenté via un bouton toggle dédié plutôt qu'un clic sur toute la zone — évite le conflit avec le clic sur un avatar qui navigue vers le personnage ; reste "au clic, jamais au survol".)*
  - [x] Un item par membre : avatar (`CharacterAvatar`, 38px), anneau `box-shadow` + badge texte "MJ" si `member.userId === mjId()`, nom + classe (état déplié uniquement) ; `aria-label` complet dans les deux états (cf. AC2).
  - [x] Slot "+ Inviter" (dernier item, `aria-label="Inviter un participant"`) visible seulement si `hasFreeSlot()` ; `(click)` émet `openInvitations`.

- [x] **Task 3 — Nouveau composant `RosterStrip` (mobile, MJ uniquement)** (AC: 4, 7)
  - [x] `apps/web/src/app/features/parties/roster-strip/roster-strip.ts` (+ `.html`, `.scss`), mêmes inputs/outputs que `RosterRail`, layout `flex` horizontal `overflow-x: auto`, pastilles avec avatar 26px visuel + zone de tap 44px (padding invisible, cf. AC7). *(La logique de résolution membre→personnage a été extraite dans `apps/web/src/app/features/parties/roster-row.util.ts`, partagée avec `RosterRail`, pour éviter la duplication — non prévu explicitement par la story mais cohérent avec le principe DRY.)*

- [x] **Task 4 — Restructurer `PartieDetail` : intégrer le roster, retirer l'ancien onglet "Personnages"** (AC: 1, 4, 5)
  - [x] `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (UPDATE) : injecter `BreakpointObserver` (`@angular/cdk/layout`, déjà une dépendance du projet via Angular Material — première utilisation dans ce fichier, voir Dev Notes) ; exposer `isDesktop = toSignal(this.breakpointObserver.observe('(min-width: 1024px)').pipe(map(r => r.matches)), { initialValue: this.breakpointObserver.isMatched('(min-width: 1024px)') })` — **ne pas** figer `initialValue` à `true` en dur, `isMatched()` est synchrone et évite un flash d'un rendu desktop sur un premier chargement mobile.
  - [x] `hasFreeSlot` : **réglé, pas à vérifier** — `PartieDto` (`packages/shared/src/index.ts`) n'a aucun champ de capacité/nombre de places max. Le slot "+ Inviter" reste donc **toujours visible** pour cette story (`hasFreeSlot` constant `true`, pas un `computed()`) — ne pas inventer de notion de capacité absente du modèle de données.
  - [x] Ajouter `defaultTabIndex = computed(() => !this.isMj() && !this.isDesktop() ? <index de "Ma fiche"> : 0)`, lié à `[selectedIndex]` du `mat-tab-group`.
  - [x] `partie-detail.html` (UPDATE) : au-dessus du `mat-card-content`, `@if (isDesktop()) { <app-roster-rail ... /> } @else if (isMj()) { <app-roster-strip ... /> }` (rien pour un joueur mobile, cf. AC5).
  - [x] Retirer la section `<div class="members">` de l'onglet "Détails" (les membres vivent désormais dans le roster) et supprimer entièrement l'onglet `[label]="theme.tone()['character.tab_label']"` (grille `character-summary-card`) — son contenu (clic sur un personnage → `openCharacterSheet`, CTA de création si `myCharacters().length === 0`) est repris par le roster (clic avatar) et par le nouvel onglet "Ma fiche" (Task 5).
  - [x] Ajouter l'onglet "Ma fiche" — **`@if (!isMj() && !isDesktop())` uniquement** (mobile + joueur, pas desktop : ni `epics.md` AC5 ni `EXPERIENCE.md` §2 ne décrivent cet onglet sur desktop, où l'accès rapide passe par un clic sur son propre avatar dans `RosterRail` — ne pas l'ajouter sur desktop, ce serait un onglet redondant non demandé) : réutilise `myCharacters()` existant, même CTA de création que l'ancien onglet "Personnages".

- [x] **Task 5 — Nouvel onglet "Invitations", masquer les liens révoqués** (AC: 3, 6)
  - [x] `partie-detail.html` (UPDATE) : nouveau `<mat-tab>` MJ-only (`@if (isMj())`) reprenant tel quel le contenu actuel de recherche (`runSearch`/`invite`), invitation par e-mail (`inviteByEmail`), et liens (`createLink`/`revokeLink`/`copyLink`) — déplacé hors de "Détails", pas réécrit.
  - [x] Corriger le bug identifié en investigation : `@for (l of links(); track l.id)` devient `@for (l of links().filter(l => !l.revoked); track l.id)` (ou un `computed()` dédié `activeLinks` dans `partie-detail.ts` — préférable pour éviter de recréer un tableau filtré à chaque cycle de détection de changement) ; retirer le `[class.revoked]` et le texte conditionnel `' · révoqué'` devenus inutiles (`partie-detail.html:98-103`, `partie-detail.scss` si une règle `.revoked` existe — vérifier, aucune trouvée dans le fichier actuel).

- [x] **Task 6 — Microcopy** (AC: 2, 3, 5, 6)
  - [x] `apps/web/src/app/core/theme/tones.ts` (UPDATE) : nouvelles clés (×3 thèmes, suivant le triple habillage déjà établi) — `roster.mj_badge` ("MJ"), `roster.invite_slot` ("Inviter un participant"), `character.my_sheet_tab_label` ("Ma fiche"), `partie.invitations_tab_label` ("Invitations").

- [x] **Task 7 — Tests** (AC: 1–7)
  - [x] `roster-rail.spec.ts` (nouveau) : replié par défaut, déplie au clic (pas au hover), badge MJ texte+couleur présent, slot invite visible/absent selon `hasFreeSlot`, `aria-label` complet à l'état replié.
  - [x] `roster-strip.spec.ts` (nouveau) : mêmes invariants en layout horizontal.
  - [x] `partie-detail.spec.ts` (UPDATE) : retirer les tests de l'ancien onglet "Personnages" devenu obsolète ; ajouter — un lien révoqué n'apparaît plus dans le rendu de l'onglet Invitations ; un joueur mobile voit l'onglet "Ma fiche" sélectionné par défaut ; un joueur mobile ne voit aucun roster ; un MJ mobile voit `RosterStrip`.

### Review Findings

- [x] [Review][Decision] Régression silencieuse : retrait de membre par le MJ non repris — `removeMember()` (`partie-detail.ts`) et son bouton n'existent plus dans aucun template (roster-rail, roster-strip, `troupe-toggle`) ; la méthode est désormais du code mort. Non listé dans le "Hors scope" de la story — semble être un oubli plutôt qu'une exclusion volontaire. **Résolu** : restauré dans une liste "Membres actuels" (bouton "Retirer") en tête de l'onglet Invitations (MJ uniquement, exclut le MJ lui-même).
- [x] [Review][Patch] `RosterRail` (desktop uniquement) utilise des zones de tap 44px au lieu de 36px [apps/web/src/app/features/parties/roster-rail/roster-rail.scss:38] — viole AC7 et incohérent avec `.roster-rail__toggle` (36px) du même fichier.
- [x] [Review][Patch] Items du roster (`role="button"`) n'activent qu'au clavier Entrée, pas Espace [apps/web/src/app/features/parties/roster-rail/roster-rail.html, roster-strip.html] — sémantique ARIA `button` incomplète.
- [x] [Review][Patch] `roster.invite_slot` non thématisé dans les 3 thèmes [apps/web/src/app/core/theme/tones.ts] — incohérent avec les CTA sœurs (`partie.invite_btn`, `partie.show_troupe`/`hide_troupe`) qui le sont ; contrairement à `roster.mj_badge` (abréviation de rôle fonctionnelle), ce n'est pas justifié comme exception.
- [x] [Review][Patch] Libellés `aria-label` du bouton toggle de `RosterRail` codés en dur ("Replier la troupe"/"Déplier la troupe") au lieu de `theme.tone()` [apps/web/src/app/features/parties/roster-rail/roster-rail.html:6] — alors que cette même story ajoute `partie.show_troupe`/`hide_troupe` thématisés pour un toggle quasi identique.
- [x] [Review][Patch] `manualTabIndex` peut pointer vers un onglet qui n'existe plus après un changement de breakpoint/rôle [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:126-128] — ex. joueur sélectionne "Ma fiche" (index 1) sur mobile puis redimensionne vers desktop (un seul onglet "Détails" à l'index 0).
- [x] [Review][Patch] Signal `showTroupe` jamais réinitialisé [apps/web/src/app/features/parties/partie-detail/partie-detail.ts:101] — reste `true` après navigation vers une autre Partie si l'instance du composant est réutilisée (changement de paramètre de route).
- [x] [Review][Defer] `buildRosterRows` ne montre que le premier personnage trouvé via `.find()` si un membre en possède plusieurs sur la même partie [apps/web/src/app/features/parties/roster-row.util.ts:26] — deferred, pre-existing (hypothèse de modèle de données déjà présente ailleurs dans le projet, hors scope de cette story).
- [x] [Review][Defer] `aria-label` vide entre parenthèses si `classLabel` est vide, ex. "Alice — Fenn ()" [apps/web/src/app/features/parties/roster-row.util.ts:42] — deferred, pre-existing (edge case cosmétique mineur, non bloquant).
- [x] [Review][Defer] Un MJ possédant aussi un personnage obtient une ligne cliquable dont l'`aria-label` ne mentionne que "MJ", pas le personnage [apps/web/src/app/features/parties/roster-row.util.ts:27-29] — deferred, pre-existing (flux non prévu par le modèle de rôles actuel, hors scope de cette story).

## Dev Notes

- **Architecture (AD-10 de la spine Palier 3)** : `PartieDetailComponent` doit charger `members`/`characters` une seule fois (déjà le cas via `ngOnInit`, ne pas changer ce chargement) et les exposer au roster + aux onglets sans rechargement indépendant. [Source: ARCHITECTURE-SPINE.md#AD-10]
- **Fichier existant à modifier (UPDATE, pas NEW)** : `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` — structure actuelle documentée en détail par l'investigation brownfield de cette story (signals `partie`/`members`/`activePoll`/`links`/`characters`/`gameSystemContent`/`search`/`results`/`notice`/`inviteEmail`/`invitingByEmail`/`inviteEmailError`, computed `isMj`/`myCharacters`/`nextSessionLabel`/`respondedCount`, méthodes `runSearch`/`invite`/`inviteByEmail`/`removeMember`/`createLink`/`revokeLink`/`joinUrl`/`copyLink`/`confirmDelete`/`openCharacterSheet`/`classLabel`). Ne rien renommer sans raison — les nouveaux éléments s'ajoutent à cette base.
- **Fichier existant à modifier (UPDATE, pas NEW)** : `apps/web/src/app/features/parties/partie-detail/partie-detail.html` — aujourd'hui **2 onglets seulement** (`mat-tab-group` : "Détails" qui mélange description + widget de planification + liste des membres + recherche d'invitation + invitation par e-mail + liens, et un onglet `character.tab_label` = "Personnages" avec une grille `app-character-summary-card`). Aucun onglet Calendrier/Vote n'existe — ce sont des liens (`routerLink`) vers des routes séparées à l'intérieur du widget de planification (`section.scheduling-widget`), inchangés par cette story.
- **Bug confirmé en investigation** : `partie-detail.html:97-113` affiche déjà un lien révoqué (`[class.revoked]="l.revoked"` + texte `' · révoqué'`) plutôt que de le masquer — c'est exactement le défaut que corrige AC6 (Task 5). `PartiesService.inviteLinks()` (backend `InviteLinksService.listForPartie`) renvoie tous les liens sans filtre de statut par conception ("laissé à l'appelant") — le filtre `!l.revoked` doit donc vivre côté frontend, pas être demandé côté API.
- **`partie-detail.scss`** actuel : `.detail { max-width: 36rem; }`, aucune media query, aucun layout responsive — la plainte UX ("trop limité en largeur") est confirmée : c'est une carte étroite à toutes les tailles d'écran aujourd'hui. Cette story introduit le premier vrai breakpoint (1024px) de ce composant.
- **`CharacterAvatar` (`apps/web/src/app/features/characters/character-avatar/character-avatar.ts`)** : composant déjà existant et réutilisable (initiales de repli, portrait recadré, `aria-label` déjà géré), mais son input `size` est restreint au type littéral `44 | 64` — doit être élargi (Task 1), ne pas créer un second composant avatar.
- **`CharacterSummaryCard`** (`apps/web/src/app/features/characters/character-summary-card/character-summary-card.ts`) reste utilisable tel quel pour l'onglet "Ma fiche" (affichage d'un personnage unique) — pas besoin de le modifier, seul son usage dans l'ancien onglet "Personnages" (grille de plusieurs personnages) disparaît.
- **Nouveau pattern introduit — `BreakpointObserver`** : `@angular/cdk/layout` est déjà une dépendance transitive du projet (`@angular/cdk@^22.0.2`, requis par Angular Material) mais n'est utilisé nulle part dans le code actuel. C'est la première introduction de ce pattern — combiner avec `toSignal()` (`@angular/core/rxjs-interop`, déjà utilisé ailleurs dans le projet pour les conversions Observable→Signal, cf. patterns Angular 22 signals du projet) pour rester cohérent avec le principe "Signals partout" (P1-AD-5 étendu). Vérifier la doc Angular CDK Layout à jour (Angular 22) avant implémentation — l'API `BreakpointObserver.observe(query).pipe(map(r => r.matches))` est stable depuis plusieurs versions majeures, mais confirmer qu'aucun changement de signature n'est survenu.
- **Capacité de la Partie (`hasFreeSlot`)** : à vérifier avant d'implémenter — le type `PartieDto` (`packages/shared/src/index.ts`) ne semble pas avoir de champ de capacité maximale explicite d'après l'inventaire de types de la spine (`id, name, kind, gameSystemId, description, mjId, createdAt, nextSessionDate, nextSessionSlot`). Si aucune capacité n'est modélisée côté backend, `hasFreeSlot` doit être **toujours `true`** pour cette story (le slot "+ Inviter" reste visible en permanence) plutôt que d'inventer une notion de capacité qui n'existe pas dans le modèle de données — ne pas bloquer la story sur une fonctionnalité hors scope.
- **Accessibilité héritée** (`ux-jdr-master-20260626/EXPERIENCE.md` §7, étendue par `ux-jdr-master-20260708/EXPERIENCE.md` §7) : touch targets 44px mobile/36px desktop, contraste 4.5:1/3:1, couleur jamais seul vecteur d'info, `aria-label` pattern `"[Nom] : [état]"`. Le badge MJ (anneau + texte, jamais la couleur seule) et les zones de tap étendues (padding invisible, pas de glyphe agrandi) sont des exigences directement issues de la revue accessibilité de la spine UX — ne pas les traiter comme optionnelles. [Source: EXPERIENCE.md §7 ; DESIGN.md §7 RosterRail/RosterStrip]
- **Thématisation** : chaque nouvelle clé de microcopy (Task 6) doit exister dans les 3 thèmes de `tones.ts` (`grimoire-emeraude`, `foret-ancienne`, `medieval-steampunk`), suivant le registre déjà établi par thème (ex. `partie.links_title` = "Parchemins d'invocation" côté Grimoire) — ne pas se contenter d'une seule valeur neutre sauf si le libellé est explicitement non thématisé comme `character.tab_label` l'était.

### Project Structure Notes

- Deux nouveaux composants standalone sous `apps/web/src/app/features/parties/` : `roster-rail/` et `roster-strip/`, suivant le pattern de dossier déjà établi (`confirm-dialog/`, `partie-form/`) — un fichier `.ts`/`.html`/`.scss` par composant, pas de module NgModule (le projet est 100% standalone components).
- Aucune migration Prisma, aucun changement backend dans cette story — 100% frontend (le seul bug corrigé, l'affichage des liens révoqués, est un filtre côté template, pas un changement d'API).
- Aucune variance détectée avec la structure unifiée du projet au-delà de l'introduction de `BreakpointObserver` (nouveau pattern, justifié en Dev Notes).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 6.1: Nouvelle disposition de la page Partie]
- [Source: _bmad-output/planning-artifacts/epics.md#UX-DR1, UX-DR2, UX-DR3, UX-DR11, UX-DR14]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/EXPERIENCE.md#2. Information Architecture, #7. Accessibility Floor]
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260708/DESIGN.md#7. Components — RosterRail, RosterStrip]
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260708/ARCHITECTURE-SPINE.md#AD-10]
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts, .html, .scss — lus intégralement pendant l'investigation de cette story]
- [Source: apps/web/src/app/features/characters/character-avatar/character-avatar.ts]
- [Source: apps/web/src/app/core/theme/tones.ts]

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- `docker compose exec web pnpm test` — 40 fichiers / 308 tests, tous passants (incluant `roster-rail.spec.ts`, `roster-strip.spec.ts`, `partie-detail.spec.ts` mis à jour pour la Story 6.1).
- `docker compose exec web pnpm lint` — 0 erreur après `--fix` (23 erreurs prettier préexistantes sur des fichiers déjà modifiés par la session précédente, corrigées automatiquement ; aucune n'était liée à la logique).

### Completion Notes List

- Tasks 1–3 (élargissement `CharacterAvatar`, `RosterRail`, `RosterStrip`) avaient déjà été implémentées et testées lors d'une session précédente ; reprises telles quelles.
- Tasks 4, 5 et une partie de la Task 6 (clés `character.my_sheet_tab_label`, `partie.invitations_tab_label`) étaient déjà implémentées dans le code (`partie-detail.ts`/`.html`) mais les cases à cocher n'avaient pas été mises à jour — vérifié exhaustivement contre chaque sous-tâche et les tests correspondants (`partie-detail.spec.ts` describe blocks "roster (Story 6.1)" et "invitations") avant de cocher.
- Complété la Task 6 : les libellés "MJ" et "Inviter un participant" étaient codés en dur dans `roster-rail.html`/`roster-strip.html` plutôt que puisés dans `tones.ts` (violation du principe de thématisation systématique de la microcopy). Ajout des clés `roster.mj_badge` et `roster.invite_slot` dans les 3 thèmes (valeur identique dans les 3, comme `character.my_sheet_tab_label`/`partie.invitations_tab_label` — le badge "MJ" et l'aria-label générique ne sont pas thématisables sans perdre leur clarté fonctionnelle) ; injection de `ThemeToneService` dans `RosterRail`/`RosterStrip` et remplacement des chaînes en dur.
- Task 7 (tests) déjà en place et passante ; aucune modification nécessaire au-delà de la ré-exécution de la suite complète pour valider la story terminée.
- Suite complète : 308/308 tests passants, lint propre (0 erreur).

### File List

- `apps/web/src/app/core/theme/tones.ts` (UPDATE — clés `roster.mj_badge`, `roster.invite_slot` ×3 thèmes)
- `apps/web/src/app/features/parties/roster-rail/roster-rail.ts` (UPDATE — injection `ThemeToneService`)
- `apps/web/src/app/features/parties/roster-rail/roster-rail.html` (UPDATE — libellés thématisés)
- `apps/web/src/app/features/parties/roster-strip/roster-strip.ts` (UPDATE — injection `ThemeToneService`)
- `apps/web/src/app/features/parties/roster-strip/roster-strip.html` (UPDATE — libellés thématisés)
- `apps/web/src/app/features/parties/roster-rail/roster-rail.scss` (NEW — session précédente)
- `apps/web/src/app/features/parties/roster-rail/roster-rail.spec.ts` (NEW — session précédente, reformaté par lint --fix)
- `apps/web/src/app/features/parties/roster-strip/roster-strip.scss` (NEW — session précédente)
- `apps/web/src/app/features/parties/roster-strip/roster-strip.spec.ts` (NEW — session précédente, reformaté par lint --fix)
- `apps/web/src/app/features/parties/roster-row.util.ts` (NEW — session précédente, reformaté par lint --fix)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.ts` (UPDATE — session précédente, reformaté par lint --fix)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.html` (UPDATE — session précédente)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.scss` (UPDATE — session précédente)
- `apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts` (UPDATE — session précédente, reformaté par lint --fix)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.ts` (UPDATE — session précédente, Task 1)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.html` (UPDATE — session précédente, Task 1)
- `apps/web/src/app/features/characters/character-avatar/character-avatar.spec.ts` (UPDATE — session précédente, Task 1)

## Change Log

- 2026-07-09 — Vérification et clôture des Tasks 4, 5, 7 (déjà implémentées, cases non cochées) ; complétion de la Task 6 (thématisation `roster.mj_badge`/`roster.invite_slot`) ; suite complète validée (308/308 tests, lint propre). Statut → review.
- 2026-07-09 — Code review (Blind Hunter + Edge Case Hunter + Acceptance Auditor) : 1 décision résolue (restauration de `removeMember` dans l'onglet Invitations), 7 patches appliqués (touch targets 36px desktop, activation clavier Espace, thématisation `roster.invite_slot` + libellés toggle, reset `manualTabIndex`/`showTroupe`), 3 items différés (pré-existants, hors scope), 4 rejetés comme bruit. 6 nouveaux tests ajoutés. Suite complète : 314/314 tests, lint propre. Statut → done.
