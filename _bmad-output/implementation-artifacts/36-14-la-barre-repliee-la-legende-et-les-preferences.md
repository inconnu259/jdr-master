---
baseline_commit: acbd2e7cd4286524edd6070347816647c7506300
---

# Story 36.14: La barre repliée, la légende et les préférences

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que les réglages cessent d'occuper l'écran et que j'arrive sur ce qui m'intéresse,
so that le calendrier commence en haut de la page.

---

**Dernière story de l'épic 36.** Elle porte FR-54 (légende) et FR-55 (« qu'est-ce qui m'intéresse »),
et referme nommément la dette `deferred-work.md:66` — *« la barre de contrôles passe à DEUX lignes dès
1400 px […] c'est précisément ce que la story 36.14 répare »*.

**Portée : front pur.** Aucun fichier de `apps/api/`, aucune migration Prisma, aucun octet de
`packages/shared/` modifié. Le stockage des couches (`UserCalendarLayer` + `User.calendarLayersSetAt`)
et la route `PATCH /me/preferences` sont livrés depuis la story 30.4 et **ne bougent pas**.
[Source: epics.md:1930 — « 36.14 | La barre repliée, la légende, les préférences | **Front** »]

---

## Acceptance Criteria

### Les onze AC de `epics.md:2497-2545`, verbatim

**AC1 — la barre tient sur une ligne**
**Given** la barre de contrôles
**When** l'écran est au repos
**Then** elle tient sur **une seule ligne**, partagée avec la bascule de vues
**And** les couches ne s'y affichent plus en bande permanente

**AC2 — le panneau d'affichage**
**Given** un bouton d'affichage
**When** je l'active
**Then** un panneau présente les couches — menu ancré sur ordinateur, feuille montant du bas sur téléphone

**AC3 — pas de pastille au défaut**
**Given** un affichage identique au défaut
**When** la barre est rendue
**Then** aucune pastille de résumé n'apparaît

**AC4 — la pastille en écart**
**Given** un affichage qui s'écarte du défaut
**When** la barre est rendue
**Then** une pastille le signale
**And** elle porte l'action de rétablissement

**AC5 — la légende se règle dans le panneau**
**Given** la légende
**When** le panneau est ouvert
**Then** elle s'y règle
**And** elle est fermée par défaut

**AC6 — la légende sépare et reproduit**
**Given** la légende affichée
**When** elle est rendue
**Then** elle sépare ce qui se passe d'explication de ce qui en demande une
**And** chaque entrée reproduit exactement le traitement réel de la case

**AC7 — les intentions sur l'écran de compte**
**Given** l'écran de compte
**When** je règle ce que révèle mon calendrier
**Then** les choix sont posés en **intentions** — mes disponibilités et indisponibilités, mes séances, les votes, la disponibilité du groupe

**AC8 — état d'arrivée, jamais un verrou**
**Given** ce réglage
**When** j'ouvre un calendrier
**Then** il définit l'état d'arrivée
**And** les filtres de l'écran restent librement modifiables

**AC9 — la mémoire de session**
**Given** des bascules faites en cours de visite
**When** je reviens sur **le même** calendrier dans **la même** session
**Then** elles sont conservées

**AC10 — les trois sorties de la mémoire**
**Given** un rechargement, une déconnexion, ou l'ouverture d'un **autre** calendrier
**When** l'écran s'affiche
**Then** le réglage de compte s'applique de nouveau

**AC11 — la mémoire ne coûte rien**
**Given** la mémoire de session
**When** elle est implémentée
**Then** elle n'exige aucun mécanisme de détection de retour dans l'application
**And** aucune clé de couche existante n'est migrée

### Les AC ajoutés par cette story

**AC12 — la Destinée et « Ajouter des dates » restent dehors**
**Given** le panneau « Affichage » ouvert
**When** son contenu est rendu
**Then** ni `app-destiny-control` ni `.compose-arm` ne s'y trouvent
**And** tous deux restent des frères directs dans `.calendar-controls`

> Le commentaire est déjà écrit dans le code, à l'adresse de cette story —
> `calendar-view.html:22-25` : *« Quand la story 36.14 repliera les couches derrière « ☰ Affichage »,
> ce contrôle devra RESTER dehors. »* Le test `calendar-view.spec.ts:2285` l'exige déjà pour la bande
> actuelle ; il doit **continuer de passer** et être doublé pour le panneau.

**AC13 — la légende n'est jamais une seconde source de vérité**
**Given** une entrée de légende
**When** elle rend sa pastille
**Then** elle emploie la **classe réelle** de la bande (`.band[data-winner="…"]`) ou le **composant réel**
(`app-group-gauge`, `app-poll-track`)
**And** aucune valeur de couleur, d'opacité, de trame ou de dimension n'est réécrite dans le SCSS de la légende

**AC14 — la légende décrit ce que ce calendrier peut rendre**
**Given** le calendrier personnel
**When** la légende est affichée
**Then** elle ne porte aucune entrée « disponibilité du groupe »
**And** en contexte de partie, elle la porte

**AC15 — zéro écriture depuis le calendrier**
**Given** n'importe quelle bascule faite depuis la barre ou le panneau
**When** elle est enregistrée
**Then** aucune requête réseau n'est émise
**And** `defaultCalendarLayers` du compte est inchangé

**AC16 — aucune couche perdue au passage aux intentions**
**Given** un compte dont la préférence porte `inscriptions-ouvertes`
**When** je modifie n'importe quelle intention sur l'écran de compte
**Then** `inscriptions-ouvertes` est renvoyée intacte au serveur

**AC17 — l'écart se calcule sur le jeu complet**
**Given** un compte dont la préférence porte `inscriptions-ouvertes`
**When** la barre est rendue au premier affichage
**Then** aucune pastille n'apparaît

**AC18 — nom accessible et clavier**
**Given** le bouton d'affichage et le panneau
**When** ils sont rendus
**Then** le bouton porte un nom accessible même si son libellé visible est réduit à un pictogramme
**And** le panneau se ferme par `Échap` et rend le focus au bouton
**And** les interrupteurs de couches conservent leur `aria-pressed`

**AC19 — aucun libellé en dur, aucune couleur en dur**
**Given** toute chaîne visible et toute couleur introduite par cette story
**When** elle est rendue
**Then** la chaîne vient de `theme.tone()` et existe **non vide dans les trois thèmes**
**And** la couleur vient d'un token `var(--…)` existant — aucun token nouveau dans `styles.scss`

**AC20 — la grille reste alimentée sans filtre**
**Given** une couche éteinte
**When** les entrées sont transmises aux vues
**Then** `allCalendarEntries()` est inchangée
**And** le filtrage reste à l'affichage, dans `day-detail.utils`

**AC21 — portée close**
**Given** la fin de l'implémentation
**When** `git status` est lu
**Then** aucun fichier de `apps/api/`, aucun de `packages/shared/`, aucune migration

---

## Tasks / Subtasks

- [x] **Task 0 — Mesurer la baseline AVANT toute modification** (préalable à tout)
  - [x] Working tree propre, `HEAD = acbd2e7`
  - [x] `docker compose exec web pnpm test` → **reconfirmer** 111 fichiers / 2117 tests
  - [x] `docker compose exec web pnpm lint` → **reconfirmer** 142 erreurs
  - [x] 🚨 **Ne pas recopier ces chiffres : les mesurer.** La 36.9 a trouvé un écart de 53 tests avec ce
        qu'annonçait sa story. Le lint est passé de 143 à 142 entre la 36.13 et la 36.11 — la valeur
        courante est **142**.

- [x] **Task 1 — Le service de mémoire de session** (AC9, AC10, AC11, AC15)
  - [x] Créer `apps/web/src/app/features/calendar/calendar-session-layers.service.ts`,
        `@Injectable({ providedIn: 'root' })`
  - [x] État interne : `Map<string, CalendarLayerKey[]>` — **en mémoire, aucun stockage web** (encadré n°1)
  - [x] `read(key: string): CalendarLayerKey[] | null` / `write(key, layers)` / `clear()`
  - [x] La clé de calendrier : `'personal'` hors partie, `` `partie:${id}` `` en contexte de partie
  - [x] Brancher `clear()` sur la déconnexion (le point de sortie de `AuthService` — le localiser, ne pas
        en inventer un second)
  - [x] Spec unitaire pure, sans TestBed
  - [x] 🚨 Aucun `localStorage`, aucun `sessionStorage` — voir encadré n°1 pour le motif exact

