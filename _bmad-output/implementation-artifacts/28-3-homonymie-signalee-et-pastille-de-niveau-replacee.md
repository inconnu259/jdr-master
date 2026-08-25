---
baseline_commit: 0d255cb50a3a6d1f30fcb2c6b40f108913b358e7
---

# Story 28.3: Homonymie signalée et pastille de niveau replacée

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want être averti quand mon nom affiché est déjà porté par quelqu'un de ma partie,
so that je choisisse en connaissance de cause d'en changer ou de l'assumer.

## Contexte

**Troisième et dernière story de l'épic 28**, elle clôt ce que 28.1 (écran de compte, `User.displayName`) et 28.2 (AD-2 partout, composant `IdentityLabel`) ont posé. 28.2 a explicitement laissé deux choses de côté pour cette story : **l'alerte d'homonymie (FR-4b)** et **le repositionnement de la pastille de montée de niveau (FR-17)**. Ce sont deux besoins indépendants qui partagent seulement le numéro de story.

> ⚠️ **Story 28.2 n'est pas encore `done`.** Son statut est `review` : 3 décisions ont été tranchées et corrigées (2026-08-06), mais **8 patches restent ouverts** dans sa section « Review Findings », dont plusieurs touchent des fichiers que **cette story va re-toucher** (`identity-label.ts`, `annonce-card`, `poll-status.html`, `xp-history.ts`). Ne pars pas du principe que le code de 28.2 est dans son état final — relis sa section Review Findings avant de commencer (voir Previous Story Intelligence ci-dessous).

### Découverte faite en préparant cette story — à connaître avant de coder

**Le MJ n'est jamais un `Membership`.** `PartiesService.create()` ne crée aucune ligne `Membership` pour le MJ — il est identifié uniquement par `Partie.mjId`. Conséquence directe : `listMembers()` (donc `PartieMemberDto[]`, donc tout ce qui alimente `members()` côté front) **ne contient jamais le MJ**. Pour détecter une homonymie entre un joueur et **le MJ** de sa partie, il faut le nom affiché du MJ — qui n'existe nulle part côté front aujourd'hui (`PartieDto` ne porte que `mjId`). **Task 1** comble ce trou en ajoutant `mjPseudo`/`mjDisplayName` à `PartieDto`, sans toucher `Membership` ni `listMembers()`.

