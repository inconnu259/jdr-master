---
baseline_commit: 529f92eb219369c525371b23e5ab43ea22b878c2
---

# Story 29.5: Fiche personnage en sections routées

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a joueur,
I want retrouver l'équipement et le journal de mon personnage dans leurs propres sections plutôt que noyés dans une longue page,
so that je trouve ce que je cherche sans défiler toute la fiche.

## Contexte

**Cinquième story de l'épic 29**, insérée par `correct-course` (2026-08-08), suite directe de 29.4 (`done`) — son seul prérequis réel : `ContextualNavService` (bandeau contextuel) et le patron de sous-navigation locale (`mat-tab-group` piloté par un `selectedIndex`/`(selectedIndexChange)` local, sans route enfant Angular) sont désormais établis et éprouvés sur `PartieDetail`.

**Ce que cette story livre :** la fiche personnage (`CharacterSheet`), aujourd'hui une page unique qui empile tout, gagne une sous-navigation locale (mêmes onglets Material que `PartieDetail`) séparant son contenu en sections. **Aucun composant à extraire** : `app-inventory-tab`, `app-history-tab` et `app-notes-journal` existent déjà comme composants autonomes, embarqués tels quels dans `character-sheet.html` — le travail de cette story est de **réorganisation/routage local**, pas de découpage de composants.

**Bug signalé par l'utilisateur en testant 29.4** (2026-08-09, sans lien avec 29.4, noté dans `sprint-status.yaml` pour être traité ici) : sur la fiche personnage, le menu du bas (`.nav-bar`, barre à 4 destinations) « prend bien plus de place que sur les autres écrans, avec scroll nécessaire ». Cause identifiée (voir Dev Notes, Task 4) : un bug de formatage CSS dans `inventory-tab.scss` (rangées de formulaire sans `flex-wrap`) fait déborder horizontalement la page sur mobile. Cette story corrige ce bug **à l'occasion** du découpage de l'équipement dans sa propre section — pas une AC de cette story au sens de l'épic, mais un engagement explicite pris envers l'utilisateur.

### Décision d'implémentation — « routées » ne signifie pas des routes Angular distinctes

Le titre de la story dit « sections **routées** », mais `EXPERIENCE.md` § Navigation contextuelle locale et `DESIGN.md` §7.6 bis sont sans ambiguïté sur le mécanisme attendu : *« Sur la fiche personnage (29.5), elle est **nouvelle** [...] le journal ne devient pas une destination globale "Documents", il devient une entrée de la sous-navigation **locale** de la fiche »* — exactement le même patron que celui **déjà livré et validé** par `PartieDetail` (29.4), qui n'utilise **aucune route enfant Angular** : la sélection d'onglet est un signal local (`selectedTabIndex`/`manualTabIndex`/`onTabIndexChange`), jamais reflétée dans l'URL. L'AC de l'épic (« sans rechargement de page ni perte du contexte courant ») est satisfaite par du state local, sans exiger d'URL distincte par section.

**Décision retenue pour cette story** : réutiliser **exactement** le patron non-routé de `PartieDetail` (`mat-tab-group` + `selectedIndex`/`(selectedIndexChange)` locaux), pas de nouvelle route enfant sous `parties/:id/characters/:characterId`. « Routée » du titre de la story est compris comme « organisée en sections navigables », pas comme un mandat d'URLs distinctes. Si ce n'est pas l'intention, c'est un changement d'architecture à trancher **avant** le développement (cf. Dev Notes, Hors périmètre).

## Acceptance Criteria

1. **Given** j'ouvre la fiche d'un personnage, **When** elle s'affiche, **Then** elle est structurée en sections distinctes accessibles depuis la sous-navigation locale (29.4) : au minimum la fiche principale, l'équipement, le journal.
2. **Given** je change de section sur la fiche, **When** je sélectionne une autre entrée de la sous-navigation locale, **Then** le contenu affiché change sans rechargement de page ni perte du contexte courant (personnage, partie).
3. **Given** l'équipement et le journal désormais dans leurs propres sections, **When** je les consulte, **Then** leur contenu et leur comportement restent identiques à ceux d'aujourd'hui (inventaire, encombrement, entrées de journal) — aucune régression fonctionnelle, seulement un déplacement.
4. **Given** une section de la fiche personnage active, **When** elle s'affiche, **Then** elle suit la même convention de distinction que celle définie en 29.4 — jamais la couleur seule.