- [x] **Task 2 — Câbler la mémoire dans `CalendarView`** (AC8, AC9, AC10)
  - [x] Dans `ngOnInit`, remplacer `this.activeLayers.set(this.defaultLayersForContext(!!id))`
        (`calendar-view.ts:1244-1247`) par : lecture du service, repli sur `defaultLayersForContext()`
  - [x] Dans `toggleLayer()` et `resetToDefault()`, écrire dans le service après la mise à jour du signal
  - [x] 🚨 `resetToDefault()` écrit le **défaut**, il n'efface pas l'entrée — sinon un retour immédiat
        rejouerait une valeur périmée
  - [x] Vérifier que la clé est **relue à chaque changement de paramètre de route**, pas seulement au
        montage (voir encadré n°2 — `deferred-work.md:117`)

- [x] **Task 3 — Le composant de contenu du panneau** (AC2, AC5, AC12)
  - [x] Créer `apps/web/src/app/features/calendar/calendar-display-panel/` — composant **de rendu pur**,
        même moule que `calendar-layer-toggle` : `input()` avec défauts, `output()`, `ThemeToneService`
        en `protected`
  - [x] Inputs : `keys`, `active`, `overridden`, `legendVisible` — **tous avec valeur par défaut**
        (piège payé quatre stories de suite, §Pièges n°8)
  - [x] Outputs : `layerToggled`, `resetRequested`, `legendToggled`
  - [x] Contenu, dans l'ordre du contrat (`contrat-ui-calendrier.html:599-609`) : intertitre
        « Ce que je vois » → les couches → séparateur 1 px → « Afficher la légende » → bouton de
        rétablissement
  - [x] 🚨 **Réutiliser `app-calendar-layer-toggle` à l'intérieur, ne pas le réécrire.** Il est vierge
        de l'épic 36 et déjà de rendu pur. Retirer de son template le seul bouton « Rétablir »,
        qui remonte d'un cran (il vit désormais dans le panneau **et** dans la pastille, C-8).