**Aucun précédent d'avertissement non-bloquant, dismissible, sans réapparition en boucle n'existe dans le codebase.** Grep exhaustif (patterns `dismissed`/`acknowledged`/`isDismissed`, composants `*-alert*`/`*-warning*`/`*-banner*`) : rien de réutilisable. Le mécanisme de FR-4b/AC2 (« l'avertissement ne réapparaît pas en boucle sur chaque écran ») est un nouveau patron, entièrement à construire dans cette story — voir Task 2 pour la décision retenue (sessionStorage, surfacé une seule fois par Partie).

## Acceptance Criteria

1. **Given** un autre membre de ma partie (joueur **ou** MJ) porte le même nom affiché que moi, **When** j'ouvre l'onglet Détails de cette partie, **Then** l'application me le signale par un message non bloquant proposant de changer mon nom affiché (lien vers `/account`) ou de l'ignorer, **and** rien n'est bloqué : je peux continuer à naviguer sans rien modifier.

2. **Given** j'ai cliqué « Ignorer » sur l'avertissement d'homonymie d'une partie donnée, **When** je continue à naviguer dans cette partie (changement d'onglet, navigation vers une fiche de personnage, etc.) pendant la même session de navigateur, **Then** l'avertissement ne réapparaît pas, **and** si je rouvre la partie dans un nouvel onglet ou après avoir fermé le navigateur, il peut réapparaître (aucune mémorisation permanente n'est exigée par cette story).

3. **Given** un écran sans personnage listant plusieurs joueurs d'une même partie — Troupe mobile, gestion des membres, disponibilités (créneau), participants de scénario sans personnage, auteur d'une annonce — **When** deux d'entre eux partagent le même nom affiché, **Then** le pseudo de chacun est affiché en complément du nom affiché pour les distinguer, **and** un joueur qui ne partage son nom avec personne ne voit **pas** de pseudo affiché (le complément n'apparaît qu'en cas de collision réelle).

4. **Given** un de mes personnages a une montée de niveau disponible, **When** j'ouvre sa fiche, **Then** l'indicateur de montée de niveau (`<app-level-up-banner>`) est positionné juste sous le nom du personnage (`sheet__name`), et non plus après tout le bloc d'en-tête (avatar + actions d'export).

## Tasks / Subtasks

### Backend

- [x] Task 1 — `PartieDto` gagne l'identité du MJ (AC: #1)
  - [x] `packages/shared/src/index.ts`, `PartieDto` (~ligne 46-56) : ajouter `mjPseudo: string;` et `mjDisplayName: string;` juste après `mjId: string;`. Requis par AD-2 (« tout DTO exposant une identité porte pseudo **et** displayName ») — `PartieDto` expose désormais une identité (celle du MJ), donc les deux champs, pas un seul.
  - [x] `apps/api/src/parties/parties.service.ts` : **ne pas modifier `getViewable()`** (méthode de garde d'autorisation utilisée par 16+ appelants dans tout le module — characters, scenarios, homme-dragon, poll, announcements, realtime — dont la plupart ne lisent que `.mjId` ou l'utilisent comme simple contrôle d'existence/permission ; y ajouter un `include` élargirait le rayon d'impact sans bénéfice pour ces appelants). Créer à la place une nouvelle méthode publique `findOneDto(id: string, userId: string)` qui appelle `getViewable(id, userId)` (inchangée), résout ensuite `const mj = await this.prisma.user.findUnique({ where: { id: partie.mjId }, select: { pseudo: true, displayName: true } })`, et retourne `{ ...partie, mjPseudo: mj!.pseudo, mjDisplayName: mj!.displayName }`. Le MJ existe forcément (`partie.mjId` est une FK NOT NULL).
  - [x] `apps/api/src/parties/parties.controller.ts`, `@Get(':id')` (ligne ~41-44) : `return this.parties.getViewable(id, user.id);` → `return this.parties.findOneDto(id, user.id);`.
  - [x] **Hors scope explicite** : `GET /parties` (`listForUser()`, tableau de bord) continue de renvoyer les Parties sans `mjPseudo`/`mjDisplayName` — l'homonymie n'est détectée qu'au niveau de l'écran de détail d'une Partie (AC1), pas dans la liste. Ne pas étendre `listForUser()`.
  - [x] Test : `findOneDto()` retourne `mjPseudo`/`mjDisplayName` corrects pour un MJ et pour un joueur consultant la même Partie ; `getViewable()` reste inchangée et continue de lever `NotFoundException`/`ForbiddenException` dans les mêmes conditions (tests existants non modifiés).

### Frontend — Alerte d'homonymie (AC1, AC2)

- [x] Task 2 — Détection et affichage de l'avertissement d'homonymie sur `PartieDetail` (AC: #1, #2)
  - [x] **Décision d'architecture prise en préparant cette story** : l'avertissement est surfacé **une seule fois, au niveau de `PartieDetail`** (l'écran d'entrée de la Partie, celui qui charge déjà `members()` en entier) plutôt que dupliqué sur chaque sous-écran listant des membres — c'est ce qui garantit AC2 (« ne réapparaît pas en boucle sur chaque écran ») sans registre de préférences serveur à construire. Mémorisation du choix « Ignorer » via `sessionStorage` (clé `homonymy-dismissed:{partieId}:{userId}`) — **pas** de nouvel endpoint compte/préférences, aucune infrastructure de ce type n'existe (`apps/web/src/app/core/account/account.service.ts` ne porte qu'`updateDisplayName()`, rien d'autre). `sessionStorage` s'efface à la fermeture de l'onglet : c'est un choix délibéré, pas un raccourci — la story ne demande pas de mémorisation permanente (AC2 accepte explicitement la réapparition dans une nouvelle session).
  - [x] `partie-detail.ts` : nouveau `computed` `homonymousWith` (nom au choix) qui compare `auth.currentUser()?.displayName` à (a) chaque entrée de `members()` dont `userId !== currentUser.id`, et (b) `partie().mjDisplayName` si `partie().mjId !== currentUser.id` (le MJ n'étant jamais dans `members()`, cf. Découverte ci-dessus). Retourne `boolean`.
  - [x] Nouveau `signal` `homonymyDismissed` initialisé à `false`, mis à `true` au chargement de la Partie si `sessionStorage.getItem('homonymy-dismissed:' + partieId + ':' + userId)` existe (lire dans le même endroit que le chargement de `members()`, `partie()`). Méthode `dismissHomonymyWarning()` : écrit la clé dans `sessionStorage` et met le signal à `true`.
  - [x] `partie-detail.html` : bloc conditionnel `@if (homonymousWith() && !homonymyDismissed())` avant `mat-card-content` (ou juste après `mat-card-header`) — message reprenant une clé `theme.tone()['identity.homonymy_warning']`, un lien `routerLink="/account"` (texte `theme.tone()['identity.homonymy_change_cta']`) et un bouton `(click)="dismissHomonymyWarning()"` (texte `theme.tone()['identity.homonymy_ignore_cta']`). Aucune couleur seule (NFR-1) : icône ou libellé explicite, pas seulement une teinte d'avertissement.
  - [x] Nouvelles clés dans `apps/web/src/app/core/theme/tones.ts`, section `/* — identité — */` (déjà créée en 28.2, y ajouter) : `identity.homonymy_warning`, `identity.homonymy_change_cta`, `identity.homonymy_ignore_cta`, dans les 3 thèmes.
  - [x] Tests `partie-detail.spec.ts` : (a) deux membres avec le même `displayName` → avertissement visible ; (b) `displayName` du joueur courant identique à `partie.mjDisplayName` (et MJ absent de `members()`) → avertissement visible également ; (c) aucun homonyme → absent ; (d) clic « Ignorer » → avertissement disparaît **et** `sessionStorage` écrit avec la bonne clé ; (e) rechargement du composant avec la même clé déjà en `sessionStorage` → avertissement n'apparaît pas même si l'homonymie existe toujours.

### Frontend — Pseudo en complément dans les écrans sans personnage (AC3)

- [x] Task 3 — `IdentityLabel` : nouveaux inputs `pseudo`/`ambiguous` (AC: #3)
  - [x] `apps/web/src/app/shared/identity/identity-label.ts` : ajouter `readonly pseudo = input<string | null>(null);` et `readonly ambiguous = input<boolean>(false);`. N'affecte **que** le mode `single-player` (AC3 ne concerne que les écrans sans personnage) — ignoré silencieusement en mode `joint`/`single-character`.
  - [x] `identity-label.html`, branche `@else` (mode `single-player`, lignes ~19-32) : après `<span class="identity-label__name">{{ playerName() }}</span>`, ajouter `@if (ambiguous() && pseudo()) { <span class="identity-label__pseudo">({{ pseudo() }})</span> }`.
  - [x] `identity-label.scss` : `.identity-label__pseudo` — texte atténué (`color: var(--jdr-text-muted)` ou équivalent thème déjà utilisé ailleurs dans ce fichier), taille réduite, pas de nouvelle couleur inventée.
  - [x] Tests `identity-label.spec.ts` : nouveau test mode `single-player` avec `ambiguous=true` + `pseudo` fourni → pseudo visible dans le DOM ; `ambiguous=false` (défaut) → pseudo absent même si fourni ; mode `joint`/`single-character` avec `ambiguous=true` → aucun effet (le composant ignore l'input hors mode `single-player`).

- [x] Task 4 — Câblage de l'ambiguïté dans les écrans « sans personnage » (AC: #3)
  - [x] **Principe commun à tous les sites ci-dessous** : dans chaque écran, calculer un petit utilitaire local (ou une fonction pure partagée si le motif se répète à l'identique — juger sur place, ne pas sur-abstraire pour 4-5 sites) qui, pour une liste de `{ userId, pseudo, displayName }`, retourne l'ensemble des `userId` dont le `displayName` est partagé par au moins un autre élément de la même liste. Chaque site passe ensuite `[ambiguous]="isAmbiguous(item.userId)"` et `[pseudo]="item.pseudo"` à `<app-identity-label>`. (Factorisé dans `shared/identity/identity-ambiguity.util.ts` — motif identique sur 4 sites.)
  - [x] `creneau-card.ts`/`.html` (ligne 13) : ambiguïté calculée sur `slot().members` (déjà `{userId, pseudo, displayName, status}[]`, aucune nouvelle donnée à charger).
  - [x] `scenario-editor.ts`/`.html` (ligne 95) et `scenario-read-dialog.ts`/`.html` (ligne 107) : ambiguïté calculée sur `participantsWithoutCharacter()` (déjà `{userId, pseudo, displayName}[]`).
  - [x] `partie-detail.ts`/`.html` : deux sites, tous deux déjà alimentés par `members()` — Troupe mobile (ligne ~75) et gestion des membres (ligne ~263, boucle sur `otherMembers()`). Calculer l'ambiguïté sur `members()` en entier (pas `otherMembers()`) pour une détection cohérente entre les deux écrans, puis filtrer/indexer selon la boucle utilisée à chaque site.
  - [x] `annonce-card.ts`/`.html` : **ne pas dupliquer le calcul d'ambiguïté ici.** Toutes les annonces d'une même Partie ont le **même auteur** (le MJ, dérivé de `Partie.mjId` — aucune table `User` par annonce, cf. Story 28.2 Task 7). L'ambiguïté à afficher est donc exactement celle déjà calculée en Task 2 : *le MJ partage-t-il son nom affiché avec un membre de sa partie ?* Ajouter deux inputs à `AnnonceCard` : `readonly authorPseudo = input.required<string>();` et `readonly authorAmbiguous = input<boolean>(false);`, passés dans le template via `[playerName]`/`[pseudo]`/`[ambiguous]` sur son `<app-identity-label>` existant (ligne ~5). Les **3 appelants** (`partie-detail.html:120`, `scenario-editor.html:209`, `scenario-read-dialog.html:89`) passent `[authorPseudo]="a.authorPseudo"` (le DTO porte déjà ce champ) et `[authorAmbiguous]="mjIsHomonymous()"` — un `computed` dédié (MJ vs membres/participants, indépendant du viewer courant, distinct de `homonymousWith` qui est spécifique au viewer) ajouté aux 3 composants ; `scenario-editor`/`scenario-read-dialog` chargent `PartieDto` via `PartiesService.get()` (nouveau signal `partie`) pour disposer de `mjDisplayName`/`mjId`, aucun nouvel appel réseau redondant.
  - [x] **Hors scope explicite, ne pas toucher** : `xp-distribution-panel`/`xp-history` — ces écrans affichent déjà `IdentityLabel` en mode `joint` (nom du personnage **et** du joueur, cf. Story 28.2 Task 11), et FR-4b lui-même précise que « le nom du personnage lève l'ambiguïté dans la plupart des écrans » — c'est le cas ici, le pseudo n'y ajouterait rien. `poll-status.html` reste hors scope (déjà exclu par 28.2, `PollVoteDto` non étendu — un patch ouvert de la revue 28.2 le concerne, ne pas l'anticiper ici, ce n'est pas cette story qui le résout).
  - [x] Tests par site : au moins un test par écran touché vérifiant que le pseudo apparaît en présence d'une collision et disparaît en son absence (calqué sur le test `identity-label` de Task 3).

### Frontend — Pastille de montée de niveau (AC4)

- [x] Task 5 — Repositionner `<app-level-up-banner>` près du nom du personnage (AC: #4)
  - [x] `character-sheet.html` : déplacer le bloc `@if (isOwner()) { <app-level-up-banner [character]="c" (levelUp)="openLevelUpWizard()" /> }` (actuellement lignes 81-83, **après** la fermeture de `</header>`) vers l'intérieur de `<div class="sheet__header-info">`, juste après `<h1 class="sheet__name">{{ name() }}</h1>` (ligne 14) et avant `<p class="sheet__meta">`.
  - [x] **Décision de périmètre** : repositionnement uniquement — **aucune refonte visuelle** de `level-up-banner.*` (le composant reste un bandeau `flex` pleine largeur avec CTA texte, pas une pastille compacte). Le PRD (FR-17) et sa revue adversariale notent explicitement qu'aucune forme cible (pastille vs bandeau réduit) n'est spécifiée — le risque d'aller-retour est réel, mais redessiner le composant est un changement d'ampleur différente que « replacer près du nom » ; rester au déplacement de position le referme. Si un futur retour utilisateur demande une refonte visuelle, elle sera scopée séparément.
  - [x] Ne toucher **ni** `level-up-banner.ts` **ni** `level-up-banner.spec.ts` — le comportement (calcul de `pendingLevels`, `aria-live`, événement `levelUp`) est inchangé, seul son emplacement dans le template parent bouge.
  - [x] Test `character-sheet.spec.ts` : nouveau test vérifiant que `.level-up-banner-live` est un descendant de `.sheet__header-info` (`querySelector('.sheet__header-info .level-up-banner-live')`), en plus des 3 tests existants (présence/absence selon propriétaire et niveau en attente) qui restent valides tels quels (indépendants de la position DOM).

### Suites et vérification

- [x] Task 6 — Suites complètes et vérification manuelle
  - [x] `docker compose exec api pnpm test` — 49/49 suites, 945/945 tests, aucune régression.
  - [x] `docker compose exec api pnpm typecheck` — propre.
  - [x] `docker compose exec web pnpm test` — 78/78 suites, 1058/1058 tests, aucune régression.
  - [x] `docker compose exec web pnpm build` — dépassement de budget confirmé **préexistant** via `git stash`/`git stash pop` (baseline sans cette story : 209.55 Ko au-delà du budget de 1 Mo ; avec cette story : 214.50 Ko, soit +~5 Ko cohérent avec les nouveaux composants — pas une régression introduite ici).
  - [x] Redémarrer réellement le conteneur `api` — `Nest application successfully started` confirmé (`docker compose restart api`).
  - [x] Vérification manuelle bout-en-bout réelle (curl + psql) : `GET /parties/:id` confirmé renvoyer `mjPseudo`/`mjDisplayName` sur la Partie de démo « Chroniques de la Guilde ». Homonymie provoquée réellement : `PATCH /me/display-name` sur le compte Alice (démo) pour prendre le même nom que le MJ (« mj ») → `GET /parties/:id/members` reflète bien la collision (`displayName: "mj"` partagé). Données de test nettoyées après vérification (displayName d'Alice restauré, mots de passe démo restaurés). **Limitation** : l'extension Claude in Chrome n'était pas connectée dans cet environnement — l'affichage réel de l'avertissement/du pseudo en complément côté navigateur n'a pas pu être vérifié visuellement ; la vérification s'est arrêtée au payload API (confirmé correct) et aux 1058 tests web (dont plusieurs tests DOM ciblés reproduisant exactement ce scénario). Recommandé avant merge : un contrôle visuel manuel rapide.

## Dev Notes

### Previous Story Intelligence (28.2, statut `review` — pas encore `done`)

**8 patches restent ouverts dans la section Review Findings de 28.2** (`_bmad-output/implementation-artifacts/28-2-le-nom-affiche-traverse-lapplication.md`), dont plusieurs touchent des fichiers que cette story modifie à nouveau :

- `IdentityLabel` rend une icône seule avec un `aria-label` tronqué quand le nom est une chaîne vide — pertinent car Task 3 ajoute un nouvel input (`pseudo`) au même composant. Ne pas reproduire le même défaut sur le nouvel input (si `pseudo` est une chaîne vide, ne pas l'afficher — la garde `ambiguous() && pseudo()` de Task 3 le couvre déjà, `''` étant falsy).
- `poll-status.html` utilise encore `m.pseudo` en dur (pas migré vers `IdentityLabel`/`displayName`) — **ne pas corriger ce patch dans cette story**, il appartient à 28.2. Ne pas non plus étendre `PollVoteDto` ici (hors scope, cf. Task 4).
- `XpHistory` : deux personnages sans nom du même joueur produisent des lignes identiques — sans rapport avec cette story (Task 4 exclut explicitement XP), ne pas y toucher.
- Un `[Review][Decision]` encore ouvert sur 28.2 concerne la recherche d'invitation par e-mail (`UserSearchResultDto` sans `displayName`) — sans rapport avec cette story non plus.

**Ne pas corriger les patches ouverts de 28.2 dans cette story** sauf s'ils bloquent directement une AC de 28.3 — ce n'est le cas d'aucun d'entre eux ici. S'ils sont encore ouverts quand 28.3 passe en revue de code, les deux revues resteront indépendantes.

### Ce qui doit continuer de fonctionner

- `getViewable()` reste strictement inchangée — 16+ appelants dans tout le module API en dépendent comme garde d'autorisation (characters, scenarios, homme-dragon, poll, announcements, realtime, game-systems, character-roles). Ne créer `findOneDto()` qu'à côté, jamais en remplacement.
- `listForUser()` (`GET /parties`, tableau de bord) reste inchangée — pas de `mjPseudo`/`mjDisplayName` sur les Parties listées, seulement sur le détail d'une Partie (Task 1 est volontairement étroite).
- Le composant `IdentityLabel` reste rétrocompatible : `pseudo`/`ambiguous` sont optionnels avec des défauts (`null`/`false`) — tous les ~11 sites d'appel existants (Story 28.2) continuent de fonctionner sans modification s'ils ne passent pas ces nouveaux inputs.
- `level-up-banner.ts`/`.spec.ts` restent inchangés au niveau logique — seul le parent (`character-sheet.html`) change l'emplacement du tag.

### Anti-réinvention — ce qui existe déjà et doit être réutilisé

| Besoin | Réutiliser | Ne pas faire |
|---|---|---|
| Détection de doublon dans une liste par un champ | motif simple `Map<string, number>` de comptage sur `displayName`, puis filtrer les `userId` dont le compte > 1 — pas de dépendance externe | une librairie de détection de doublons |
| Composant présentationnel avec logique déléguée à l'appelant | patron déjà établi par `AnnonceCard.scopeLabel` (Story 9.2/28.2, « l'appelant détermine le libellé, le composant l'affiche tel quel ») — appliquer le même principe à `authorPseudo`/`authorAmbiguous` | un composant qui recalcule lui-même son ambiguïté (dupliquerait la logique déjà en Task 2) |
| Libellé thématisé | `tones.ts`, section `identity.*` déjà créée en 28.2 — y ajouter, ne pas créer une nouvelle section | une chaîne en dur dans un template |
| Résolution d'identité MJ en un select minimal | motif déjà utilisé partout depuis 28.2 (`select: { pseudo: true, displayName: true }`) | un `select` plus large que nécessaire |

### Sécurité

- `mjPseudo`/`mjDisplayName` sur `PartieDto` ne changent rien à la surface d'exposition existante — le pseudo et le nom affiché du MJ sont déjà visibles ailleurs (recherche d'utilisateurs pour `pseudo`, tout DTO d'identité pour `displayName`) à tout membre de la Partie. Aucune nouvelle fuite.
- Rien dans cette story ne touche à l'authentification, aux mots de passe, aux sessions ou aux e-mails.

### Project Structure Notes

- **Modifiés (API)** : `packages/shared/src/index.ts` (`PartieDto`), `apps/api/src/parties/parties.service.ts` (nouvelle méthode `findOneDto`), `apps/api/src/parties/parties.controller.ts`, + `*.spec.ts` associés.
- **Modifiés (web)** : `apps/web/src/app/shared/identity/identity-label.{ts,html,scss,spec.ts}`, `apps/web/src/app/core/theme/tones.ts`, `apps/web/src/app/features/parties/partie-detail/partie-detail.{ts,html,spec.ts}`, `apps/web/src/app/features/calendar/creneau-card/creneau-card.{ts,html,spec.ts}`, `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.{ts,html,spec.ts}`, `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.{ts,html,spec.ts}`, `apps/web/src/app/features/announcements/annonce-card/annonce-card.{ts,html,spec.ts}`, `apps/web/src/app/features/characters/character-sheet/character-sheet.{html,spec.ts}`.
- **Non touchés** : `packages/game-rules`, `PollVoteDto`/`poll-status.html`, `xp-distribution-panel`/`xp-history`, `SeanceInscriptionDto.inscrits`, `HommeDragonDto.voyageursProteges`, `InvitationDto`, `listForUser()`/liste des Parties (tableau de bord), `level-up-banner.ts`/`.spec.ts` (logique interne), tout mécanisme de préférences compte persistées côté serveur (pas construit — `sessionStorage` suffit à AC2).

### Pièges connus du projet

- **`pnpm typecheck` après un changement de forme de DTO partagé** — `ts-jest` ne type-check pas en cross-file. `PartieDto` change de forme (Task 1) : lancer le typecheck API après.
- **`ng test` type-check réellement les fichiers `.spec.ts`** — toute fixture `PartieDto` existante dans les tests web devra gagner `mjPseudo`/`mjDisplayName` (piège documenté en 28.1 et reconfirmé en 28.2).
- **Tout passe par Docker** — aucun outil Node sur l'hôte.

### Temps réel (checklist `docs/checklist.md`)

Aucun nouveau besoin de câblage SSE — cette story n'ajoute aucune mutation, seulement de la lecture (identité du MJ) et de l'affichage conditionnel côté client. Ne rien ajouter à `RealtimeService`/`RealtimeEventsService`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 28.3] — Acceptance Criteria d'origine
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-4b] — homonymie : non bloquant, proposer renommer/ignorer, pseudo en complément dans les écrans sans personnage nommés explicitement
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-17] — pastille de niveau, placement corrigé près du nom
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/review-adversarial.md#F-7] — FR-17 ne spécifie pas de forme cible (pastille vs bandeau) — décision de périmètre prise dans cette story (Task 5 : repositionnement seul)
- [Source: .../ARCHITECTURE-SPINE.md#AD-12] — `IdentityLabel` porte « le recours au pseudo en cas d'homonymie (FR-4b) » — mandat architectural direct pour Task 3/4
- [Source: .../ARCHITECTURE-SPINE.md#AD-2] — pseudo + displayName dans tout DTO exposant une identité (justifie `mjPseudo` à côté de `mjDisplayName`, Task 1)
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md#4.5] — « en cas d'homonymie, le pseudo prend le relais dans les écrans sans personnage »
- [Source: apps/api/src/parties/parties.service.ts#create,getViewable,listMembers] — confirmé : MJ jamais dans `Membership`
- [Source: apps/api/src/parties/parties.controller.ts#get] — point d'extension pour `findOneDto()`
- [Source: apps/web/src/app/shared/identity/identity-label.ts,.html] — état actuel post-28.2, base des nouveaux inputs
- [Source: apps/web/src/app/features/characters/character-sheet/character-sheet.html:5-83] — structure exacte du header, emplacement actuel/cible du banner
- [Source: apps/web/src/app/features/characters/character-sheet/level-up-banner/*] — composant inchangé, seul son emplacement bouge
- [Source: _bmad-output/implementation-artifacts/28-2-le-nom-affiche-traverse-lapplication.md#Review Findings] — patches ouverts à ne pas confondre avec le périmètre de cette story

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

Aucun. Un piège rencontré et corrigé en cours de route : `homonymousWith` (Task 2, spécifique au *viewer* courant) n'est pas équivalent à l'ambiguïté d'affichage de l'auteur d'une annonce (toujours le MJ, indépendamment de qui regarde) — un `mjIsHomonymous` dédié (MJ vs membres/participants) a été introduit dans les 3 composants concernés (`partie-detail`, `scenario-editor`, `scenario-read-dialog`) plutôt que de réutiliser `homonymousWith` tel quel comme la story le suggérait initialement, pour éviter un faux-négatif pour un joueur non impliqué dans la collision.

### Completion Notes List

- 6 tasks complétées en TDD. Suites finales : 945/945 tests API (49 suites), 1058/1058 tests web (78 suites), typecheck API propre, aucune régression.
- Nouvel utilitaire partagé `identity-ambiguity.util.ts` (factorisation du calcul d'ambiguïté sur 4 sites, motif identique).
- `findOneDto()` créé à côté de `getViewable()` (jamais en remplacement) — `getViewable()` et `listForUser()` strictement inchangées, conformément aux Dev Notes.
- Dépassement de budget bundle web confirmé préexistant (vérifié via `git stash`/`git stash pop`) — pas une régression de cette story.
- Redémarrage réel du conteneur `api` confirmé (`Nest application successfully started`).
- Vérification manuelle bout-en-bout réelle via curl + psql sur les comptes de démo (`mj-demo@example.com`, `alice@example.com`) : `GET /parties/:id` renvoie `mjPseudo`/`mjDisplayName` ; homonymie provoquée réellement (Alice renommée temporairement en « mj ») → `GET /parties/:id/members` reflète la collision. Données de test nettoyées après coup.
- Limitation : l'extension Claude in Chrome n'était pas connectée dans cet environnement — pas de vérification visuelle réelle du rendu navigateur (avertissement d'homonymie, pseudo en complément). La vérification s'est arrêtée à la confirmation du payload API et aux tests DOM ciblés (Vitest/jsdom) qui reproduisent ces scénarios. Un contrôle visuel manuel rapide est recommandé avant merge.

### File List

**Modifiés (API)**
- `packages/shared/src/index.ts` (`PartieDto` : +`mjPseudo`/`mjDisplayName`)
- `apps/api/src/parties/parties.service.ts` (+`findOneDto()`)
- `apps/api/src/parties/parties.service.spec.ts`
- `apps/api/src/parties/parties.controller.ts`

**Modifiés (web)**
- `apps/web/src/app/shared/identity/identity-label.{ts,html,scss,spec.ts}`
- `apps/web/src/app/core/theme/tones.ts`
- `apps/web/src/app/features/parties/partie-detail/partie-detail.{ts,html,scss,spec.ts}`
- `apps/web/src/app/features/calendar/creneau-card/creneau-card.{ts,html,spec.ts}`
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.{ts,html,spec.ts}`
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.{ts,html,spec.ts}`
- `apps/web/src/app/features/announcements/annonce-card/annonce-card.{ts,html,scss,spec.ts}`
- `apps/web/src/app/features/characters/character-sheet/character-sheet.{html,spec.ts}`
- `apps/web/src/app/core/parties/parties.service.spec.ts` (fixture `PartieDto`)
- `apps/web/src/app/core/poll/open-polls.service.spec.ts` (fixture `PartieDto`)
- `apps/web/src/app/features/dashboard/dashboard.spec.ts` (fixture `PartieDto`)
- `apps/web/src/app/features/parties/partie-form/partie-form.spec.ts` (fixture `PartieDto`)

**Nouveaux (web)**
- `apps/web/src/app/shared/identity/identity-ambiguity.util.ts`
- `apps/web/src/app/shared/identity/identity-ambiguity.util.spec.ts`

### Review Findings

Revue de code adversariale du 2026-08-06 (3 couches parallèles : Blind Hunter, Edge Case Hunter, Acceptance Auditor). 19 constats bruts → 14 après dédoublonnage → 3 écartés comme faux positifs/déjà résolus après vérification.

- [x] [Review][Decision] `PartieDto.mjPseudo`/`mjDisplayName` typés non-optionnels alors qu'un seul endpoint (`findOneDto`) les peuple — **résolu** : décision utilisateur, champs rendus optionnels (`mjPseudo?: string`, `mjDisplayName?: string`) pour un typage honnête. `findOneDto()` renvoie désormais la Partie sans ces champs (au lieu de lever) si l'utilisateur MJ est introuvable — combiné avec le patch ci-dessous. [packages/shared/src/index.ts:52-56]
- [x] [Review][Decision] `mjIsHomonymous` incohérent entre `PartieDetail`/`ScenarioEditor`/`ScenarioReadDialog` — **résolu, redesign** : décision utilisateur — le MJ doit être identifiable par un marqueur visuel systématique (icône/typo), jamais en dépendant d'une collision de pseudo. `AnnonceCard` affiche désormais un badge « MJ » permanent (réutilise `roster.mj_badge`, déjà établi par `RosterRail`/`RosterStrip`) au lieu de calculer une ambiguïté de nom. `mjIsHomonymous`/`authorPseudo`/`authorAmbiguous` **supprimés** des 3 composants (moins de code, plus robuste — l'identification ne dépend plus d'aucune collision de nom). Troupe/gestion des membres/créneaux/participants de scénario restent inchangés : le MJ n'y apparaît jamais (jamais un `Membership`), seule l'homonymie joueur-vs-joueur s'y applique. [apps/web/src/app/features/announcements/annonce-card/, apps/web/src/app/features/parties/partie-detail/partie-detail.ts, apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts, apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts]
- [x] [Review][Patch] `sessionStorage` non protégé dans `partie-detail.ts` — **corrigé** : lecture (`ngOnInit`) et écriture (`dismissHomonymyWarning`) enveloppées dans un `try/catch`, dégradation silencieuse en cas d'échec (nouvelle méthode privée `readHomonymyDismissed()`). [apps/web/src/app/features/parties/partie-detail/partie-detail.ts]
- [x] [Review][Patch] `findOneDto()` assertions non-null sans garde — **corrigé** : garde `if (!mj) return partie;` (même patron que `resolveParticipants`), plus de 500 si l'utilisateur MJ est introuvable. Nouveau test dédié ajouté. [apps/api/src/parties/parties.service.ts:99-107, apps/api/src/parties/parties.service.spec.ts]
- [x] [Review][Patch] `IdentityLabel.singleAriaLabel` n'intégrait pas le `pseudo` de désambiguïsation — **corrigé** : `aria-label` inclut désormais le pseudo entre parenthèses quand `ambiguous() && pseudo()`. Test ajouté. [apps/web/src/app/shared/identity/identity-label.ts:34-43]
- [x] [Review][Patch] Bandeau d'homonymie sans `aria-live`/`role="alert"` — **corrigé** : `role="alert" aria-live="polite"` ajoutés. Test ajouté. [apps/web/src/app/features/parties/partie-detail/partie-detail.html:8]
- [x] [Review][Patch] Test « Troupe mobile » avec `MJ_ID` dans `members` (état impossible en réalité) — **corrigé** : fixtures des 3 tests concernés remplacées par des joueurs réels uniquement (le MJ n'apparaissant jamais dans `members()`, cette collision n'est pas testable ni pertinente pour ces écrans — cohérent avec la décision ci-dessus). [apps/web/src/app/features/parties/partie-detail/partie-detail.spec.ts]
- [x] [Review][Defer] Comparaison d'homonymie en égalité stricte, sans normalisation trim/casse — deux noms différant seulement par un espace de fin ou la casse ne sont pas détectés comme identiques, alors qu'ils le sont visuellement. Hors scope de cette story (non mentionné dans la spec). — deferred, pre-existing (hors scope, à suivre séparément)
- [x] [Review][Defer] `ambiguousUserIds()` traiterait deux `displayName` vides comme homonymes (faux positif) — probabilité très faible en pratique, la Story 28.1 rejette déjà les noms vides/uniquement espaces à la source (API + front). — deferred, pre-existing (garde-fou déjà en place ailleurs dans le système)
- [x] [Review][Defer] `findOneDto()` effectue deux allers-retours DB séquentiels au lieu d'un seul `include` Prisma ; par ailleurs 3 composants front (`PartieDetail`, `ScenarioEditor`, `ScenarioReadDialog`) rappellent chacun indépendamment `PartiesService.get()` pour la même Partie. Préoccupation de performance, pas de correction ; cohérent avec des patrons déjà existants ailleurs dans le code. — deferred, pre-existing (pattern déjà répandu, pas une régression de cette story)
- [x] [Review][Defer] Repositionnement de `<app-level-up-banner>` sans changement `.scss` associé — risque théorique de resserrement visuel sur petit viewport, non vérifiable sans contrôle visuel réel. Déjà tracké dans les Completion Notes de cette story (« contrôle visuel manuel rapide recommandé avant merge »). — deferred, pre-existing (déjà noté comme limitation connue de cette story)

**Écartés (faux positifs / déjà résolus)** :
- « `pseudo` vide + `ambiguous=true` → aucun complément affiché » — c'est le comportement **voulu**, documenté explicitement dans les Dev Notes de cette story (référence directe à un defect de la revue 28.2 volontairement non reproduit).
- « `AnnonceCard.authorPseudo` (input requis) pourrait ne pas être fourni par tous les appelants » — vérifié faux par l'Edge Case Hunter (accès réel au projet) : les 3 sites d'appel réels le fournissent, et `AnnouncementDto.authorPseudo` est non-optionnel dans les types partagés.
- « `dismissHomonymyWarning()` et la lecture initiale utiliseraient des IDs de Partie différents (route vs `partie().id`) » — sur inspection, les deux proviennent du même `partie()` chargé avec succès dans le même cycle de vie du composant ; aucune divergence possible dans un chemin de code atteignable.

## Change Log

- 2026-08-06 : Implémentation complète (bmad-dev-story). Task 1 (`mjPseudo`/`mjDisplayName` sur `PartieDto` + `findOneDto()`), Task 2 (alerte d'homonymie AC1/AC2, `sessionStorage`), Task 3 (`IdentityLabel` inputs `pseudo`/`ambiguous`), Task 4 (câblage sur 5 écrans + `AnnonceCard.authorPseudo`/`authorAmbiguous`), Task 5 (repositionnement `level-up-banner` sous le nom du personnage), Task 6 (suites complètes + vérification manuelle). Statut passé à review.
- 2026-08-07 : Revue de code (3 couches adversariales) : 2 décisions tranchées avec l'utilisateur — (1) `mjPseudo`/`mjDisplayName` rendus optionnels sur `PartieDto` (typage honnête) ; (2) redesign de l'identification du MJ sur `AnnonceCard` — badge « MJ » permanent (réutilise `roster.mj_badge`) au lieu d'un calcul d'ambiguïté de nom, `mjIsHomonymous`/`authorPseudo`/`authorAmbiguous` supprimés (moins de code, plus robuste). 5 patches appliqués (garde `sessionStorage`, garde MJ introuvable dans `findOneDto()`, `aria-label` incluant le pseudo, `role=alert`/`aria-live` sur le bandeau, fixtures de test invalides corrigées). 4 items différés (voir `deferred-work.md`), 3 écartés comme faux positifs. Suite finale : 946/946 tests API, 1058/1058 tests web, typecheck API propre, aucune régression. Statut passé à done.
