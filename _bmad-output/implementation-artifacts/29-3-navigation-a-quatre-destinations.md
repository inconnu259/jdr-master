---
baseline_commit: 458c90facbcb723d9f038e5f9ee373b7e804f978
---

# Story 29.3: Navigation à quatre destinations

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur sur téléphone,
I want atteindre mes parties, mes personnages, mon calendrier et mon compte sans ouvrir de menu,
so that je passe de l'un à l'autre sans remonter en haut de page.

## Contexte

**Troisième story de l'épic 29**, séquencée juste après 29.2 (vue « mes personnages », `done`) — l'épic impose cet ordre : « la vue mes personnages précède la barre de navigation, sinon l'onglet mène au vide ». Les quatre routes cibles existent déjà :

| Destination | Route | Livrée par |
|---|---|---|
| Parties | `/` (`Dashboard`) | base |
| Personnages | `/characters` (`MyCharacters`) | Story 29.2, atteignable **par URL directe uniquement** jusqu'ici |
| Calendrier | `/profile/calendar` (`CalendarView`, `mode: 'personal'`) | base |
| Compte | `/account` (`Account`) | base |

Cette story ne crée **aucune** nouvelle page — elle remplace le mécanisme de navigation du `Shell` (aujourd'hui un unique bouton `account_circle` ouvrant un `mat-menu` avec 4 entrées : créer une partie, compte, calendrier, déconnexion) par une barre de navigation persistante à 4 destinations, **barre basse sur mobile, barre haute sur desktop**, mêmes entrées des deux côtés.

## Acceptance Criteria

1. **Given** j'utilise l'application sur téléphone, **When** je l'ouvre, **Then** une barre basse propose quatre destinations : Parties, Personnages, Calendrier, Compte.
2. **Given** j'utilise l'application sur desktop, **When** je l'ouvre, **Then** les mêmes quatre entrées apparaissent en barre haute.
3. **Given** une destination est active, **When** la barre s'affiche, **Then** elle est distinguée autrement que par la seule couleur.
4. **Given** la barre est livrée, **When** je cherche l'écran de compte, **Then** il est atteignable depuis la barre, et non plus seulement depuis le menu.
5. **Given** n'importe quel écran de l'application, **When** je veux consulter le calendrier, **Then** il est à un seul geste.

## Tasks / Subtasks

### Décisions de conception à prendre en compte (hors ACs explicites, mais requises pour que l'écran reste fonctionnel)

Le menu utilisateur actuel (`apps/web/src/app/layout/shell/shell.html`) porte aujourd'hui 4 entrées : « Lancer une quête » (`/parties/new`), « Compte », « Mes disponibilités » (calendrier), et **Déconnexion**. Les deux premières sont couvertes par la nouvelle barre (Compte) ou déjà dupliquées ailleurs (le CTA de création existe déjà en avant sur le `Dashboard`, `dashboard.html:4`). Le calendrier devient une destination de la barre. **La déconnexion n'a en revanche aucune AC qui lui assigne un nouveau foyer** — si le menu disparaît purement et simplement, l'utilisateur perd tout moyen de se déconnecter. Décision retenue pour cette story : déplacer l'action de déconnexion vers l'écran `Account` (`apps/web/src/app/features/account/`), qui est déjà la destination naturelle pour les actions de compte et est désormais atteignable en un geste depuis la barre. Ne **pas** conserver un menu résiduel uniquement pour la déconnexion — cela réintroduirait l'irritant que cette story corrige.

Le badge de vote en attente (`OpenPollsService.count`, actuellement affiché en `matBadge` sur le bouton `account_circle` du menu, testé dans `shell.spec.ts`) doit être relogé : ce compteur dénombre les Parties où l'utilisateur a un vote de créneau en attente de réponse — sémantiquement plus proche de « Parties » que de « Compte ». Le reloger sur l'icône de la destination **Parties** de la nouvelle barre (badge numérique standard `mat-badge`, même patron qu'aujourd'hui).

### Backend

- [x] Aucune tâche backend — cette story est un remaniement de navigation front pur (architecture spine : FR-48 → Shell Angular, « aucune AD dédiée — front pur, aucun invariant de divergence »).

### Frontend — barre de navigation

- [x] Task 1 — Composant de navigation à 4 destinations (AC: #1, #2, #3, #4, #5)
  - [x] Remplacer le contenu de `apps/web/src/app/layout/shell/shell.html` (actuellement `mat-toolbar` + `mat-menu` à une seule entrée visible) par une barre à 4 `routerLink` : Parties (`/`), Personnages (`/characters`), Calendrier (`/profile/calendar`), Compte (`/account`).
  - [x] Deux présentations d'un même jeu d'entrées, pas deux composants séparés (patron `DetailSurface`/`ConstraintPanel` : un composant, deux mises en page selon la largeur) : `@media (max-width: …)` bascule entre barre basse fixe (mobile) et barre haute (desktop) — point de rupture `768px` retenu (aligné sur `calendar-view.scss`), `.mode-row-mobile`/599px (dette 29.1) supprimé (Task 1 dernière sous-tâche).
  - [x] Libellés **toujours présents** à côté de l'icône, jamais icône seule. Écart assumé documenté et suivi : `mat-icon` (Material Icons) conservé, pas de migration SVG inline.
  - [x] Icônes retenues, cohérentes avec l'existant : Parties → `home` ; Personnages → `badge` ; Calendrier → `calendar_month` (repris tel quel) ; Compte → `person` (repris tel quel).
  - [x] AC3 — Entrée active distinguée par un second signal (poids de police, classe `.nav-bar__link--active`) en plus de la teinte, et `aria-current="page"` via `ariaCurrentWhenActive` (`RouterLinkActive`). Testé dans `shell.spec.ts`.
  - [x] AC4 — `/account` atteignable par un lien direct de la barre, aucun sous-menu. Testé.
  - [x] AC5 — `/profile/calendar` atteignable directement depuis la barre, persistante dans `Shell` donc visible sur tous les écrans enfants de `app.routes.ts`.
  - [x] `mat-menu` existant et son déclencheur `account_circle` retirés (`shell.html`) ; imports Angular Material devenus inutiles retirés de `shell.ts` (`MatMenuModule`, `MatDivider`, `MatButtonModule`).
  - [x] Badge `OpenPollsService.count` (`matBadge`) relogé sur le lien **Parties** de la nouvelle barre (posé sur l'`<a>`, pas sur le `mat-icon`, pour éviter le conflit `aria-hidden`/`matBadge` détecté par Angular Material — `matBadgeDescription` ajouté pour l'accessibilité). Même comportement qu'avant (`matBadgeHidden` à 0, `matBadgeColor="warn"`).
  - [x] `apps/web/src/app/layout/shell/shell.scss` réécrit : barre haute (flux normal, sous le logo) + barre basse fixe sous `@media (max-width: 767px)` (icône au-dessus du libellé, `env(safe-area-inset-bottom)`, padding du `.content` ajusté pour ne pas être masqué) ; classes mortes `.mode-toggle-desktop`/`.mode-row-mobile`/`mat-button-toggle-group`/`.menu-user` supprimées (déjà non référencées avant cette story, dette 29.1 + menu-user devenu mort par cette story).

- [x] Task 2 — Déconnexion déplacée vers l'écran Compte (décision de conception ci-dessus)
  - [x] `apps/web/src/app/features/account/account.ts` : méthode `logout()` ajoutée (délègue à `AuthService.logout()` puis `Router.navigate(['/login'])`), reprise de l'ancienne logique de `Shell.logout()`.
  - [x] `apps/web/src/app/features/account/account.html` : bouton de déconnexion ajouté en fin de carte (`mat-stroked-button`), séparé visuellement par une bordure (`.logout-row`).
  - [x] `apps/web/src/app/layout/shell/shell.ts` : méthode `logout()` retirée ; `AuthService`/`Router`/`user` retirés entièrement (plus aucun usage après suppression du menu).
  - [x] Tests : `account.spec.ts` — clic/appel direct de `logout()` vérifie `AuthService.logout()` puis `Router.navigate(['/login'])` ; rendu du bouton vérifié.

- [x] Task 3 — Thème : nouvelles clés de navigation (AC: #1, #2)
  - [x] `nav.calendar` et `nav.account` raccourcis (« Calendrier » / « Mon grimoire »-« Mon carnet »-« Mon établi ») — usage vérifié : uniquement dans `shell.html` avant cette story, aucune régression sur `dashboard.html`/`partie-form.html` qui utilisent `nav.my_games`/`nav.create_game` (non touchées).
  - [x] Clé `nav.characters` ajoutée (× 3 thèmes : « Personnages » / « Compagnons » / « Automates »).
  - [x] Bouton de déconnexion réutilise `nav.logout` existant, inchangé.

- [x] Task 4 — Tests (AC: #1, #2, #3, #4, #5)
  - [x] `apps/web/src/app/layout/shell/shell.spec.ts` réécrit entièrement : 4 liens de la barre, badge sur Parties (affiché/masqué), `ngOnInit()` conservé, entrée active (`aria-current`/classe) testée pour le cas actif et les 3 cas inactifs, absence de `mat-menu`/`account_circle`.
  - [x] Test « suppression du sélecteur de mode » (Story 29.1, AC1) conservé tel quel.
  - [x] Ancien test « lien vers /account dans le menu » remplacé par une assertion directe sur le lien de la barre (AC4).
  - [x] `apps/web/src/app/features/account/account.spec.ts` : 2 nouveaux tests (rendu du bouton, `logout()`).

### Review Findings

- [x] [Review][Patch] La barre basse fixe du `character-wizard` (`&__nav-bottom`, `position: fixed; bottom: 0`, sans `z-index`) entre en collision avec la nouvelle barre basse fixe du `Shell` (`z-index: 10`) sur mobile/tablette (< 1024px — le wizard ne passe en `position: static` qu'à ≥ 1024px). Le wizard est rendu dans le `router-outlet` du `Shell` (`/parties/:id/characters/new`) : les deux barres se superposent au même endroit de l'écran, risque concret de masquer les boutons Suivant/Précédent de la création de personnage sur téléphone. [apps/web/src/app/features/characters/character-wizard/character-wizard.scss] — corrigé : variable CSS `--shell-nav-bar-height` exposée par `Shell` (traverse l'encapsulation de vue Angular), `&__nav-bottom` décalée au-dessus sous 768px, `&__main` regagne le dégagement correspondant.
- [x] [Review][Patch] Les tests de déconnexion (`account.spec.ts`, describe « Account — déconnexion ») ne déclenchent jamais un clic DOM réel sur le bouton — un test vérifie seulement le texte, l'autre appelle `component.logout()` directement. La liaison `(click)="logout()"` elle-même n'est jamais exercée, contrairement à la demande explicite de la story (« clic sur le bouton → appelle... »). [apps/web/src/app/features/account/account.spec.ts] — corrigé : le test déclenche désormais un vrai `.click()` sur le bouton rendu.
- [x] [Review][Patch] Débordement visuel possible des libellés longs sur mobile : `.nav-bar__link` en colonne à `font-size: 0.7rem` sur ~70-90px de large (4 destinations sur un écran de téléphone), `white-space: nowrap` hérité empêche le retour à la ligne mais rien ne tronque le débordement. Le libellé le plus long en base (« Mes pérégrinations », thème Forêt Ancienne, 19 caractères) risque de déborder de sa colonne. [apps/web/src/app/layout/shell/shell.scss] — corrigé : `flex: 1 1 0` + `min-width: 0` sur `.nav-bar__link`, `overflow: hidden; text-overflow: ellipsis` sur le libellé.

**Écartés comme bruit (15)** — vérifiés et rejetés, aucune action : le CTA « Créer une partie » existe toujours sur le `Dashboard` (story 29.1, hors diff, faux positif du Blind Hunter sans contexte projet) ; le déplacement de la déconnexion vers l'écran Compte et la relocalisation du badge de vote sur Parties sont des décisions explicitement documentées dans la story, pas des oublis ; commentaire de code jugé « auto-justificatif » (opinion de style, pas un défaut) ; `[routerLinkActiveOptions]="{ exact: true }"` appliqué uniquement à `/` (aucune route enfant ne partage le préfixe des 3 autres liens actuellement, vérifié dans `app.routes.ts` — pas de collision réelle) ; absence de tests pour `logout()` (faux — les tests existent, raffiné en finding ci-dessus sur l'absence de clic réel) ; dérive potentielle hauteur de barre/padding du contenu (marge de ~7px existante, spéculatif) ; `z-index: 10` sans justification (aucun conflit démontré — les overlays de l'app utilisent 199-200, largement au-dessus) ; route `/characters` non prouvée (faux, existe bien, vérifiée) ; `matBadgeDescription` en français en dur (cohérent avec le précédent déjà présent dans l'ancien code — `aria-label="Menu utilisateur"` n'était pas non plus thématisé) ; perte de l'affichage du nom d'utilisateur du menu (toujours visible sur l'écran Compte, compromis accepté et non exigé par les ACs) ; absence de gestion du rejet de `auth.logout()` (reprend exactement le comportement préexistant de `Shell.logout()`, pas une régression introduite) ; absence de garde anti-double-clic sur le bouton de déconnexion (cohérent avec le reste de l'app, aucun patron de ce type ailleurs) ; grammaire « 1 vote(s) » dans la description ARIA (convention française acceptable, texte non visible) ; ancien test d'absence du sélecteur de thème dans le menu supprimé sans remplacement (assertion devenue caduque puisque le menu qu'il testait n'existe plus du tout — signalé comme bruit de faible valeur par l'Acceptance Auditor, pas une vraie régression de couverture).

## Dev Notes

### Project Structure Notes

- **Modifiés** : `apps/web/src/app/layout/shell/shell.html`, `shell.ts`, `shell.scss`, `shell.spec.ts` ; `apps/web/src/app/features/account/account.ts`, `account.html`, `account.spec.ts` ; `apps/web/src/app/core/theme/tones.ts` (nouvelles clés `nav.characters` × 3 thèmes, éventuelles variantes courtes).
- **Non touchés** : `app.routes.ts` (toutes les routes cibles existent déjà, cf. tableau en Contexte) ; `Dashboard`, `MyCharacters`, `CalendarView`, `Account` (composants de page, aucun changement de contenu, seulement de point d'entrée) ; toute logique backend.
- **Aucune nouvelle dépendance** — `MatToolbarModule`, `RouterLink`, `RouterLinkActive` (déjà utilisé ailleurs dans l'app, ex. vérifier via grep si absent) suffisent.

### Ce qui doit continuer de fonctionner

- Le chargement de `mjParties`/`playerParties` dans `Shell.ngOnInit()` — inchangé par cette story.
- Le CTA de création de partie mis en avant sur `Dashboard` (Story 29.1) — non dupliqué dans la barre, reste sur l'écran Parties.
- Le badge de vote en attente (`OpenPollsService.count`) — doit rester visible et fonctionnel, simplement relogé (cf. Task 1).
- La déconnexion — doit rester accessible à tout moment (cf. Task 2, nouveau foyer sur l'écran Compte).
- Toutes les routes de `app.routes.ts` restent inchangées ; `Shell` reste le composant parent de la zone authentifiée (`canActivate: [authGuard]`).

### Hors périmètre

- Aucune refonte visuelle au-delà de la barre elle-même (pas de nouveau header, pas de changement des pages de destination).
- Le sélecteur de thème reste sur l'écran Compte (déjà déplacé là par une story antérieure, cf. test `shell.spec.ts` « aucun sélecteur de thème dans le menu utilisateur »).
- Migration vers des icônes SVG inline pour l'ensemble de l'app (cf. écart assumé documenté en Task 1) — hors périmètre de cette story, à traiter si un jour une initiative de système de design plus large est lancée.
- Signalétique d'état des parties, modes d'affichage, filtres — stories 29.5+, non concernées ici.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.3] — Story, Acceptance Criteria (reprises telles quelles), et note de séquencement de l'épic 29 (ligne 269 : « la barre de navigation (29.3) livre une destination Calendrier qui pointe sur le calendrier existant jusqu'à ce que l'épic 30 le refonde »).
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md#Capability → Architecture Map] — FR-48 → Shell Angular, « aucune AD dédiée — front pur, aucun invariant de divergence » (ligne 482).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md#Navigation] — 4 destinations, barre basse mobile / barre haute desktop, motif décisif (empilement vertical repousserait le contenu), diagramme des routes cibles.
- [Source: .../EXPERIENCE.md#7. Accessibility Floor] — « Aucune information n'est portée par la couleur seule » (acquis non négociable) ; règles de navigation clavier/focus/aria-label de la base toujours en vigueur.
- [Source: .../EXPERIENCE.md#9. Responsive & Platform] — Tableau « Navigation | Barre basse, 4 destinations | Barre haute, mêmes entrées ».
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/DESIGN.md#7.6 BottomNav / TopNav] — Spécification du composant : 4 destinations, icônes + libellés toujours présents, entrée active teintée `{colors.accent-1}`.
- [Source: apps/web/src/app/layout/shell/shell.html, shell.ts, shell.scss] — État actuel du composant à remanier (menu unique, `mat-menu`, `logout()`, badge de vote).
- [Source: apps/web/src/app/app.routes.ts] — Routes cibles déjà existantes (`/`, `/characters`, `/profile/calendar`, `/account`), aucune modification requise.
- [Source: apps/web/src/app/core/poll/open-polls.service.ts] — `count` : nombre de Parties avec un vote en attente pour l'utilisateur, sémantique justifiant le rattachement à la destination Parties.
- [Source: apps/web/src/app/core/theme/tones.ts] — Clés `nav.*` existantes à réutiliser/étendre.
- [Source: apps/web/src/app/features/account/account.ts, account.html] — Écran cible du nouveau bouton de déconnexion.
- [Source: _bmad-output/implementation-artifacts/29-2-vue-mes-personnages.md] — Story précédente : route `/characters` livrée « atteignable par URL directe uniquement... l'entrée de navigation est câblée par la story 29.3 », confirmant que cette story est celle qui referme cette dette.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5

### Debug Log References

- Suite Vitest web complète (`docker compose exec web pnpm ng test --watch=false`) : 83 fichiers, 1127 tests, tous verts.
- `docker compose exec web pnpm eslint <fichiers touchés>` : propre après `--fix` (formatage Prettier uniquement, aucune erreur de règle).
- `docker compose exec web pnpm build` : compilation TypeScript/template propre ; échoue seulement sur `bundle initial exceeded maximum budget` (1.21 MB vs. budget 1 MB, `angular.json`) — confirmé **préexistant** (déjà signalé à l'identique par la story 29-2, légèrement amélioré ici : 1.21 MB contre 1.23 MB, car `MatMenuModule`/`MatButtonModule`/`MatDivider` retirés du chemin eager de `Shell`). Hors périmètre de cette story (pas un AC, `angular.json` non listé dans les Tasks).
- Avertissement Angular Material rencontré puis corrigé en cours d'implémentation : `matBadge` posé initialement sur un `mat-icon aria-hidden="true"` (masquait le badge aux lecteurs d'écran) — déplacé sur le lien `<a>` conteneur (patron de l'ancien code, qui le posait déjà sur le `<button>` et non sur le `<mat-icon>`), avec `matBadgeDescription` ajouté pour l'accessibilité.

### Completion Notes List

- Toutes les tâches (1-4) complétées, tous les ACs (#1-#5) satisfaits.
- `Shell` remanié : menu unique (`mat-menu` déclenché par `account_circle`) remplacé par une barre à 4 destinations (`<nav class="nav-bar">`), un seul jeu de liens `routerLink`/`routerLinkActive` dont la présentation bascule en CSS entre barre haute (desktop) et barre basse fixe (mobile, `@media (max-width: 767px)`) — pas de duplication de composant.
- AC3 : l'entrée active porte `aria-current="page"` (`ariaCurrentWhenActive="page"` sur `RouterLinkActive`) et une classe `.nav-bar__link--active` qui double la teinte d'un poids de police plus fort — jamais la couleur seule.
- Décision de conception documentée et implémentée : la déconnexion (perdait son seul foyer avec la disparition du menu) déplacée vers l'écran `Account`, en bas de carte, séparée visuellement. Le badge de vote en attente (`OpenPollsService.count`) relogé sur la destination Parties, sémantiquement plus proche (compte les Parties avec un vote en attente) que de Compte.
- Écart assumé et documenté dans le code (commentaire `shell.html`) : convention `mat-icon`/Material Icons du reste de l'app suivie plutôt que « SVG inline » du document de design — pas de migration de système de design dans cette story.
- Nettoyage : `AuthService`/`Router`/`user` retirés de `Shell` (plus aucun usage après suppression du menu) ; classes CSS mortes (`.mode-toggle-desktop`, `.mode-row-mobile`, `mat-button-toggle-group`, `.menu-user`) supprimées de `shell.scss`.
- Bug d'accessibilité intercepté en cours de route (pas dans le plan initial) : `matBadge` sur une icône `aria-hidden="true"` masquait le badge aux technologies d'assistance (warning Angular Material) — corrigé en posant `matBadge` sur le lien conteneur avec `matBadgeDescription`, comme le faisait déjà l'ancien code sur le `<button>`.
- Aucune migration Prisma / changement backend (story front pur, conforme à FR-48).

### File List

**Modifiés**
- `apps/web/src/app/layout/shell/shell.html`
- `apps/web/src/app/layout/shell/shell.ts`
- `apps/web/src/app/layout/shell/shell.scss`
- `apps/web/src/app/layout/shell/shell.spec.ts`
- `apps/web/src/app/features/account/account.ts`
- `apps/web/src/app/features/account/account.html`
- `apps/web/src/app/features/account/account.scss`
- `apps/web/src/app/features/account/account.spec.ts`
- `apps/web/src/app/core/theme/tones.ts`
- `apps/web/src/app/features/characters/character-wizard/character-wizard.scss` (revue de code : collision avec la barre basse fixe du `Shell`)

### Change Log

- 2026-08-08 : Implémentation complète de la story 29.3 — barre de navigation à 4 destinations remplaçant le menu du `Shell`, déconnexion déplacée vers l'écran Compte, badge de vote en attente relogé, clés de thème ajoutées/raccourcies. 1127 tests web verts, lint propre.
- 2026-08-08 : Revue de code (bmad-code-review) — 3 patches appliqués : collision de la barre basse fixe du `character-wizard` avec la nouvelle barre du `Shell` corrigée (variable CSS partagée), test de déconnexion déclenchant désormais un vrai clic DOM, débordement des libellés longs sur mobile empêché (troncature). 15 findings écartés comme bruit. 1127 tests web verts.