- [x] **Task 4 — Les deux surfaces** (AC2, AC18)
  - [x] Ordinateur : `cdkConnectedOverlay` ancré sur le bouton, **exactement le patron de la 36.7**
        (`calendar-view.html:314-340`) — `hasBackdrop`, `overlayKeydown` pour `Échap`, `cdkConnectedOverlayPush`
  - [x] Téléphone : feuille montant du bas, **patron `ConstraintPanel`** (`calendar-view.scss:84-93` —
        `.constraint-backdrop` en `position:fixed; inset:0; z-index:199`)
  - [x] Bascule par `BreakpointObserver` sur `CalendarView.DESKTOP_QUERY` = `(min-width: 1024px)`,
        **déjà déclaré** à `calendar-view.ts:193` — ne pas créer un quatrième vocabulaire de largeur
  - [x] Un **seul** composant de contenu, deux enveloppes (DESIGN.md §7.8 : « un seul composant, deux
        présentations »)
  - [x] Rendre le focus au bouton à la fermeture
  - [x] 🚨 `MatMenu` est **proscrit** dans ce projet (`shell.spec.ts:111,114` l'interdit par test) et
        `MatBottomSheet` n'y existe pas — voir encadré n°3

- [x] **Task 5 — La barre repliée** (AC1, AC12)
  - [x] Dans `calendar-view.html`, `.calendar-controls` devient, dans cet ordre : bouton « Affichage » →
        pastille de résumé (conditionnelle) → `app-destiny-control` (conditionnelle) → `.compose-arm`
        (conditionnelle) → `<span class="spacer">` → `.view-toggle`
  - [x] 🚨 **`.view-toggle` remonte DANS `.calendar-controls`** — c'est l'AC1 (« partagée avec la bascule
        de vues »). Aujourd'hui c'est un bloc séparé en dessous (`calendar-view.html:55-65`).
  - [x] `.calendar-controls` : retirer `flex-wrap: wrap` n'est **pas** demandé — la barre doit tenir sur
        une ligne *au repos*, le retour à la ligne reste un filet de sécurité
  - [x] `align-items` : repasser de `flex-start` à `center` **est maintenant correct** — le motif de
        `flex-start` (`calendar-view.scss:12-15`) était la bande de couches à deux lignes, qui disparaît.
        Mettre à jour le commentaire : la 36.9 a déjà payé une revue sur un commentaire mensonger à cet
        endroit précis.

- [x] **Task 6 — La pastille de résumé** (AC3, AC4, AC17)
  - [x] Rendue si et seulement si `isOverridden()` — la fonction existe (`calendar-view.ts:266-277`) et
        compare l'**ensemble complet**, ajouts et retraits
  - [x] Libellé : gabarit `Affichage filtré · {n} sur {total} · Rétablir`, où `total = availableLayerKeys().length`
        (4 en personnel, 5 en partie) et `n` = couches actives **parmi celles-là**
  - [x] Un seul élément cliquable, qui **est** l'action de rétablissement
  - [x] Conserver le `<div aria-live="polite">` existant autour (`calendar-layer-toggle.html:12`)
  - [x] 🚨 **Ne pas toucher `defaultLayersForContext()` / `isOverridden()` / `resetToDefault()`** : ils
        raisonnent sur le jeu **complet**, `inscriptions-ouvertes` comprise. Les restreindre à
        `availableLayerKeys()` ferait apparaître la pastille à tort pour tout compte portant encore la clé
        (AC17). Garde-fou explicitement posé par la 36.11, tâche 7.

- [x] **Task 7 — La légende** (AC5, AC6, AC13, AC14)
  - [x] Créer `apps/web/src/app/features/calendar/calendar-legend/` — rendu pur
  - [x] Deux groupes, intitulés verbatim : **« Se passent d'explication »** puis **« Demandent la légende »**
  - [x] Entrées, dans l'ordre, avec **le traitement réel du code livré** (encadré n°4) :
        1. `Je suis disponible` — `.band[data-winner="available"]`
        2. `Je suis indisponible` — `.band[data-winner="unavailable"]`
        3. `Séance confirmée — tu es pris` — `.band[data-winner="seance"]` (**filet intérieur**)
        4. `Créneau proposé au vote` — `.band[data-winner="vote"]` (**liseré gauche 3 px**)
        5. `Participation : la piste = la troupe` — `<app-poll-track>` réel
        6. `Disponibilité du groupe` — `<app-group-gauge>` réel, **contexte de partie seulement**
        7. `Personne ne s'est prononcé` — `.band[data-winner="none"]` (trame 45°, **42 %**)
  - [x] Fermée par défaut ; visible seulement si l'interrupteur du panneau est armé
  - [x] Rendue **sous la grille et sous le rail**, en fin de colonne de calendrier (décision D-2)
  - [x] 🚨 **Aucune couleur, aucune opacité, aucune trame réécrite** — AC13. Le SCSS de la légende ne
        contient que de la mise en page.

- [x] **Task 8 — Les quatre intentions sur l'écran de compte** (AC7, AC16)
  - [x] Dans `account.html:78-90`, remplacer la boucle sur `CALENDAR_LAYER_KEYS` par quatre cases fixes
  - [x] Titre : `account.calendar_layers_title` — **la clé existe déjà** (`tones.ts:302`), ne pas la recréer
  - [x] Sous-titre : « Ce que je veux voir en arrivant sur un calendrier. »
  - [x] Table de correspondance intention → clés, dans l'encadré n°5
  - [x] 🚨 `inscriptions-ouvertes` n'a **plus de case** mais doit être **repassée intacte** à chaque
        écriture (AC16). Le patron optimiste-avec-rollback de `account.ts:121-137` construit `next` à
        partir de `current` — vérifier que la clé y survit, et le prouver par un test.
  - [x] Cas mixte hérité (une seule des deux disponibilités active) : la case d'intention 1 est
        `indeterminate` — voir décision D-3

- [x] **Task 9 — Les clés de thème** (AC19)
  - [x] Ajouter les clés listées à l'encadré n°6 dans **les trois blocs** de `tones.ts`
  - [x] Étendre le test de complétude de `theme-tone.service.spec.ts:41-73` (tableau `AGENDA_KEYS` ou
        un frère) : toutes les nouvelles clés, `toBeTruthy()`, `for (const theme of THEMES)`
  - [x] **Garde de longueur** sur `calendar.display.trigger` : ≤ 12 caractères. Motif dans l'encadré n°6.

- [x] **Task 10 — Tests**
  - [x] Phase rouge explicite : les nouveaux tests échouent avant le code
  - [x] Étendre la fabrique `makeAuthService` de `calendar-view.spec.ts:76-84` si un nouveau champ de
        `currentUser` est lu — sinon ~200 tests tombent d'un coup
  - [x] Réécrire, **jamais supprimer**, les tests du bloc « couches actives » `calendar-view.spec.ts:1031-1125`
        qui changent de vérité (la non-persistance devient une persistance *en session*)
  - [x] Conserver verts : `:1610` (aucun appel réseau), `:1632` (entrées non filtrées),
        `:2273-2285` (Destinée hors de la bande), `:2972-3010` (inscriptions ouvertes),
        `shell.spec.ts:111,114` (pas de `mat-menu`), `account.spec.ts:516-630` (à réécrire en quatre intentions)
  - [x] Zoneless : boucle de ticks établie, `whenStable()` seul ne suffit pas

- [x] **Task 11 — Vérification visuelle réelle** (non négociable)
  - [x] Via **Chrome MCP `claude-in-chrome`**, session déjà ouverte par l'utilisateur — **jamais** le
        navigateur interne
  - [x] Les trois thèmes
  - [x] Contexte de partie **panneau latéral ouvert** — la colonne du calendrier n'y fait ~380 px
  - [x] Mesurer que la barre tient sur **une ligne** à 1400 px (la dette `deferred-work.md:66` disait
        deux lignes) — c'est le critère de fermeture de la dette
  - [x] La légende ouverte, en vérifiant que chaque pastille ressemble à la case au-dessus d'elle
  - [x] ⚠️ **La branche téléphone ne sera pas vérifiable à l'œil** : `resize_window` du navigateur piloté
        change `outerWidth` sans toucher `innerWidth`, donc `matchMedia('(min-width: 1024px)')` répond
        toujours `true` (`deferred-work.md`, section 36.11). Le consigner comme non vu, ne pas le prétendre.
  - [x] **Ne rien écrire en base de développement** — muter le signal client via `window.ng` si un état
        particulier est nécessaire

---

### Review Findings

- [x] [Review][Decision] AC1 violé en contexte de partie MJ — la barre reflue sur deux lignes (78 px) — Auto-consigné en Completion Notes item 6 : à 380 px de colonne, déclencheur + « Ajouter des dates » + bascule abrégée totalisent 448 px, dépassant la largeur disponible. **Résolu par l'utilisateur** : la cause racine n'est pas la barre mais le plafond global `.content { max-width: 60rem }` du Shell (`shell.scss:15-19`, appliqué à TOUTE l'app), qui rend mort le plafond `.detail { max-width: 72rem }` de `partie-detail.scss` (72rem > 60rem, jamais atteint) — lui-même déjà voulu par la story 6.1 pour donner de l'air à l'écran de partie sur grand écran. Décision : élargir le conteneur du Shell à 1024px+ (reclassé en patch ci-dessous) plutôt qu'accepter l'écart ou toucher uniquement la barre.

- [x] [Review][Patch] Plafond de largeur du Shell (`.content`, 60rem, `shell.scss:15-19`) rend inatteignable le plafond de 72rem déjà voulu par `partie-detail.scss` (story 6.1) sur grand écran — cause racine d'AC1 en contexte MJ [apps/web/src/app/layout/shell/shell.scss:15-19] — **corrigé** : `.content` passe à 90rem dès 1024px, laissant le plafond de 72rem de `partie-detail.scss` s'appliquer réellement.
- [x] [Review][Patch] Clé de session non relue au changement de paramètre de route, malgré l'exigence explicite de l'encadré n°2 [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:~1382] — **corrigé** : `ngOnInit` s'abonne désormais à `route.paramMap` (au lieu d'une lecture unique du snapshot) ; `partieId()`, la mémoire de session, le canal temps réel et les données scopées à la Partie (déclarations, créneaux, heatmap, scénarios, membres) sont rechargés à chaque changement de `:id`, y compris sur une instance réutilisée par Angular. 4 nouveaux tests dédiés (route réutilisée : mémoire, canal temps réel, rechargement des scénarios, retour au contexte personnel).
- [x] [Review][Patch] Ouverture du panneau d'affichage (menu ancré et feuille mobile) ne déplace jamais le focus à l'intérieur [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:355-364, calendar-view.html:96-149] — **corrigé** : `cdkTrapFocus`/`cdkTrapFocusAutoCapture` sur les deux surfaces (capture le focus à l'ouverture).
- [x] [Review][Patch] Feuille mobile `role="dialog"` sans piège à focus — Tab s'échappe vers le contenu de fond [apps/web/src/app/features/calendar/calendar-view/calendar-view.html:141-149] — **corrigé** : même `cdkTrapFocus` que ci-dessus.
- [x] [Review][Patch] Pastilles de légende `aria-hidden` enveloppent des composants potentiellement focalisables (PollTrack/GroupGauge) sans les neutraliser au clavier [apps/web/src/app/features/calendar/calendar-legend/calendar-legend.html] — **vérifié, aucun changement nécessaire** : ni `PollTrack` ni `GroupGauge` ne rendent d'élément focalisable aujourd'hui (spans `role="img"` purs, aucun bouton/lien/tabindex) — le risque décrit est hypothétique sur l'état actuel du code, pas un défaut réel.
- [x] [Review][Patch] Entrée de légende GroupGauge sans classe d'hôte — le compteur `.cnt` se rend à l'intérieur de la pastille, contrairement au traitement réel de la case (même défaut que PollTrack, corrigé ailleurs dans ce diff mais pas ici) [apps/web/src/app/features/calendar/calendar-legend/calendar-legend.html] — **corrigé** : `class="in-month"` posée sur `<app-group-gauge>`, même classe que la case du Mois.
- [x] [Review][Patch] Sélecteur CSS mort dans le panneau d'affichage — inatteignable sous l'encapsulation de vue Angular [apps/web/src/app/features/calendar/calendar-display-panel/calendar-display-panel.scss:668] — **corrigé** : retiré du SCSS du panneau, remplacé par une classe d'hôte `:host(.in-panel) .layer-toggle` dans `calendar-layer-toggle.scss` (même patron que `poll-track.scss`).
- [x] [Review][Patch] Redimensionnement à travers le seuil desktop/mobile pendant que le panneau est ouvert le ferme silencieusement au lieu de basculer menu → feuille [apps/web/src/app/features/calendar/calendar-view/calendar-view.html, calendar-view.ts] — **corrigé** : retrait du handler `(detach)="closeDisplayPanel()"`, qui se déclenchait aussi à la destruction du bloc `@if` par le changement de largeur.
- [x] [Review][Patch] Collision de clé de session entre `/parties/:id/calendar` (MJ) et `/parties/:id/guild-calendar` (personnel) pour un même id de partie [apps/web/src/app/features/calendar/calendar-session-layers.service.ts:23-25] — **corrigé** : `calendarSessionKey()` prend désormais le mode, suffixe `:guild` pour la route personnelle en contexte de partie.
- [x] [Review][Patch] `.display-trigger` sans `aria-haspopup` [apps/web/src/app/features/calendar/calendar-view/calendar-view.html, calendar-view.scss] — **corrigé** : `aria-haspopup="dialog"` ajouté.
- [x] [Review][Patch] Course de rétablissement optimiste dans `onIntentToggle()` — deux bascules rapprochées qui échouent toutes les deux peuvent laisser l'UI sur une valeur jamais confirmée par le serveur [apps/web/src/app/features/account/account.ts] — **corrigé** : `confirmedLayers`, dernière valeur confirmée par le serveur partagée entre `onLayerToggle()` et `onIntentToggle()`, cible du rollback à la place de `previous`.

**Vérification post-patch** : `docker compose exec web pnpm test` → 114 fichiers / 2188 tests verts (baseline 2184 + 4 nouveaux) ; `docker compose exec web pnpm lint` → 142 = baseline exactement.

## Dev Notes

### Encadré n°1 — 🚨 La mémoire de session n'emploie AUCUN stockage web

C'est le point le plus contre-intuitif de la story, et le plus facile à rater.

Le réflexe est `sessionStorage` : le nom correspond, la portée semble correspondre. **Il est faux.**
`sessionStorage` **survit à un rechargement** (F5) dans le même onglet. Or l'AC10 exige :

> **Given** un rechargement […] **Then** le réglage de compte s'applique de nouveau

Un `sessionStorage` rendrait donc l'AC10 **faux sur sa première branche**, et aucun test de composant ne
le verrait — jsdom ne recharge rien.

**Ce qui satisfait les quatre branches sans un octet de code dédié : un service racine, état en mémoire.**

| Branche de l'AC | Ce qui la satisfait |
| --- | --- |
| Même calendrier, même session (AC9) | La `Map` vit tant que l'application vit |
| Rechargement (AC10) | Le service est reconstruit vide — **gratuit** |
| Déconnexion (AC10) | `clear()` au point de sortie de `AuthService` |
| Autre calendrier (AC10) | Clé différente ⇒ `read()` rend `null` ⇒ repli sur le défaut de compte |
| « aucun mécanisme de détection de retour » (AC11) | Trivialement vrai : il n'y a rien à détecter |

C'est exactement ce que le PRD décrit — `prd.md:357` : *« Cette garantie est **acquise sans coût** : une
mémoire de portée session expire d'elle-même à la fermeture. Elle ne justifie aucun mécanisme de détection
dédié — **si elle devait en demander un, elle serait abandonnée.** »*

Et c'est la seule lecture compatible avec **AD-13** (`ARCHITECTURE-SPINE.md:152`), qui fait de
`localStorage` un **cache d'amorçage réservé au thème**. L'inventaire complet du stockage web du projet
tient en trois clés (`jdr-theme`, `master-jdr.mode` — supprimée, `homonymy-dismissed:…`). **N'en ajoutez
pas une quatrième.**

### Encadré n°2 — 🚨 La clé de calendrier doit être relue au changement de route, pas au montage

`deferred-work.md:117` consigne un défaut réel et directement fatal à l'AC10 :

> *« Un scénario de réutilisation d'instance de composant à travers un changement de paramètre de route
> (sans destruction complète) pourrait faire fuiter la plage d'un contexte vers l'autre. »*

C'est écrit pour `fromDateStr`/`toDateStr`, mais le mécanisme est identique : les trois routes
(`/profile/calendar`, `/parties/:id/calendar`, `/parties/:id/guild-calendar`) montent **le même composant**
`CalendarView` (`app.routes.ts:44,45,79`). Angular peut réutiliser l'instance sur un simple changement de
paramètre.

Si la clé de session est calculée **une fois** dans `ngOnInit`, passer de la partie A à la partie B
conserverait la clé de A — et l'AC10 (« l'ouverture d'un **autre** calendrier ») serait faux en production,
vert en test.

**Règle :** la clé dérive de `partieId()`, qui est déjà un signal. Dériver la lecture du même signal, ou
s'abonner aux paramètres de route — jamais capturer la valeur au montage.

### Encadré n°3 — 🚨 Les surfaces : ce qui existe, ce qui est proscrit

| Mécanisme | État dans le projet | Verdict |
| --- | --- | --- |
| `MatMenu` | **Retiré du Shell**, et l'interdiction est verrouillée par test : `shell.spec.ts:111` `expect(querySelector('mat-menu')).toBeNull()` | ❌ **Proscrit** |
| `MatBottomSheet` | Zéro occurrence dans `apps/web/src` | ❌ Aucun patron à imiter |
| `cdkConnectedOverlay` | **Introduit par la 36.7, dans le calendrier**, `calendar-view.html:314-340` | ✅ **Le patron ordinateur** |
| `ConstraintPanel` (maison) | `.constraint-backdrop` `position:fixed; inset:0; z-index:199`, `calendar-view.scss:84-93` | ✅ **Le patron téléphone** |
| `MatDialog` | Trois dialogues du calendrier, même moule | Hors sujet ici (centré, pas ancré) |

Le patron d'ancrage est déjà écrit dans le fichier que vous modifiez, avec son motif —
`calendar-view.html:314-318` : *« Premier `cdkConnectedOverlay` du projet : `MatDialog`, seul patron
flottant existant ici, est centré à l'écran alors que le contrat d'UI dit « ancré sur cette bande ».
`hasBackdrop` donne la fermeture au clic extérieur sans code, et `overlayKeydown` porte `Échap`. »*

Les positions sont déjà déclarées (`PICKER_POSITIONS`, `calendar-view.ts:114-119`) — s'en inspirer, mais
en déclarer un jeu propre au panneau : celui du sélecteur est calé sur une bande de grille, pas sur un
bouton de barre.

🚨 **Piège de la 36.13, encadré n°3, directement applicable ici :** le glissement de sélection fait son
hit-test par `elementFromPoint` + `closest([data-cell-date])`, et **`elementFromPoint` est stubbé dans les
tests**. Un overlay au-dessus de la grille est exactement le type de nœud qui casserait le geste **en
production** en laissant les 15 tests de glissement **verts**. Le panneau a un backdrop : vérifier à l'œil
que le glissement fonctionne toujours **panneau fermé**, et que le backdrop ne survit pas à la fermeture.

### Encadré n°4 — 🚨 La légende copie LE CODE, pas la planche

L'annotation 31 du contrat (`contrat-ui-calendrier.html:670`) dit :

> *« Chaque pastille reproduit **exactement** le traitement réel de la case — pas une approximation. »*

Or **la planche et le code livré divergent**, et le code a raison. Trois écarts mesurés :

| Élément | Planche | DESIGN.md | **Code livré (fait foi)** |
| --- | --- | --- | --- |
| Vote | filet intérieur | liseré gauche 3 px | **liseré gauche 3 px** — `calendar-month-view.scss:238-242` |
| Trame « personne » | 70 % | 40 % | **42 %** — `calendar-month-view.scss:227-231` |
| Disponible / indisponible | 32 % | 28 % | **32 %** — `calendar-month-view.scss:216-223` |

Le premier écart n'est **pas** une divergence ouverte : il a été **arbitré par la story 36.2**, et le motif
est commenté dans le code (`calendar-month-view.scss:233-236`) —

> ⚠️ *« Écart assumé au contrat d'UI, qui dessine un filet identique à celui de la séance. Deux formes
> identiques ne laisseraient que la teinte pour distinguer séance et vote, ce que P-1 interdit. »*

**Conséquence, et c'est l'AC13 :** ne recopiez aucune de ces valeurs dans le SCSS de la légende. Une
quatrième copie divergerait au premier changement de thème. **Instanciez la classe réelle** :

```html
<span class="band" data-winner="vote"></span>
```

et pour les deux entrées composites, **instanciez le composant réel** — `<app-group-gauge>` et
`<app-poll-track>`, avec des valeurs de démonstration figées. La fidélité devient alors structurelle :
elle ne peut plus se périmer.

⚠️ **Trou connu, à consigner sans le combler ici** — `EXPERIENCE.md:391` demande une légende pour « la
jauge de groupe **et les pastilles par membre** ». Le contrat ne dessine qu'une entrée, figurant la jauge.
Or pour un MJ à ≤ 6 membres, la case n'affiche **jamais** de jauge mais des pastilles : la légende ne
décrirait alors rien de ce qu'il voit. Instancier `<app-group-gauge>` avec les mêmes entrées que la grille
résout le cas **structurellement** — le composant choisit lui-même sa forme. Vérifier que c'est bien lui
qui arbitre, et non l'appelant.

### Encadré n°5 — 🚨 Quatre intentions, six clés : la table de correspondance

`account.html:78-90` boucle aujourd'hui sur les **six** `CALENDAR_LAYER_KEYS` et rend six cases techniques,
`Les inscriptions ouvertes` comprise. L'AC7 demande **quatre intentions**.

| # | Intention (libellé du contrat, `contrat-ui-calendrier.html:683-686`) | Clés écrites |
| --- | --- | --- |
| 1 | `Mes disponibilités & indisponibilités` | `mes-disponibilites` **et** `mes-indisponibilites` |
| 2 | `Mes séances confirmées` | `mes-seances` |
| 3 | `Les votes en cours` | `votes-en-cours` |
| 4 | `La disponibilité du groupe` | `disponibilite-groupe` |
| — | *(aucune case)* | `inscriptions-ouvertes` — **repassée intacte** |

**L'asymétrie compte ↔ panneau est voulue**, annotation 34 (`contrat-ui-calendrier.html:693`) :
*« Dispos et indispos regroupées ici, et **séparées dans le panneau Affichage**, où l'asymétrie d'usage a
un sens. »* Motif, `EXPERIENCE.md:221` : *« pour répondre à un vote on garde les indisponibilités visibles
(elles empêchent de voter un mauvais soir) tout en éteignant les disponibilités, qui ne sont que du bruit
à ce moment-là. »*

🚨 **Le triple interdit de la 36.11 s'applique mot pour mot :**

> - **NE PAS** retirer la clé de `CALENDAR_LAYER_KEYS` — l'union est validée serveur par
>   `@IsIn(CALENDAR_LAYER_KEYS, { each: true })` ; la retirer ferait échouer la sauvegarde des préférences
>   de tout compte l'ayant déjà enregistrée.
> - **NE PAS** écrire de migration ni de script de nettoyage. *« sans migration »*, littéralement (AC11).
> - Un interrupteur qu'on ne peut plus atteindre ne doit pas pouvoir vider quoi que ce soit.

Le patron d'écriture à imiter, **sans le réécrire** — `account.ts:121-137`, optimiste avec rollback gardé :

```ts
const next = active ? [...current, key] : current.filter((k) => k !== key);
this.auth.currentUser.set({ ...previous, defaultCalendarLayers: next });
this.account.updatePreferences({ defaultCalendarLayers: next }).catch(() => {
  if (this.auth.currentUser()?.defaultCalendarLayers === next) {
    this.auth.currentUser.set(previous);   // ← la garde : ne pas écraser une bascule plus récente
  }
});
```

Une intention écrivant **deux** clés, `next` se calcule sur les deux d'un coup — jamais deux appels
successifs, qui feraient deux allers-retours réseau et deux fenêtres de rollback qui se marchent dessus.

### Encadré n°6 — Les clés de thème à créer

Toutes dans **les trois blocs** de `tones.ts` (Grimoire Émeraude ≈ l.16-500, Forêt Ancienne ≈ l.500-820,
Médiéval Steampunk ≈ l.820-990).

| Clé | Contenu | Contrainte |
| --- | --- | --- |
| `calendar.display.trigger` | « Affichage » | 🚨 **≤ 12 caractères, borné par test** |
| `calendar.display.trigger_aria` | Nom accessible du bouton | — |
| `calendar.display.section_visible` | « Ce que je vois » | — |
| `calendar.display.show_legend` | « Afficher la légende » | — |
| `calendar.display.filtered_badge` | « Affichage filtré · {n} sur {total} · Rétablir » | gabarit `{n}` / `{total}` |
| `calendar.legend.group_obvious` | « Se passent d'explication » | — |
| `calendar.legend.group_needs` | « Demandent la légende » | — |
| `calendar.legend.entry.*` | Les sept libellés d'entrée | — |
| `account.calendar_intent.*` | Les quatre intentions | — |
| `account.calendar_intents_subtitle` | « Ce que je veux voir en arrivant sur un calendrier. » | — |

**Réutiliser sans recréer :** `account.calendar_layers_title` (`tones.ts:302`),
`account.calendar_layer.<6 clés>` (`:303-308`), `cta.restore_default_layers` (`:173`).

🚨 **Pourquoi la borne de longueur sur `calendar.display.trigger`.** La 36.12 a payé ce défaut à l'écran :
elle prescrivait de réutiliser `cta.choose_date`, dont la variante Forêt Ancienne est *« Planter le drapeau
de la clairière »* — répétée sous chaque option, elle doublait la hauteur de chaque ligne (65 px contre
39 px). La correction fut une clé courte dédiée, **bornée par un test** pour qu'une relecture éditoriale
(35.3) ne puisse pas la rallonger sans le voir : `theme-tone.service.spec.ts:76-83`. Ici, le bouton partage
**une ligne** avec la bascule de vues et deux pastilles conditionnelles : une variante longue reproduirait
le défaut exact que cette story existe pour réparer.

### Décisions prises pour cette story

Les artefacts ne tranchent pas les points suivants. Décisions posées, motif donné ; toutes sont
reversibles par `correct-course`.

**D-1 — Le seuil ordinateur/téléphone est `(min-width: 1024px)`, une media query, pas une container query.**
Aucun artefact ne donne de seuil pour la barre (le seul seuil chiffré du palier, 500 px, gouverne la densité
de la grille Semaine). `(min-width: 1024px)` est le **seuil unique du projet** — `partie-detail`,
`list-control-bar`, et déjà `CalendarView.DESKTOP_QUERY` (`calendar-view.ts:193`, dont le commentaire dit
« pas un troisième vocabulaire de largeur dans l'application »). Media query et non container query, parce
que la surface est un **overlay ancré au viewport**, pas du contenu dans la grille : le raisonnement de la
36.13 (« en contexte de partie un panneau latéral prend 40 % de la largeur et une media query mentirait »)
ne s'applique pas à un élément qui flotte au-dessus de tout.
⚠️ **Conséquence assumée :** la branche téléphone sera **invérifiable à l'œil** avec le navigateur piloté.

**D-2 — La légende se rend sous la grille et sous le rail, en fin de colonne.**
Aucun artefact ne dit *où* elle apparaît une fois armée (le contrat ne la dessine qu'isolée,
`contrat-ui-calendrier.html:654-665`). Trois emplacements étaient possibles : dans le panneau lui-même, au
-dessus de la grille, sous la grille. **Au-dessus est exclu par la story elle-même** — « le calendrier
commence en haut de la page » est sa raison d'être ; y poser un bloc de sept lignes reproduirait la bande
permanente qu'on supprime. **Dans le panneau est exclu** par « fermée par défaut » couplé à « l'écran doit
rester lisible sans elle » : une légende qui disparaît avec le panneau ne peut pas être lue *en regardant
la grille*. Reste sous la grille, où elle n'empêche rien et se consulte en gardant les cases à l'œil.

**D-3 — La case d'intention « disponibilités & indisponibilités » est `indeterminate` en état mixte.**
L'écran de compte livré par la 30.4 offre les deux clés **séparément** : un compte peut donc porter
aujourd'hui exactement une des deux. Regrouper naïvement (cochée si les deux, décochée sinon) ferait
disparaître silencieusement une couche active au premier clic. `mat-checkbox` porte `indeterminate` ;
un clic depuis cet état arme les deux. Aucune couche n'est perdue sans un geste explicite.

**D-4 — « Rétablir » existe à deux endroits, ce n'est pas un doublon.**
`EXPERIENCE.md:196` dit que le bouton *« déménage »* dans la pastille ; mais les deux planches du panneau
le dessinent **encore dedans** (`contrat-ui-calendrier.html:609`,
`iteration-groupe-participation-filtres.html:193`). Le contrat faisant foi et dessinant les deux, la
lecture retenue est **deux points d'accès à la même action** — la pastille en raccourci contextuel, le
bouton du panneau comme chemin explicite. Les deux appellent `resetToDefault()`, il n'y a qu'un
comportement.

**D-5 — Le masquage au défilement de `ListControlBar` n'est PAS repris.**
`EXPERIENCE.md:191` dit qu'on réutilise le patron de la liste « tel quel », mais la table de comportement
propre au calendrier (`EXPERIENCE.md:193-200`) ne mentionne **que** le bouton et la pastille. Reprendre le
masquage au défilement ferait entrer deux règles d'accessibilité supplémentaires
(`review-accessibility.md:233` : ne pas masquer sous `prefers-reduced-motion`, ne jamais masquer la
pastille) pour un gain non demandé. Hors périmètre.

### Ce qui est HORS périmètre — et pourquoi

🚨 **Le piège de périmètre le plus coûteux de cette story.** `deferred-work.md:70` invite nommément la
36.14 à câbler `GET /parties/:id/heatmap` sur le temps réel :

> *« un câblage correct suppose une émission sur `partieTopic` depuis `AvailabilityService`, **donc une
> décision d'architecture**. À évaluer avec la story 36.14 (préférences et couches). »*

**Ne pas l'engager.** C'est un chantier **serveur**, sur une story dont `epics.md:1930` fixe la portée à
« Front », et P-5 du PRD (`prd.md:57`) est explicite : *« Toute évolution touchant le serveur est listée au
§5. Si l'implémentation en révèle une nouvelle, elle est remontée et discutée avant d'être codée — **jamais
décidée en chemin.** »* « À évaluer » a été fait : l'évaluation conclut que ça n'entre pas ici.

Également hors périmètre, consignés sans être touchés :
- Le scellement depuis la grille (question ouverte depuis la 36.9 — voir §Questions)
- La pastille `.seance-dot` de la Semaine, devenue doublon (36.13)
- La divergence de vocabulaire « Soirée » / « Soir »
- Le contraste de `--jdr-text-muted` en Médiéval Steampunk (~4,4:1) — c'est la **palette**, épic 35
- Le budget de bundle dépassé (~1,42 Mo contre 1,00 Mo), pré-existant

⚠️ **La vue Semaine ne rend pas les formes que la légende va décrire.** Observation n°16 de la 36.13 : la
cellule de Semaine *nomme* l'événement mais ne le *marque* pas — ni liseré de vote ni filet de séance. La
légende décrira donc fidèlement le Mois et le rail, et partiellement la Semaine. Livrer les formes en
Semaine est une autre story ; ne pas raboter la légende pour cette raison.

### Pièges — la liste courte, tous payés au moins une fois dans cet épic

1. **Un nouvel `input()`/`output()` rendu obligatoire.** Payé **quatre stories de suite** (36.9 n°18,
   36.10 n°11, 36.11 n°20, 36.12 n°21). `calendar-layer-toggle` porte déjà **trois `input.required`** :
   tout ajout doit avoir un défaut.
2. **Mettre la Destinée ou « Ajouter des dates » dans le panneau.** AC12, et un test existant l'interdit
   déjà pour la bande (`calendar-view.spec.ts:2285`).
3. **Toucher `allCalendarEntries()`** au lieu de filtrer à l'affichage — casse le rail, le Mois et la
   Semaine (36.11, pièges n°3 et n°4). AC20.
4. **Restreindre `isOverridden()` à `availableLayerKeys()`** — la pastille apparaîtrait à tort pour tout
   compte portant `inscriptions-ouvertes`. AC17.
5. **Poser une clé de ton dans un seul thème** — `undefined` rendu dans les deux autres, et aucun test de
   composant ne tourne hors du thème par défaut (36.9 n°12, répété en 36.10, 36.11, 36.12).
6. **Coder un libellé en dur.** Relevé en revue deux fois : `'sans date'` (36.11), `"Replier"/"Déplier"`
   (36.12).
7. **Coder une couleur en dur** au lieu de `var(--jdr-status-*)` — patch n°1 de la revue de la 36.1.
8. **Croire que `--jdr-accent-1` vaut `--color-available`.** Faux hors du Grimoire : en Atelier Cuivré,
   `accent-1` est un bronze (36.2, piège n°3).
9. **Supprimer les tests qui cassent au lieu de les réécrire** (36.3, piège n°10 ; 36.2 l'avait déjà
   documenté).
10. **Un `aria-label` de parent écrase le contenu** — `.band` porte le sien, ce qui rendrait inaudible le
    `role="img"` d'un composant instancié dedans (36.8, note n°6). La légende instancie `.band` : vérifier
    que ses pastilles ne sont pas annoncées, et que le libellé textuel porte seul le sens.
11. **Rendre un contrôle désactivé au lieu de ne pas le rendre** — règle du projet contre les affordances
    qui ne mènent nulle part (36.1 AC11, 36.9 AC10, 36.11 AC12, 36.12 n°3).
12. **jsdom n'évalue ni les container queries ni les media queries** — il répond `matches: false` à tout.
    Le `BreakpointObserver` du spec est mocké **desktop par défaut** ; ne pas le défaire, 9 tests étaient
    tombés d'un coup en 36.11.
13. **Ordre de cascade CSS à spécificité égale** — la 36.13 a livré un bogue critique où une règle
    inconditionnelle déclarée **après** un bloc `@container` l'annulait à toute largeur.
14. **Écrire en base de développement** pour se fabriquer un état — muter le signal client via `window.ng`
    (36.11 n°19, 36.12 n°22).
15. **`_bmad-output/` est gitignoré** — `git diff HEAD` ne peut par construction jamais montrer ses
    modifications. Ne pas le relever comme anomalie (faux positif déjà tranché en revue de la 36.12).

### Project Structure Notes

Fichiers **créés** :
```
apps/web/src/app/features/calendar/calendar-session-layers.service.ts   (+ .spec.ts)
apps/web/src/app/features/calendar/calendar-display-panel/              (.ts .html .scss .spec.ts)
apps/web/src/app/features/calendar/calendar-legend/                     (.ts .html .scss .spec.ts)
```

Fichiers **modifiés** :
```
apps/web/src/app/features/calendar/calendar-view/calendar-view.{ts,html,scss,spec.ts}
apps/web/src/app/features/calendar/calendar-layer-toggle/calendar-layer-toggle.{html,spec.ts}
apps/web/src/app/features/account/account.{ts,html,spec.ts}
apps/web/src/app/core/theme/tones.ts
apps/web/src/app/core/theme/theme-tone.service.spec.ts
```

Fichiers **interdits** : tout `apps/api/`, tout `packages/shared/`, toute migration, `apps/web/src/styles.scss`.

Conventions : composants **standalone**, contrôle de flux `@if`/`@for`, **signals** (pas de `Subject`),
`*.spec.ts` à côté du source, libellés via `theme.tone()`.

### Testing

- **Runner** : Vitest 4 via `@angular/build:unit-test`, jsdom. `docker compose exec web pnpm test`
- **Lint** : `docker compose exec web pnpm lint` — objectif **lint = baseline exactement (142)**, pas
  « lint diminué »
- **Pas de `pnpm typecheck` côté web** : le script n'existe pas ; c'est la compilation du bundle par
  `ng test` qui joue ce rôle
- **Tout par Docker** — jamais un outil Node sur l'hôte
- **Zoneless** : boucle de ticks établie du projet
  (`for (let i=0;i<10;i++){ await Promise.resolve(); fixture.detectChanges(); }`) — `whenStable()` seul ne
  suffit pas ; ne pas en inventer une autre
- **Logique testable hors du composant** en `*.utils.ts` avec spec pure sans TestBed — patron
  `poll-track.utils.ts` → `agenda-badge.utils.ts` → `group-availability.utils.ts`
- **Assertions de non-régression structurelle** : compteur sur le mock HTTP pour prouver « zéro appel
  réseau » (AC15) ; `git status` pour prouver la portée (AC21)
- **Baseline à reconfirmer** (HEAD `acbd2e7`, tree propre) : web **111 fichiers / 2117 tests**, **lint 142**
- **Vérification visuelle réelle obligatoire** via Chrome MCP — c'est elle, et non les tests, qui a trouvé
  les défauts des six dernières stories de cet épic

### References

- [Source: _bmad-output/planning-artifacts/epics.md:2491-2545] — les onze AC verbatim
- [Source: _bmad-output/planning-artifacts/epics.md:1911, :1930] — carte FR-54/FR-55 → 36.14, portée « Front »
- [Source: _bmad-output/planning-artifacts/epics.md:335] — `/security-review` non optionnel sur l'épic
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:348-351] — FR-54, la légende et sa règle de partage
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:353-357] — FR-55, intentions et mémoire de session
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:49, :51, :57] — P-1 (jamais la couleur seule), P-2, P-5
- [Source: prds/prd-jdr-master-2026-08-01/prd.md:305] — « la clé reste, l'interrupteur part »
- [Source: prds/prd-jdr-master-2026-08-01/addendum.md:83] — retirer la clé imposerait une migration
- [Source: architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md:65-69] — AD-1, préférences de compte
- [Source: …/ARCHITECTURE-SPINE.md:169-175] — AD-16, `UserCalendarLayer` et `calendarLayersSetAt`
- [Source: …/ARCHITECTURE-SPINE.md:146-152] — AD-13, `localStorage` réservé au thème
- [Source: …/ARCHITECTURE-SPINE.md:154-161] — AD-14, état personnel : rafraîchissement local, aucune émission SSE
- [Source: …/ARCHITECTURE-SPINE.md:252] — jamais la couleur seule, en convention transverse
- [Source: ux-designs/ux-jdr-master-2026-08-04/mockups/contrat-ui-calendrier.html:65-66, :242-246, :362-368] — la barre cible
- [Source: …/contrat-ui-calendrier.html:596-613] — le panneau « Affichage », contenu et libellés
- [Source: …/contrat-ui-calendrier.html:60-64, :277-278] — la pastille de résumé, « 3 sur 4 » / « 3 sur 5 »
- [Source: …/contrat-ui-calendrier.html:654-665] — la légende, deux groupes et sept entrées
- [Source: …/contrat-ui-calendrier.html:677-695] — l'écran de compte et les annotations 33 à 36
- [Source: …/contrat-ui-calendrier.html:269, :406, :669-671] — annotations 1, 13, 30, 31, 32
- [Source: ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md:189-203] — §4.2 bis, la barre repliée
- [Source: …/EXPERIENCE.md:221, :229, :233-238] — la scission volontaire, les intentions, la mémoire de session
- [Source: …/EXPERIENCE.md:384-394] — la règle de partage de la légende et son rangement
- [Source: ux-designs/ux-jdr-master-2026-08-04/DESIGN.md:300] — un composant, deux présentations
- [Source: …/DESIGN.md:388-390] — la légende, pastille fidèle, l'écran lisible sans elle
- [Source: …/review-accessibility.md:197-205, :233] — la barre non couverte par la règle aria ; la pastille ne se masque jamais
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.html:14-65] — la barre actuelle
- [Source: …/calendar-view.ts:193, :224-227, :246-281, :1244-1247] — seuil desktop, `activeLayers`, défaut, écart, remise à zéro
- [Source: …/calendar-view.html:314-340 · calendar-view.ts:114-119] — le patron `cdkConnectedOverlay` de la 36.7
- [Source: …/calendar-view.scss:84-93] — le patron de feuille `ConstraintPanel`
- [Source: …/calendar-month-view.scss:196-290] — les traitements réels que la légende reproduit
- [Source: …/calendar-layer-toggle/calendar-layer-toggle.{ts,html,scss}] — le composant à envelopper, jamais à réécrire
- [Source: apps/web/src/app/features/account/account.html:78-90 · account.ts:47, :121-137] — les six cases et le patron d'écriture
- [Source: apps/web/src/app/core/theme/tones.ts:173, :302-308] — les clés existantes à réutiliser
- [Source: apps/web/src/app/core/theme/theme-tone.service.spec.ts:41-73, :76-83] — complétude des clés, garde de longueur
- [Source: apps/web/src/app/shared/list-control-bar/] — le patron de repli déjà en place dans le projet
- [Source: apps/web/src/app/layout/shell/shell.spec.ts:111, :114] — l'interdiction de `MatMenu`
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:66] — la dette nommément attribuée à cette story
- [Source: …/deferred-work.md:70] — le piège de périmètre serveur, écarté
- [Source: …/deferred-work.md:117] — la fuite de contexte au changement de paramètre de route
- [Source: …/36-11-la-vue-agenda-refondue.md] — le triple interdit sur `inscriptions-ouvertes`
- [Source: …/36-12-lagenda-du-mj-options-depliees-et-scellement.md] — la clé courte dédiée et sa garde de longueur
- [Source: …/36-13-la-grille-semaine-a-densite-variable.md] — container query, cascade CSS, contrat DOM du glissement
- [Source: …/36-9-le-mode-destinee-et-le-panneau-reduit-a-qui-manque.md] — la Destinée hors du panneau
- [Source: docs/security.md, docs/checklist.md] — `/security-review`, évaluation SSE