## Tasks / Subtasks

### Frontend — restructuration en sous-navigation locale

- [x] Task 1 — `CharacterSheet` : introduire un `mat-tab-group` local, même patron que `PartieDetail` (AC: #1, #2, #4)
  - [ ] `apps/web/src/app/features/characters/character-sheet/character-sheet.ts` : ajouter (aux côtés de la logique existante, sans y toucher) :
    ```ts
    protected readonly manualTabIndex = signal<number | null>(null);
    protected readonly hasHistoryTab = computed(() => this.isOwner() || this.viewerIsMj());
    // Reset l'onglet manuel si l'ensemble d'onglets change de forme (apparition/disparition
    // de l'onglet Historique) — même garde que PartieDetail.tabSetKey (29.4), évite un
    // selectedIndex qui pointerait sur un onglet qui n'existe plus.
    protected readonly tabSetKey = computed(() => `${this.hasHistoryTab()}`);
    protected readonly selectedTabIndex = computed(() => this.manualTabIndex() ?? 0);
    protected onTabIndexChange(index: number): void {
      this.manualTabIndex.set(index);
    }
    constructor() {
      // ... effects existants inchangés ...
      effect(() => {
        this.tabSetKey();
        untracked(() => this.manualTabIndex.set(null));
      });
    }
    ```
    Index par défaut toujours `0` (Fiche) — contrairement à `PartieDetail`, aucun rôle/breakpoint ne justifie un onglet par défaut différent ici.
  - [ ] `character-sheet.html` : envelopper les sections dans `<mat-tab-group [selectedIndex]="selectedTabIndex()" (selectedIndexChange)="onTabIndexChange($event)">`, avec 3 ou 4 `<mat-tab>` selon `hasHistoryTab()` :
    - `<mat-tab [label]="theme.tone()['evolution.main_sheet_tab_label']">` — nouvelle clé de thème (Task 3), contenu : tout ce qui reste de `.sheet__body` une fois équipement extrait (attributs, vocation, voie, magie, paysage/climat, immunités, autres capacités, statistiques dérivées, **arme de prédilection** — décision de scope : reste ici, dans les statistiques dérivées, pas dans l'onglet Équipement au sens strict de l'inventaire — et notes narratives). La disposition 2 colonnes CSS existante (`.sheet__body`, `@media (min-width: 768px)`) reste **inchangée à l'intérieur de cet onglet**, aucune règle de breakpoint à toucher.
    - `<mat-tab [label]="theme.tone()['evolution.inventory_section_title']">` — Task 2.
    - `<mat-tab [label]="theme.tone()['evolution.notes_journal_title']">` — `app-notes-journal` (L460-463 actuel), déplacé tel quel.
    - `@if (hasHistoryTab()) { <mat-tab [label]="theme.tone()['evolution.history_tab_label']"> ... }` — `app-history-tab` (L453-458 actuel), déplacé tel quel, **condition inchangée** (`isOwner() || viewerIsMj()`), mais portée sur la présence même de l'onglet (comme l'onglet Invitations de `PartieDetail`, visible seulement `@if (isMj())`) plutôt que sur un `@if` interne à un onglet toujours présent.
  - [ ] **Restent hors du `mat-tab-group`, toujours visibles quel que soit l'onglet actif** (même esprit que `PartieDetail` qui garde `roster-rail`/`mat-card-actions` hors des onglets) : l'en-tête (`.sheet__header` — avatar, nom, bannière de montée de niveau, méta classe/type/niveau, badges propriétaire/MJ, CTA portrait, menu des 5 actions d'export, CTA recadrage PDF), les bannières d'erreur/avertissement (export ×3, portrait, field-edit), `app-portrait-panel`. Aucune de ces exports/actions ne doit devenir inatteignable depuis un onglet secondaire.

- [x] Task 2 — Section Équipement : regrouper l'objet fétiche et l'inventaire (AC: #1, #3)
  - [x] Déplacer le bloc objet fétiche (`character-sheet.html`, actuellement juste avant `app-inventory-tab`) et `<app-inventory-tab [character]="c" [isOwner]="isOwner()" [viewerIsMj]="viewerIsMj()" (characterUpdated)="..." />` dans le nouvel onglet Équipement, **sans changement de logique ni de bindings**.
  - [x] Retirer le `<h2 class="sheet__card-title">{{ theme.tone()['evolution.inventory_section_title'] }}</h2>` désormais redondant avec le libellé de l'onglet (leçon tirée de 29.4, cf. Contexte de cette story-ci : ne pas répéter le titre juste sous la sous-navigation qui le porte déjà — évite le cycle « redondance acceptée puis retour utilisateur » vécu sur 29.4).

- [x] Task 3 — Section Journal + section Historique (conditionnelle) (AC: #1, #3)
  - [x] Déplacer `<app-notes-journal [characterId]="c.id" [content]="..." />` dans l'onglet Journal, retirer son `<h2>` redondant (`evolution.notes_journal_title`), même raisonnement que Task 2.
  - [x] Déplacer `<app-history-tab [characterId]="c.id" [content]="..." />` dans l'onglet Historique (conditionnel), retirer son `<h2>` redondant (`evolution.history_tab_label`).
  - [x] `apps/web/src/app/core/theme/tones.ts` : ajouter la clé `'evolution.main_sheet_tab_label'` aux 3 thèmes (grimoire-emeraude, forêt-ancienne, médiéval-steampunk), registre thématique cohérent avec les clés `evolution.*` voisines (ex. suggestions à ajuster si besoin au fil de l'implémentation : « Fiche » / « Grimoire » / « Plan de vol » — garder simple, cette section est le contenu par défaut, pas un concept nouveau à nommer lourdement).

- [x] Task 4 — Corriger le bug de formatage de l'équipement (signalé par l'utilisateur, note `sprint-status.yaml` 29-5)
  - [x] `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.scss` : `.inventory-tab__add-form`/`.inventory-tab__edit-form` (actuellement `display: flex; gap: 0.5rem; align-items: center;` sans `flex-wrap`) débordent horizontalement sur mobile (jusqu'à 4 `<input>` de largeur intrinsèque + boutons, sur 6 formulaires Objets/Contenants/Animaux × propriétaire/MJ) — seul bloc de formulaire flex de la zone personnages sans `flex-wrap: wrap` (confirmé par grep : `character-sheet.scss`, `character-summary-card.scss`, `character-wizard.scss`, `class-step.scss` l'ont tous). Ajouter `flex-wrap: wrap` et des contraintes de largeur raisonnables sur les `<input>` enfants (ex. `min-width: 0; flex: 1 1 8rem;`), même patron que les formulaires voisins.
  - [x] Vérification manuelle réelle en conditions mobile (`docker compose up`, viewport réduit ou DevTools responsive) : plus de débordement horizontal, la barre basse fixe (`.nav-bar`) reste pleine largeur sans scroll requis pour l'atteindre.

- [x] Task 5 — Adapter les tests existants au nouveau découpage en onglets (AC: #3)
  - [x] `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts` (89 tests aujourd'hui, un seul `describe('CharacterSheet', ...)` avec plusieurs `describe` imbriqués) : tout test qui interroge le DOM pour du contenu désormais dans un onglet non actif par défaut (Équipement, Journal, Historique — index 0 = Fiche par défaut) doit d'abord sélectionner cet onglet (`component.onTabIndexChange(N); fixture.detectChanges();`, même patron que les tests d'onglets de `partie-detail.spec.ts`) avant d'asserter.
  - [x] Tout test qui vérifiait la présence des `<h2>` retirés par les Tasks 2/3 (`evolution.inventory_section_title`/`notes_journal_title`/`history_tab_label` en tant que titre de contenu) doit être réécrit pour asserter sur le libellé de l'onglet à la place.
  - [x] Aucun changement de logique métier ne doit accompagner ces adaptations de test — uniquement l'ajout de la sélection d'onglet avant assertion.

- [x] Task 6 — Tests dédiés à la sous-navigation locale (AC: #1, #2, #4)
  - [x] `mat-tab-group` présent avec 4 onglets quand `isOwner()||viewerIsMj()` est vrai, 3 sinon (onglet Historique absent, pas seulement vide).
  - [x] Changer d'onglet ne recharge pas la page ni ne perd le contexte courant : `characterId`/`partieId` (route) et le signal `character()` restent identiques avant/après un changement d'onglet.
  - [x] L'onglet actif est distingué autrement que par la seule couleur — comportement Material par défaut déjà vérifié par 29.4 sur `PartieDetail` (soulignement natif), aucune nouvelle CSS attendue ici sauf si le rendu réel en manque (à vérifier, pas supposé).
  - [x] Onglet Historique absent du DOM (pas seulement masqué) quand `!isOwner() && !viewerIsMj()`.

### Review Findings

- [x] [Review][Defer] `manualTabIndex` pourrait pointer un instant sur un onglet qui vient de disparaître si `hasHistoryTab()` bascule de vrai à faux en cours de session (rôle MJ/propriétaire changeant) — l'`effect()` qui réinitialise `manualTabIndex` sur `tabSetKey()` s'exécute après le rendu déclenché par le changement, pas de façon synchrone avec lui [apps/web/src/app/features/characters/character-sheet/character-sheet.ts:227-233,501-504] — deferred, pre-existing (patron hérité tel quel de `PartieDetail`/`tabSetKey`, Story 29.4, déjà revu et accepté ; aucun parcours actuel de l'app ne permet un changement de rôle MJ/propriétaire en cours de session sur un même personnage)

## Dev Notes

### Project Structure Notes

- **Modifiés** : `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`/`.html`/`.spec.ts` ; `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.scss` ; `apps/web/src/app/core/theme/tones.ts` (nouvelle clé `evolution.main_sheet_tab_label`, 3 thèmes).
- **Non touchés** : `app-inventory-tab`/`app-history-tab`/`app-notes-journal` et leurs sous-composants (`encumbrance-bar`, `inventory-item-row`) — déjà des composants autonomes, aucune extraction à faire, seulement un déplacement de leur point d'embarquement dans `character-sheet.html`. `app.routes.ts` — aucune route enfant ajoutée (cf. Contexte, décision d'implémentation). `packages/shared` — `CharacterDto` ne porte aucun état de section/onglet (state UI pure, jamais sérialisé), rien à y ajouter.
- **Aucune nouvelle dépendance externe** — `mat-tab-group` déjà utilisé par `PartieDetail` (`MatTabsModule` importé depuis `@angular/material/tabs`, `partie-detail.ts:21`) ; `character-sheet.ts` importe déjà `signal`/`computed`/`effect`/`untracked` depuis `@angular/core` (lignes 1-11) mais **pas encore** `MatTabsModule` — à ajouter à ses imports et au tableau `imports: [...]` du décorateur `@Component`, comme `partie-detail.ts:89`.

### Ce qui doit continuer de fonctionner

- Le câblage temps réel de `CharacterSheet` (Story 20.1) — inchangé, doit continuer à rafraîchir la fiche quel que soit l'onglet actif au moment du signal.
- L'édition MJ via `FieldEditPencil` (Stories 6.6/6.7) sur les champs narratifs/attributs/arme — inchangée, ces champs restent dans l'onglet Fiche.
- Les 5 actions d'export du menu d'en-tête (fiche éditable, fiche 2 pages, équipement, notes, recadrage portrait PDF) — doivent rester atteignables depuis n'importe quel onglet actif (l'en-tête reste hors du `mat-tab-group`, cf. Task 1).
- L'inventaire (Story 14.1-14.3 : objets/contenants/animaux, poids, encombrement) et le journal (Story 6.5) — comportement strictement identique, seul le point d'affichage change (AC3).
- La bannière de montée de niveau et les warnings d'édition MJ — restent dans l'en-tête, hors des onglets.

### Hors périmètre

- **Câblage de `CharacterSheet` sur `ContextualNavService`** (bandeau contextuel du Shell, 29.4) : cette story ne l'ajoute pas. `CharacterSheet` n'est pas l'un des 5 écrans authentifiés câblés par 29.4 (c'est un écran imbriqué, atteint depuis une Partie) — l'ajouter soulèverait des questions de contenu (titre = nom du personnage ? sous-titre = nom de la partie ?) qu'aucun AC de cette story ne tranche. Écart réel avec l'esprit de 29.4 (« le bandeau du haut ne doit plus jamais rester vide »), à évaluer dans une story dédiée si l'utilisateur le souhaite.
- **Vraies routes enfant Angular par section** (URL distincte par onglet) — cf. Contexte, décision d'implémentation explicite de rester sur le patron non-routé déjà validé par 29.4/`PartieDetail`. Si l'intention du titre « sections routées » était réellement des URLs distinctes, c'est un changement d'architecture à trancher avant le développement, pas après.
- **Réorganisation de l'objet fétiche/arme de prédilection en dehors des statistiques dérivées** — restent dans l'onglet Fiche (décision de scope explicite, Task 1), pas dans l'onglet Équipement au sens strict de l'inventaire consultable/éditable (objets/contenants/animaux).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.5] — Story, Acceptance Criteria (reprises telles quelles), note d'insertion post-correct-course.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md § Navigation contextuelle locale, §4.7 Menu de fiche (mise à jour 29.5), §4.8 Bandeau contextuel] — Confirme le patron de sous-navigation **locale** (pas de destination globale « Documents »), fondement de la décision d'implémentation ci-dessus.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §7.6 bis ContextualHeader] — Rangée d'onglets sous le bandeau, entrée active teintée **et** en gras (double signal, AC4).
- [Source: apps/web/src/app/features/parties/partie-detail/partie-detail.ts, partie-detail.html] — Patron exact à réutiliser : `selectedTabIndex`/`manualTabIndex`/`onTabIndexChange`/`tabSetKey` (reset sur changement de forme des onglets), `mat-tab-group [selectedIndex]`/`(selectedIndexChange)`, onglet conditionnel `@if` (Invitations, MJ-only) — même patron pour l'onglet Historique de cette story.
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.html, character-sheet.ts] — Structure actuelle en page unique (en-tête, `.sheet__body` 2 colonnes CSS ≥768px, historique et journal hors `.sheet__body`) ; `app-inventory-tab`/`app-history-tab`/`app-notes-journal` déjà des composants autonomes embarqués, aucune extraction requise.
- [Source: apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.scss] — `.inventory-tab__add-form`/`.inventory-tab__edit-form` sans `flex-wrap`, cause du bug de formatage signalé par l'utilisateur (Task 4).
- [Source: apps/web/src/app/core/theme/tones.ts] — Clés `evolution.inventory_section_title`, `evolution.notes_journal_title`, `evolution.history_tab_label` déjà présentes et thématisées par thème, réutilisées comme libellés d'onglet ; nouvelle clé `evolution.main_sheet_tab_label` à ajouter (Task 3).
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts] — 89 tests existants, structure actuelle à préserver (Task 5) ; comportement à conserver, pas à réécrire.
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml, entrée 29-5] — Note d'origine du bug de formatage de l'équipement (signalé par l'utilisateur en testant 29.4, 2026-08-09), à traiter dans cette story (Task 4).
- [Source: _bmad-output/implementation-artifacts/29-4-sous-navigation-contextuelle-des-ecrans.md] — Story précédente : patron de sous-navigation locale livré et éprouvé sur `PartieDetail` ; leçon explicitement appliquée ici en amont (retrait proactif des titres redondants avec le libellé d'onglet, Tasks 2/3) plutôt que de répéter le cycle « redondance mineure acceptée » → retour utilisateur → correction post-test vécu sur 29.4.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Suite Vitest web complète (`docker compose exec web pnpm ng test --watch=false`) : 84 fichiers, 1147 tests, tous verts (baseline 1142 + 5 nouveaux tests Task 6).
- `docker compose exec web pnpm eslint <fichiers touchés> --fix` : propre (formatage Prettier uniquement, 0 erreur). `character-sheet.html` lint (`@angular-eslint/template`) propre.
- `docker compose exec web pnpm build` : compilation propre (chunk `character-sheet` 87.47 kB → 88.14 kB) ; échoue seulement sur `bundle initial exceeded maximum budget` (1.21 MB vs. budget 1 MB) — confirmé préexistant, identique à 29-2/29-3/29-4.
- **Piège de test rencontré et résolu (Task 5/6)** : les tests qui interrogeaient le DOM d'un onglet non actif par défaut échouaient (`querySelector` renvoyait `null`) même après avoir appelé `onTabIndexChange()` + plusieurs cycles `detectChanges()`/`whenStable()`. Root cause isolée par inspection directe du DOM rendu (`outerHTML` du `mat-tab-group`) : le libellé d'onglet et `aria-selected` se mettaient à jour correctement, mais le `mat-tab-body` restait bloqué sur l'onglet initial (`mat-mdc-tab-body-active` sur `content-0` malgré `selectedIndex=1`) — `MatTabGroup` utilise une transition CSS animée pour finaliser l'attachement du contenu du nouvel onglet actif, qui ne se termine jamais dans jsdom sans pilote d'animation. Corrigé en ajoutant `provideNoopAnimations()` (`@angular/platform-browser/animations`) au `TestBed` de `character-sheet.spec.ts` (absent jusqu'ici, ce composant n'avait jamais eu besoin d'animations avant l'introduction de `mat-tab-group`) — les transitions se résolvent alors instantanément. `partie-detail.spec.ts` (29.4) n'avait jamais rencontré ce piège car aucun de ses tests n'interroge le DOM d'un onglet sélectionné manuellement (seul `selectedTabIndex()` y est vérifié) — à garder en tête pour toute future story testant le contenu d'un `mat-tab-group` après sélection programmatique.

### Completion Notes List

- Toutes les tâches (1-6) complétées, les 4 ACs satisfaits.
- `CharacterSheet` restructuré avec un `mat-tab-group` local (4 onglets : Fiche/Équipement/Journal/Historique conditionnel), patron `selectedTabIndex`/`manualTabIndex`/`onTabIndexChange`/`tabSetKey` identique à `PartieDetail` (29.4) — décision documentée en Contexte de rester sur ce patron non-routé plutôt que d'introduire des routes Angular enfant, malgré le titre « sections routées ».
- `app-inventory-tab`/`app-history-tab`/`app-notes-journal` déplacés tels quels vers leurs onglets respectifs, aucune modification de leur logique interne ni de leurs bindings. Arme de prédilection et objet fétiche : décision de scope actée en amont conservée (arme reste dans Fiche/statistiques dérivées, objet fétiche rejoint Équipement avec l'inventaire).
- Titres de section devenus redondants avec le libellé de l'onglet retirés proactivement (`evolution.inventory_section_title`/`notes_journal_title`/`history_tab_label`), en application directe de la leçon des corrections post-test de 29.4 — pas de cycle "redondance acceptée puis retour utilisateur" cette fois.
- Nouvelle clé de thème `evolution.main_sheet_tab_label` ajoutée aux 3 thèmes (« Fiche » / « Feuille » / « Fiche technique »), registre cohérent avec les clés `evolution.*` voisines.
- Bug de formatage de l'équipement corrigé : `inventory-tab.scss`, `flex-wrap: wrap` + `min-width: 0; flex: 1 1 8rem;` ajoutés à `.inventory-tab__add-form`/`.inventory-tab__edit-form` (seul bloc de formulaire flex de la zone personnages qui ne l'avait pas). `.inventory-tab__mj-add-form` n'était pas affecté (pas de `display: flex` dédié, jamais concerné par le bug).
- 89 tests existants de `character-sheet.spec.ts` adaptés (Task 5) : sélection de l'onglet concerné avant assertion pour le contenu désormais non rendu par défaut (Équipement/Journal/Historique), aucun changement de logique métier. Le test "13 pencils MJ visibles" a dû être scindé en 2 tests (12 sur l'onglet Fiche + 1 sur l'onglet Équipement) car son hypothèse d'origine (tous les pencils MJ visibles simultanément) ne tient plus une fois le contenu réparti sur 2 onglets mutuellement exclusifs.
- 5 nouveaux tests ajoutés (Task 6) : nombre et libellés des onglets (4 vs 3 selon rôle), onglet Historique absent du DOM (pas seulement vide) pour un fellow player, contexte préservé au changement d'onglet (pas de rechargement, `characterSvc.get` non rappelé), distinction visuelle de l'onglet actif au-delà de la couleur.

### File List

**Modifiés**
- `apps/web/src/app/features/characters/character-sheet/character-sheet.ts`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.html`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.spec.ts`
- `apps/web/src/app/features/characters/character-sheet/inventory-tab/inventory-tab.scss`
- `apps/web/src/app/core/theme/tones.ts`

### Change Log

- 2026-08-09 : Story créée (bmad-create-story). Réutilise le patron de sous-navigation locale non-routée établi par 29.4/`PartieDetail` (décision explicite documentée en Contexte). Regroupe équipement (objet fétiche + inventaire) et journal dans leurs propres onglets, ajoute un onglet Historique conditionnel ; retire proactivement les titres de section devenus redondants avec les libellés d'onglet (leçon tirée des corrections post-test de 29.4). Inclut la correction du bug de formatage de l'équipement signalé par l'utilisateur (`inventory-tab.scss`, `flex-wrap` manquant).
- 2026-08-09 : Implémentation complète (bmad-dev-story). `mat-tab-group` local à 4 onglets sur `CharacterSheet`, bug de formatage de l'équipement corrigé, tests existants adaptés + 5 nouveaux tests de sous-navigation. 1147 tests web verts, lint propre, build : budget de bundle pré-existant seul point d'échec (identique à 29-2/29-3/29-4).