---

## Questions pour l'utilisateur

Aucune ne bloque l'implémentation ; toutes appellent une décision de sa part.

**Q1 — Le scellement depuis la grille : quatrième demande.** La question est posée depuis la 36.9, puis la
36.10, puis la 36.12 (*« la question vous est posée pour la troisième fois »*). Après cette story, le
calendrier aura **un** chemin de scellement (l'Agenda) et toujours **aucun depuis la grille**, alors que
`contrat-ui-calendrier.html:376` le dessine. **36.14 étant la dernière story de l'épic, c'est la dernière
occasion de trancher** : story dédiée, rattachement ici, ou abandon assumé.

**Q2 — `/security-review` : la dette est-elle ouverte ou soldée ?** Les artefacts se contredisent. La 36.8
déclare *« lancée et propre […] la dette ouverte depuis la 36.4 est refermée »*, et la 36.5 affirme
*« la story 36.4 est soldée (`/security-review` faite) »*. Mais 36.9, 36.11, 36.12 et 36.13 la redéclarent
toutes **ouverte**, et `sprint-status.yaml:1343` porte « ❌ /SECURITY-REVIEW TOUJOURS DÛ ». Deux traces
contre huit : je retiens **ouverte**, mais la contradiction mérite d'être tranchée avant la clôture de
l'épic. Cette story est front pure, sans donnée nouvelle ni endpoint : elle **n'aggrave pas** la dette et
ne la **solde pas**.

**Q3 — Divergences à répercuter par `bmad-ux` / `correct-course`.** Cette story en ajoute trois à la liste
déjà ouverte, toutes documentées ci-dessus : le filet du vote dans la planche contre le liseré livré
(⚠️ déjà arbitré par la 36.2, la planche n'a pas suivi) ; la trame de légende à 70 % contre 42 % réels ;
et les opacités de DESIGN.md (28 %) contre le code (32 %). Faut-il régénérer la planche, ou consigner
l'écart ?

**Q4 — La légende décrira des formes que la vue Semaine ne rend pas** (36.13, observation n°16). Livrer
les formes en Semaine relève d'une autre story. Confirmez-vous qu'on livre la légende complète malgré cet
écart temporaire ?

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story), 2026-08-23

### Debug Log References

- Baseline mesurée avant toute modification (Task 0), arbre propre, `HEAD = acbd2e7` :
  **111 fichiers / 2117 tests**, **lint 142**. Les deux chiffres annoncés par la story sont
  confirmés exactement.
- Livraison : **114 fichiers / 2184 tests** (+67), **lint 142 = baseline exactement**.
- `docker compose exec web pnpm test` · `docker compose exec web pnpm lint`

### Completion Notes List

**Portée tenue : front pur.** Aucun fichier de `apps/api/`, aucun de `packages/shared/`, aucune
migration, aucune dépendance nouvelle, aucun appel réseau nouveau (AC21, vérifié par `git status`).
Le piège de périmètre tendu par `deferred-work.md:70` — câbler la heatmap sur le temps réel — a été
**évalué et écarté** : c'est un chantier serveur exigeant une décision d'architecture, que P-5
interdit de décider en chemin.

**1. La mémoire de session n'emploie AUCUN stockage web, et c'est le cœur de la story.**
Le réflexe `sessionStorage` est faux : il **survit à un rechargement** dans le même onglet, alors
que l'AC10 exige qu'un rechargement reparte du défaut de compte — et jsdom ne rechargeant rien, le
défaut serait resté invisible à toute la suite. Une `Map` en mémoire dans un service racine
satisfait les quatre branches sans une ligne dédiée : rechargement = service reconstruit vide,
déconnexion = effet sur `currentUser`, autre calendrier = autre clé, « aucun mécanisme de
détection » = trivialement vrai. Un test verrouille l'absence de tout `Storage.setItem`.
**Décision d'implémentation, écart mineur assumé avec la story** : `clear()` est branché sur le
signal `currentUser` et non sur `AuthService.logout()` — un service de `features/` injecté dans un
service de `core/` aurait inversé la direction des dépendances, et `currentUser` retombe à `null`
sur TOUTE perte de session, pas seulement sur un clic.

**2. La légende ne redessine rien.** `_band-ranks.scss`, **premier partial SCSS du projet**,
devient la source unique des cinq traitements de rang : la vue Mois l'inclut, la légende aussi.
Motif : l'annotation 31 du contrat exige « exactement le traitement réel de la case », et TROIS
valeurs divergentes circulaient déjà pour la seule trame (42 % code, 70 % planche, 40 % DESIGN).
**Vérifié à la MESURE et pas à l'œil** : fond et filet sont identiques au bit près entre pastille
de légende et bande de grille pour les trois rangs présents à l'écran ; seule diffère la couleur
*héritée* d'une bordure de **0 px**, invisible par construction. La participation et le groupe
instancient les vrais `PollTrack` et `GroupGauge` — le trou des pastilles par membre (MJ ≤ 6) se
referme donc structurellement, le composant choisissant lui-même sa forme.

**3. DEUX DÉFAUTS RÉELS TROUVÉS À L'ÉCRAN, invisibles aux 2182 tests d'alors.**

- **La piste de légende passait SOUS son libellé.** `PollTrack` émet toujours son compteur et ma
  réponse ; sans classe d'hôte, ils débordaient de la pastille de 34 px. C'est le piège de la
  story 36.6 **au même endroit, deux stories plus tard** : la densité d'une surface se règle
  depuis `poll-track.scss`, jamais depuis le SCSS de l'appelant, que l'encapsulation de vue rend
  inopérant. Corrigé par `:host(.in-legend)`, plus un test de garde sur la classe.
- **LA MESURE QUI A CHANGÉ LA CONCEPTION : en contexte de partie, la barre ne fait que 380 px dans
  une fenêtre de 1725 px** — le panneau MJ prend la moitié de la largeur. Les trois libellés longs
  de la bascule pèsent 319 px à eux seuls : la barre repassait à **TROIS lignes**, c'est-à-dire
  exactement le défaut que cette story existe pour réparer. Une **container query** sur
  `.calendar-controls` (seuil 560 px) bascule sur la forme abrégée du contrat (« Mois / Sem. /
  Agenda »), les deux formulations restant toujours dans le DOM et le nom accessible gardant la
  forme longue à toutes les largeurs. C'est le raisonnement de la 36.13, retrouvé indépendamment
  par la mesure : une media query aurait menti. ⚠️ À distinguer de la bascule menu/feuille du
  panneau, qui emploie bien une media query (D-1) — elle gouverne un overlay ancré au viewport.

**4. Ce qui est vérifié à l'écran** (Chrome MCP, session de l'utilisateur, sans **aucune** écriture
en base) : la barre sur **une seule ligne, 42 px**, calendrier personnel, colonne 896 px, la grille
commençant en haut de page (AC1) ; le menu ancré et ses 4 couches en personnel / 5 en partie
(AC2) ; l'absence de pastille au défaut (AC3) ; la pastille « Affichage filtré · 3 sur 4 ·
Rétablir » puis « 4 sur 5 » en partie, et son clic qui rétablit (AC4) ; la légende, ses deux
groupes et ses 5 entrées en personnel / 7 en partie avec la vraie jauge (AC5, AC6, AC14) ; les
quatre intentions de l'écran de compte, aux libellés du contrat, sans « Les inscriptions
ouvertes » (AC7) ; `Échap` qui ferme et rend le focus (AC18).

**Contrastes mesurés dans les trois thèmes** — bouton « Affichage » **6,49 / 7,17 / 5,02**,
pastille de résumé **9,98 / 9,23 / 5,95** : tous au-dessus d'AA.

**5. ❌ NON VU À L'ÉCRAN, consigné.**

- **La feuille montant du bas (branche téléphone).** Confirmé sur place : `resize_window` change la
  fenêtre sans toucher `innerWidth`, qui reste figé à 1725, donc `matchMedia('(min-width:1024px)')`
  répond toujours `true` — la limite exacte que la story 36.11 avait consignée. Couverte par deux
  tests, **à confirmer sur un vrai téléphone**.
- **L'écriture d'une intention sur l'écran de compte** — cliquer aurait écrit en base de
  développement (piège n°14). Le chemin d'écriture est couvert par 12 tests, dont AC16 et D-3.

**6. ⚠️ ÉCART ASSUMÉ, mesuré : en contexte de partie MJ, la barre tient sur DEUX lignes (78 px).**
À 380 px de colonne, le déclencheur (99 px), « Ajouter des dates » (132 px, hérité de la 36.10) et
la bascule abrégée (217 px) totalisent 448 px. C'est strictement mieux qu'avant — trois lignes
avant la container query, deux lignes dès 1400 px avant la story — et le cas « au repos » du
contrat (personnel, joueur) tient bien sur une ligne. Réduire davantage supposerait de toucher
l'armement de composition, qui appartient à la story 36.10 et que le contrat place ailleurs.

**7. Dette consignée, non introduite par cette story.** Les textes de légende mesurent **4,36 en
Médiéval Steampunk**, sous AA. Cause racine déjà documentée (`deferred-work.md:36`) :
`--jdr-text-muted` y plafonne à ~4,4:1 sur sa propre surface, ce qui affecte **tout** texte muet de
ce thème. C'est la **palette** qu'il faut corriger (épic 35) ; diverger du contrat sur la couleur
de la légende pour masquer partiellement un défaut de palette aurait été pire que de le consigner.

**8. Tests réécrits, jamais supprimés** (piège n°9). Quatre ont changé de vérité et le disent en
commentaire : la non-persistance des couches de la 30.6 devient une persistance *de session* ; les
six cases techniques de la 30.4 deviennent quatre intentions ; le bouton « Rétablir » quitte le
bandeau pour le panneau ; la bascule de vues émet désormais deux formulations, donc le test
interroge le **nom accessible** plutôt que `textContent`.

**9. `/security-review`** — en dette depuis la 36.4 et **non optionnel sur cet épic**
(`epics.md:335`). Cette story est **front pure, sans donnée nouvelle ni endpoint** : elle
**n'aggrave pas** la dette et ne la **solde pas**. ⚠️ Les artefacts se contredisent sur son état
(la 36.5 et la 36.8 la disent soldée, cinq autres traces la disent ouverte) — question Q2 de la
story, à trancher avant la clôture de l'épic.

**10. Évaluation SSE faite** (checklist `docs/checklist.md`) : **aucun câblage nouveau**. Les
couches et la légende sont un état d'affichage strictement personnel ; AD-14 pose que l'état
personnel se rafraîchit localement et **n'émet aucun SSE**. Le calendrier hérite par ailleurs du
temps réel déjà en place.

### File List

**Créés**

- `apps/web/src/app/features/calendar/calendar-session-layers.service.ts`
- `apps/web/src/app/features/calendar/calendar-session-layers.service.spec.ts`
- `apps/web/src/app/features/calendar/_band-ranks.scss`
- `apps/web/src/app/features/calendar/calendar-display-panel/calendar-display-panel.ts`
- `apps/web/src/app/features/calendar/calendar-display-panel/calendar-display-panel.html`
- `apps/web/src/app/features/calendar/calendar-display-panel/calendar-display-panel.scss`
- `apps/web/src/app/features/calendar/calendar-display-panel/calendar-display-panel.spec.ts`
- `apps/web/src/app/features/calendar/calendar-legend/calendar-legend.ts`
- `apps/web/src/app/features/calendar/calendar-legend/calendar-legend.html`
- `apps/web/src/app/features/calendar/calendar-legend/calendar-legend.scss`
- `apps/web/src/app/features/calendar/calendar-legend/calendar-legend.spec.ts`

**Modifiés**

- `apps/web/src/app/core/theme/tones.ts`
- `apps/web/src/app/core/theme/theme-tone.service.spec.ts`
- `apps/web/src/app/features/account/account.ts`
- `apps/web/src/app/features/account/account.html`
- `apps/web/src/app/features/account/account.scss`
- `apps/web/src/app/features/account/account.spec.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.scss`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`
- `apps/web/src/app/features/calendar/calendar-layer-toggle/calendar-layer-toggle.ts`
- `apps/web/src/app/features/calendar/calendar-layer-toggle/calendar-layer-toggle.html`
- `apps/web/src/app/features/calendar/calendar-layer-toggle/calendar-layer-toggle.scss`
- `apps/web/src/app/features/calendar/calendar-layer-toggle/calendar-layer-toggle.spec.ts`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.scss`
- `apps/web/src/app/features/calendar/poll-track/poll-track.scss`

**Aucun fichier de `apps/api/`, de `packages/shared/`, ni aucune migration.**

## Change Log

| Date | Version | Description |
| --- | --- | --- |
| 2026-08-23 | 1.0 | Implémentation de la story 36.14 (bmad-dev-story), tâches 0 à 11. La barre de contrôles est repliée derrière « Affichage » et partage une ligne avec la bascule de vues ; le panneau présente les couches et l'interrupteur de légende (menu ancré / feuille du bas) ; une pastille de résumé signale et rétablit tout écart au défaut ; la légende, nouvelle, reproduit les traitements réels de la case sans en recopier une seule valeur ; l'écran de compte pose quatre intentions au lieu de six clés techniques ; les bascules de visite survivent à un retour sur le même calendrier dans la même session, via une mémoire en RAM et aucun stockage web. Front pur : 114 fichiers / 2184 tests, lint 142 = baseline. |
