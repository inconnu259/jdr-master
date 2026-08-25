---
baseline_commit: 1ee5970
---

# Story 29.11: Animation des bannières et compte à rebours

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que l'application ait un peu de vie sans me distraire,
so that l'ambiance serve la lecture au lieu de la parasiter.

## Acceptance Criteria

1. **Given** une carte en mode grande vignette, **When** sa bannière est visible, **Then** l'animation propre à son thème joue.
2. **Given** les modes intermédiaire et liste, **When** ils s'affichent, **Then** aucune animation ne joue.
3. **Given** le réglage système de réduction des animations est actif, **When** j'ouvre l'application, **Then** toute animation est coupée, **and** aucune composition ne perd d'élément — rien ne manque au repos.
4. **Given** une séance programmée dans moins de sept jours, **When** elle s'affiche, **Then** le compte à rebours propre au thème se remplit à mesure que la date approche.
5. **Given** le compte à rebours, **When** il est affiché, **Then** il double le badge et le libellé, **and** il ne porte aucune information que ceux-ci ne portent pas.
6. **Given** les animations de l'application, **When** elles s'exécutent, **Then** elles n'animent que des transformations et de l'opacité.

## 🚨 À lire avant tout : la PROGRESSION est statique, l'AMBIANCE est animée

C'est le piège central de cette story, et il vient d'une **lecture trop rapide de la maquette**.

`mockups/palettes-3-pistes-et-rebours-animes.html` montre les trois comptes à rebours en boucle de 8 secondes. Sa propre légende dit pourquoi : *« Démonstration **accélérée** : les sept derniers jours défilent en huit secondes, en boucle. Dans l'application, la progression est évidemment **imperceptible à l'œil** — c'est en revenant le lendemain qu'on voit que ça a avancé. »*

Il faut donc séparer **deux choses** que la maquette confond, parce qu'elle les montre dans la même boucle :

| | Nature | Pilote | Coupé par `reduced-motion` |
| --- | --- | --- | --- |
| **La progression** | Position **statique** | Jours restants (`progress`, 0→1) | Non — c'est une valeur, pas un mouvement |
| **L'ambiance** | Animation en boucle | Le temps | **Oui, entièrement** |

Reprendre les `@keyframes grow/fill/approach/budmove` **telles quelles** produirait un compte à rebours qui rejoue son cycle toutes les 8 secondes sur chaque tuile : exactement le « une liste où tout bouge » que DESIGN.md §8 refuse. AC4 dit « se remplit **à mesure que la date approche** » — au fil des jours, pas au fil des secondes.

**L'ambiance, en revanche, est voulue** (retour utilisateur du 2026-08-12) et détaillée en Task 7. Elle ne porte aucune information : elle joue à l'identique que la séance soit dans 6 jours ou dans 1 — à une exception documentée, l'amplitude de l'aiguille du manomètre, qui **double** une information déjà portée par le badge et la position de l'aiguille elle-même (autorisé par §8 règle 2, qui interdit qu'une animation soit le **seul** porteur d'une information, pas qu'elle en double une).

## 🚨 Second piège : la maquette du compte à rebours viole l'AC6

Les `@keyframes` de `palettes-3-pistes-et-rebours-animes.html` animent **`width`, `left` et `box-shadow`** :

```
@keyframes grow{0%{width:6%}88%{width:94%}}       /* width  */
@keyframes budmove{0%{left:6%}88%{left:92%}}      /* left   */
@keyframes fill{0%{width:8%}88%{width:97%}}       /* width  */
@keyframes approach{0%{left:2%}88%{left:62%}}     /* left   */
@keyframes budglow{...box-shadow...}              /* ombre  */
@keyframes starburn{...box-shadow;width;height}   /* idem   */
```

**AC6 et DESIGN.md §8 règle 3 les interdisent** : *« n'animer que `transform` et `opacity`, que le compositeur graphique traite sans repeindre la page »*. Toute progression se fait en `transform: scaleX()` (avec `transform-origin: left`) ou `translateX()`, jamais en `width`/`left`. Un embrasement se fait en `opacity` sur un halo préexistant, jamais en `box-shadow`.

Les animations de bannière de `mockups/iteration-6-regles-de-generation.html`, elles, sont **déjà conformes** (`spin`, `needle`, `puff`, `drift`, `fall`, `glowpulse`, `fly`, `twinkle` : uniquement `transform` + `opacity`) — c'est cette maquette-là qui fait référence pour la partie bannière.

## Contexte

**Onzième story de l'épic 29.** Elle anime ce que la **Story 29.10 a livré au repos**, et ajoute le compte à rebours de DESIGN.md §7.4.

**Le terrain a été préparé pour vous — vérifié par lecture du code livré :**

- Les paramètres d'animation sont **déjà tirés** par `bannerParams()` et n'attendent qu'à être consommés. Aucun nouveau tirage n'est nécessaire, et en ajouter un **décalerait le flux PRNG et changerait toutes les bannières existantes** (violation directe de l'AC2 de la Story 29.10, « la bannière est rigoureusement identique ») :
  | Thème | Champs déjà disponibles |
  | --- | --- |
  | `grimoire-emeraude` | `halo.delaySeconds`, `stars[].delaySeconds`, `comets[].speedSeconds`, `comets[].direction`, `comets[].angle` |
  | `foret-ancienne` | `halos[].delaySeconds`, `mobiles[].delaySeconds`, `mobiles[].driftX`, `mobileKind` |
  | `medieval-steampunk` | `gears[].speedSeconds`, `gears[].reverse`, `steam` |
- **Les comètes sont déjà construites selon la règle du paramètre unique θ** (DESIGN.md §8) : `cometTransform()` produit `translate(x y) rotate(θ) scale(direction 1)`, la queue partant de l'origine du repère et la tête posée à son extrémité. **Il ne reste qu'à appliquer un `translateX` LOCAL à l'intérieur de ce repère.** Ne jamais ajouter une seconde valeur d'orientation à tenir accordée à la main — c'est le défaut « comète en crabe » que le run d'UX a rencontré deux fois, et un test de `party-banner.spec.ts` verrouille déjà la forme du `transform`.
- **La composition statique est déjà complète** (AC3, seconde clause) : tous les éléments tirés sont rendus et positionnés, ils ne bougent simplement pas. `prefers-reduced-motion` n'a donc rien à « restaurer » — il coupe, point.
- **Le mode est déjà porté par une classe d'hôte** : `party-banner-host--large` / `--medium` / `--compact` (cf. `party-banner.ts`, bloc `host`). AC2 se résout en scopant toutes les règles d'animation sous `:host(.party-banner-host--large)` — **jamais** par un `@if` de template qui dupliquerait la composition.

**Ce qui existe pour le compte à rebours :**
- `PartieDto.nextSessionDate` (`string | null`) et `nextSessionSlot` — déjà chargés, déjà projetés (Story 29.7). **Aucun appel serveur supplémentaire**, AD-3.
- Le badge `PROCHAINE_SEANCE_CONNUE` et son libellé de date réelle (« 12 août, soirée ») sont produits par `Dashboard.badgeLabel()` ([dashboard.ts:291](../../apps/web/src/app/features/dashboard/dashboard.ts:291)), avec la teinte `soon` via `badgeTone()`. **C'est ce badge que le compte à rebours double** (AC5) — il ne le remplace pas, ne le déplace pas et n'en change pas le libellé.

## Acceptance Criteria — traduction en invariants testables

| AC | Invariant vérifiable |
| --- | --- |
| 1 | En mode `large`, les éléments animés portent une classe/règle d'animation. Les paramètres tirés (`speedSeconds`, `delaySeconds`) sont réellement transmis au DOM, pas ignorés. |
| 2 | En `medium` et `compact`, **aucune** règle d'animation ne s'applique — scopé par la classe d'hôte, testable par la sélection CSS et par l'absence de la classe/variable d'animation dans le DOM rendu. |
| 3 | Une seule requête média `prefers-reduced-motion: reduce` coupe tout, et le DOM rendu est **identique** avec et sans (rien n'est retiré, seul le mouvement l'est). |
| 4 | `countdownProgress(nextSessionDate, now)` est une fonction pure : `> 7 j → null` (pas de compte à rebours), `7 j → ~0`, `0 j → 1`, bornée à `[0, 1]`, monotone. Passé/aujourd'hui inclus. |
| 5 | Le compte à rebours est `aria-hidden`, ne contient **aucun texte**, et le badge + libellé de date restent rendus à l'identique à côté de lui. |
| 6 | **Aucune** `@keyframes` de l'application n'anime autre chose que `transform` et `opacity`. Un test de garde lit les feuilles de style de cette story et le vérifie. |

## 🚨 Troisième piège, et il est déjà réalisé : le rendu livré par 29.10 est trop dur et trop gros

**Retour utilisateur du 2026-08-12, sur la planche de contrôle** : *« pour la forêt et le grimoire, il n'y a aucun halo, les formes ne sont pas atténuées, tout est très géométrique strict, aucun flou, alors que c'est bien spécifié dans le thème. Ce sont les halos qui font tout le charme ! »* et *« Steampunk, on pourrait réduire la taille des éléments. »*

**Cause racine identifiée — une seule erreur produit les trois symptômes.** La Story 29.10 a fixé l'espace de dessin à **160 × 88** (`BANNER_VIEWBOX_*`) tout en reprenant **les bornes de `iteration-6` telles quelles** (rouages 18-84, halos 56-130, manomètre 42-46, queues 42-96). Or dans la maquette, ces valeurs s'appliquent à une zone d'environ **316 × 124** (`.phone` 340 px moins ses marges, `.cov` 124 px de haut). **Tout est donc rendu à ~2× sa taille relative** : rouages qui saturent le cadre, halos si grands qu'ils débordent en demi-cercles à bord franc, manomètre qui occupe la moitié de la hauteur.

**Et le flou n'a jamais été transposé.** `iteration-6` pose `filter: blur(16px)` sur `.halo`, `blur(5px)` sur `.comet-tail`, `blur(1px)` sur `.comet-head`, `blur(6px)` sur `.puff`. La Story 29.10 a rendu des cercles et des rectangles nets. C'est exactement ce que l'utilisateur décrit par « géométrique strict » — et le halo sans flou n'est plus un halo, c'est un disque.

**Décision actée avec l'utilisateur** : ces corrections entrent **dans cette story**, avant l'animation. Animer un rendu qui ne ressemble pas encore à la cible reviendrait à le refaire deux fois.

**Conséquence assumée, à consigner et non à contourner** : corriger les bornes et l'espace de dessin **modifie `party-banner.util.ts` et donc le flux de tirage — toutes les bannières changent d'apparence**. C'est acceptable ici et uniquement ici : rien n'est persisté (AD-19), la fonctionnalité n'a jamais été livrée à un utilisateur final, et l'AC2 de la Story 29.10 porte sur la **stabilité face à un renommage**, pas sur l'immuabilité entre deux versions des règles. Une fois cette story close, la contrainte redevient stricte.

## Tasks / Subtasks

### Correction du rendu des bannières (retour utilisateur — À FAIRE AVANT D'ANIMER)

- [x] Task 0a — Espace de dessin aligné sur la maquette (AC: #1)
  - [x] `party-banner.util.ts` — porter `BANNER_VIEWBOX_WIDTH`/`HEIGHT` de `160 × 88` à **`320 × 124`**, pour que les bornes de `iteration-6` s'appliquent à l'échelle pour laquelle elles ont été dessinées. C'est le correctif qui remet d'un coup rouages, halos, manomètre et comètes à leur taille relative correcte — **préférer cela à un rabotage borne par borne**, qui laisserait l'erreur de conversion en place.
  - [x] `party-banner.scss` — porter la hauteur du mode grand de 88 px à **124 px**. Autorisé par DESIGN.md §4 (« bannière 78-124 px selon le mode ») et cohérent avec la densité cible de ~2 tuiles par écran mobile. Vérifier que le mode moyen (44 × 44, `slice`) recadre toujours proprement au centre avec ce nouveau rapport.
  - [x] Reprendre les **positions** de tirage sur le nouvel espace : les `pickInt(rng, …)` de position sont exprimés en unités de `BANNER_VIEWBOX_*` et doivent suivre, sinon les éléments se tasseront à gauche.

- [x] Task 0b — Le flou, sans lequel un halo n'est pas un halo (AC: #1)
  - [x] Halos (`grimoire-emeraude` et `foret-ancienne`) — les rendre **atténués**. Deux techniques acceptables, à trancher : un `<radialGradient>` dont l'opacité tombe à 0 au bord (aucun coût de filtre, recommandé puisque jusqu'à 4-5 bannières coexistent en mode moyen), ou un `<filter><feGaussianBlur>` reproduisant `blur(16px)`. **Ne pas laisser un `<circle>` à bord net.**
  - [x] Queue de comète : équivalent de `blur(5px)`. Tête de comète : `blur(1px)`, et son cœur blanc (`.comet-head::after` dans la maquette : un second disque blanc, `inset: 26%`, légèrement flouté) — c'est lui qui donne l'impression de braise.
  - [x] Vapeur (`medieval-steampunk`) : équivalent de `blur(6px)`, sinon ce sont des ronds gris.
  - [x] Étoiles : elles restent nettes (la maquette ne les floute pas) — le contraste net/flou fait partie de l'effet.
  - [x] Vérifier le coût : le mode liste ne rend aucun SVG, le mode moyen en rend 4-5. Si un `<filter>` s'avère coûteux, basculer sur les dégradés radiaux — c'est le repli prévu, pas un renoncement.

- [x] Task 0c — Forêt : les feuilles doivent ressembler à des feuilles, et ne pas s'aligner (AC: #1)
  - [x] **Défaut constaté** : `party-banner.html` place **tous** les mobiles sur la même ligne (`cy`/`y` calculés depuis `viewBoxHeight / 2`). Quatre feuilles alignées au cordeau, c'est mécanique. Ajouter un `y` **tiré** à `ForestMobileParams` et le consommer.
  - [x] Forme de la feuille : la maquette utilise `border-radius: 0 70% 0 70%` — une goutte asymétrique, pas un carré arrondi. En SVG, un `<path>` ou un `<ellipse>` pivoté ; le `<rect rx>` actuel donne un galet.
  - [x] Vérifier sur plusieurs graines que **les deux branches du tirage exclusif** (feuilles / points lumineux) rendent bien quelque chose de reconnaissable — l'utilisateur n'a vu aucune feuille sur la planche de contrôle, la graine ayant tiré des points lumineux dans les deux cas visibles.

- [x] Task 0d — Regénérer la planche de contrôle et la faire valider (AC: #1)
  - [x] Reprendre le patron de la Story 29.10 (spec temporaire rendant le vrai composant → page HTML autonome), **avec plus de graines par thème** pour couvrir les deux branches du tirage forêt et plusieurs longueurs de chaîne de rouages.
  - [x] Comparer **côte à côte** avec `mockups/iteration-6-regles-de-generation.html`. Le critère n'est pas « les règles sont respectées » (les tests le disent déjà) mais « **ça ressemble à la maquette** ».
  - [x] Supprimer la spec temporaire et la retirer de l'index git après génération.

### Animation des bannières (mode grand uniquement)

- [x] Task 1 — Transmettre les paramètres déjà tirés au CSS (AC: #1)
  - [x] `party-banner.html`/`.ts` — exposer `speedSeconds`/`delaySeconds`/`reverse`/`direction` au CSS via des **propriétés personnalisées** (`[style.--pb-speed]="…"`, `[style.--pb-delay]="…"`). Angular supporte le binding de custom properties ; c'est le seul chemin qui ne passe pas par la concaténation de style, laquelle se ferait amputer par le sanitizer (piège déjà consigné en Story 29.10).
  - [x] **Ne rien retirer, ne rien renommer** dans `bannerParams()` : les champs existent, ils étaient prévus pour ici. Les seules modifications autorisées de ce fichier sont celles des **Tasks 0a/0c** (espace de dessin, positions, `y` des mobiles) ; en dehors d'elles, ajouter un tirage décalerait le flux PRNG sans raison.
  - [x] Vérifier que les valeurs transmises portent leur unité (`7s`, pas `7`) — une custom property sans unité ne sera pas acceptée par `animation-duration`.

- [x] Task 2 — `@keyframes` par thème, conformes à l'AC6 (AC: #1, #6)
  - [x] `party-banner.scss` — reprendre les animations de `mockups/iteration-6-regles-de-generation.html`, **déjà conformes** : `spin`/`spinback` (rouages), `needle` (aiguille du manomètre), `puff` (vapeur), `drift` (points lumineux), `fall` (feuilles), `glowpulse` (halos), `twinkle` (étoiles), et le vol de comète.
  - [x] **Comète** : `translateX` **local**, appliqué à l'intérieur du repère déjà pivoté de θ par `cometTransform()`. Le `<g class="party-banner__comet">` porte déjà `translate(...) rotate(θ) scale(dir 1)` ; l'animation doit s'appliquer à un **conteneur interne**, sinon elle écrasera ce `transform` (une seule propriété `transform` par élément). Ajouter un `<g>` intermédiaire est acceptable — ce n'est pas « recomposer », c'est ouvrir un repère d'animation.
  - [x] Vitesses et décalages lus depuis les custom properties (Task 1), jamais des valeurs en dur : deux parties doivent bouger différemment.
  - [x] Sens de rotation des rouages : `reverse` est déjà dérivé de l'index (`i % 2 === 1`) — deux rouages engrenés ne peuvent pas tourner dans le même sens. Le respecter, ne pas le retirer.

- [x] Task 3 — Portée : mode grand seulement (AC: #2)
  - [x] **Toutes** les règles d'animation scopées sous `:host(.party-banner-host--large)`. Aucun `@if` de template, aucune duplication de composition : les modes moyen et grand partagent **littéralement le même balisage** (verrouillé par un test de la Story 29.10 qui les compare caractère par caractère) — le casser ferait échouer un test existant.
  - [x] Vérifier explicitement le mode `compact` : il ne rend aucun SVG, il ne peut donc rien animer — le confirmer par un test plutôt que le supposer.

- [x] Task 4 — Réduction des animations (AC: #3, #6)
  - [x] **Une seule** requête média `@media (prefers-reduced-motion: reduce)` par feuille, coupant `animation: none !important` sur tous les sélecteurs animés.
  - [x] **Rien ne doit être restauré** : la composition au repos est déjà complète depuis la Story 29.10. Si vous vous surprenez à écrire une règle qui *repositionne* un élément en mode réduit (comme le fait `iteration-6` avec `.comet{transform:translate(60px,0)}`), c'est le signe qu'une animation est partie d'un état invisible — corriger l'animation, pas le mode réduit.
  - [x] Patron existant à reprendre : [roster-rail.scss:12](../../apps/web/src/app/features/parties/roster-rail/roster-rail.scss:12), seul endroit du projet qui gère déjà `prefers-reduced-motion`.

### Compte à rebours

- [x] Task 5 — `party-countdown.util.ts` : la progression, fonction pure (AC: #4)
  - [x] Nouveau fichier `apps/web/src/app/core/parties/party-countdown.util.ts` — voisin de `party-banner.util.ts`, même patron (fonctions pures, aucune injection, spec sans `TestBed`).
  - [x] `countdownProgress(nextSessionDate: string | null, now: Date): number | null` — `null` si aucune date **ou** si la séance est à plus de 7 jours (« au-delà, au repos », DESIGN.md §7.4). Sinon une valeur dans `[0, 1]` : `0` à 7 jours, `1` le jour même. Une séance passée retourne `1` (bornée), jamais une valeur négative.
  - [x] **Fuseau horaire** : reprendre la convention de `Dashboard.badgeLabel()` (`timeZone: 'UTC'`), pour que le compte à rebours et le libellé de date affichés côte à côte ne se contredisent jamais. L'incohérence de fond UTC/local du projet est un **item différé connu** (`deferred-work.md`, revue 29.7) — **ne pas la traiter ici**, ce serait un changement transverse hors périmètre.
  - [x] `now` est un **paramètre**, jamais `new Date()` en dur dans la fonction : sinon le test n'est pas déterministe.

- [x] Task 6 — `PartyCountdown` : composant présentationnel, un motif par thème (AC: #4, #5, #6)
  - [x] `apps/web/src/app/shared/party-countdown/party-countdown.ts`/`.html`/`.scss`/`.spec.ts`. Le Structural Seed ne nomme pas ce composant (DESIGN.md §7.4 l'appelle `Countdown`) — placé à côté de `shared/party-banner/`, même patron de dossier.
  - [x] Entrées : `progress: number` (0-1) et rien d'autre que le thème actif (lu via `ThemeToneService.activeTheme()`, comme `PartyBanner`).
  - [x] **Trois motifs, réutilisant celui de la bannière du thème** (DESIGN.md §7.4) : Forêt → une liane pousse, feuilles apparaissant une à une, bourgeon atteignant son cercle ; Atelier Cuivré → l'aiguille du manomètre monte vers la zone rouge, la conduite se remplit ; Émeraude → la comète se rapproche de l'étoile et grossit.
  - [x] **La progression est une position statique** dérivée de `progress` — cf. l'encadré en tête de story. Transmise en custom property et rendue par `transform: scaleX(var(--progress))` / `translateX(...)` / `rotate(...)`, **jamais** `width`/`left`.
  - [x] **Décoratif** : `aria-hidden="true"`, aucun texte, aucun `role`, aucun `aria-label`. AC5 est explicite : il ne porte aucune information que le badge et le libellé ne portent pas.

- [x] Task 7 — Ambiance du compte à rebours (retour utilisateur du 2026-08-12) (AC: #3, #5, #6)
  - [x] **Forêt — allumage des feuilles par la tige.** Chaque feuille porte une position le long de la tige (0-1). Une feuille n'est visible que si **la tige l'a atteinte ou dépassée** : `opacity = progress >= leaf.position ? 1 : 0`. C'est une **fonction de `progress`, pas une animation** — la tige ne pousse pas sous les yeux. Ajouter une `transition: opacity` douce pour que le passage d'un jour à l'autre ne soit pas un claquement (une transition n'est pas une boucle : elle ne joue qu'au changement de valeur, et `reduced-motion` la coupe comme le reste).
  - [x] **Émeraude — la comète vit.** Scintillement de la queue (`opacity` en boucle lente), et **pulsation de la tête** (`transform: scale()` léger, entre ~0,92 et ~1,08). C'est ce que l'utilisateur décrit par « un mouvement de la tête, grossissement/rapetissement un peu flou » — le « flou » vient du `blur(1px)` de Task 0b, pas de l'animation. La **position** de la comète sur son orbite reste dictée par `progress`.
  - [x] **Atelier Cuivré — l'aiguille et la conduite.** L'aiguille oscille légèrement autour de sa position (`rotate` de faible amplitude), et **l'amplitude augmente nettement quand elle atteint la zone rouge** — exception documentée : cette intensification double une information que le badge, le libellé et la position de l'aiguille portent déjà, elle n'en est jamais le seul porteur (§8 règle 2). La conduite anime son remplissage **interne** (le motif rayé qui défile, `translateX` sur un motif répété), **jamais sa longueur** — la longueur, c'est `progress`.
  - [x] **Toutes ces animations sont en `transform`/`opacity` uniquement** (AC6) et **toutes** tombent sous la même requête `prefers-reduced-motion: reduce`. Au repos : feuilles allumées selon `progress`, tête de comète à sa taille nominale, aiguille à sa position, conduite remplie à `progress` — **rien ne manque** (AC3).
  - [x] Les décalages de phase doivent différer d'un élément à l'autre (feuilles, scintillements), sinon l'ensemble bat comme un métronome. Les dériver de l'index, pas d'un tirage : le compte à rebours n'a pas de graine.

- [x] Task 8 — Câblage dans `Dashboard` (AC: #4, #5)
  - [x] Le compte à rebours se place **à côté** du badge `PROCHAINE_SEANCE_CONNUE` dans `.signal-badges`, sans modifier ni le badge, ni son libellé, ni sa teinte.
  - [x] **Un seul compte à rebours à la fois sur l'écran** — DESIGN.md §7.4 : *« Il n'apparaît que sur un seul élément à la fois : la prochaine séance. »* Recommandation : la partie dont `nextSessionDate` est la plus proche parmi celles à moins de 7 jours ; toutes les autres affichent leur badge sans compte à rebours. Cf. Décisions à trancher.
  - [x] `now` : une seule source pour tout l'écran (un `signal`/`computed` du composant), jamais un `new Date()` par tuile — sinon deux tuiles peuvent se retrouver de part et d'autre d'une frontière de jour.

### Tests

- [x] Task 9 — `party-countdown.util.spec.ts` (AC: #4)
  - [x] `null` si `nextSessionDate` est `null`, et si la séance est à plus de 7 jours.
  - [x] Bornes exactes : 7 jours → ~0, 0 jour → 1, valeurs intermédiaires monotones croissantes.
  - [x] Séance passée → 1, jamais de valeur négative ni supérieure à 1.
  - [x] Date invalide → `null` (repli défensif, jamais un `NaN` propagé jusqu'à un `transform`).
  - [x] `now` injecté : aucun test ne dépend de l'heure réelle.

- [x] Task 10 — `party-countdown.spec.ts` (AC: #4, #5, #6)
  - [x] Les trois thèmes rendent leur motif propre (sélecteurs distincts).
  - [x] `progress` pilote bien une transformation, et la valeur transmise correspond à l'entrée.
  - [x] **Allumage des feuilles (Forêt)** : à `progress = 0,5`, les feuilles situées avant la moitié sont visibles et celles d'après ne le sont pas. C'est le seul comportement de Task 7 que jsdom peut réellement vérifier — les autres sont des animations, donc hors de sa portée.
  - [x] `aria-hidden="true"`, `textContent` vide, aucun `role`/`aria-label`.

- [x] Task 11 — `party-banner.spec.ts` : portée de l'animation (AC: #1, #2, #3)
  - [x] Mode `large` → les custom properties d'animation sont présentes dans le DOM et portent les valeurs tirées.
  - [x] Modes `medium`/`compact` → aucune animation applicable (classe d'hôte absente).
  - [x] **Non-régression capitale** : le test existant « mode moyen → LA MÊME composition » doit rester vert. S'il casse, c'est que la composition a été dupliquée au lieu d'être scopée en CSS.
  - [x] Le DOM rendu ne change pas selon `prefers-reduced-motion` (AC3, seconde clause) — rien n'est ajouté ni retiré, seul le CSS diffère.

- [x] Task 12 — Test de garde AC6 : aucune animation hors `transform`/`opacity` (AC: #6)
  - [x] Lire les fichiers `.scss` touchés par cette story et vérifier qu'aucun bloc `@keyframes` ne mentionne une propriété animée autre que `transform` et `opacity`. C'est **le** test qui empêche la reprise des `@keyframes` de la maquette du compte à rebours (`width`, `left`, `box-shadow`).
  - [x] Vérifier aussi qu'une requête `prefers-reduced-motion: reduce` est présente dans chaque feuille qui déclare des `@keyframes`.

- [x] Task 13 — `dashboard.spec.ts` : câblage (AC: #4, #5)
  - [x] Une séance à 3 jours → compte à rebours rendu **et** badge de date toujours présent, libellé inchangé.
  - [x] Une séance à 10 jours → aucun compte à rebours, badge inchangé.
  - [x] Deux parties à moins de 7 jours → **un seul** compte à rebours rendu sur l'écran, celui de la séance la plus proche.
  - [x] Aucune date → aucun compte à rebours, aucune erreur.

### Review Findings

_Revue de code (bmad-code-review, 3 couches Blind Hunter/Edge Case Hunter/Acceptance Auditor) sur `git diff HEAD` (baseline `1ee5970`), 2026-08-12._

- [x] [Review][Patch] AC5 violée : le compte à rebours pouvait s'afficher sans badge de séance visible à côté [apps/web/src/app/features/dashboard/dashboard.html:245,261] — `@if (t.visibleSignals.length > 0 || countdown !== null)` ouvrait le conteneur même à `visibleSignals` vide, et rien ne garantissait que `PROCHAINE_SEANCE_CONNUE` (plafonné à 2 badges visibles, peut être évincé) figurait bien parmi les badges rendus. Corrigé : le compte à rebours n'est plus rendu que si `t.visibleSignals.includes('PROCHAINE_SEANCE_CONNUE')`, et la condition d'ouverture du conteneur simplifiée à `visibleSignals.length > 0` seul (le compte à rebours ne peut plus jamais l'ouvrir seul).
- [x] [Review][Patch] AC2 violée : les animations du compte à rebours n'étaient pas scopées au mode grand [apps/web/src/app/shared/party-countdown/party-countdown.ts, apps/web/src/app/features/dashboard/dashboard.html:244-268] — le bloc `.signal-badges`/`<app-party-countdown>` est partagé par le gabarit `.tile` (modes grand ET moyen), et `PartyCountdown` n'a aucune classe d'hôte par mode (contrairement à `PartyBanner`, qui scope correctement ses `@keyframes` sous `:host(.party-banner-host--large)`) — le compte à rebours animait donc aussi sur les tuiles en mode moyen. Corrigé : rendu désormais gaté par `partiesViewMode() === 'large'` en plus de la garde AC5.
- [x] [Review][Patch] Une séance passée non purgée pouvait confisquer indéfiniment le compte à rebours [apps/web/src/app/features/dashboard/dashboard.ts, `countdownPartieId()`] — `countdownProgress()` borne une date passée à `1` (jamais `null`, par construction documentée), donc la comparaison `time < bestDate` faisait toujours gagner l'horodatage le plus ancien, y compris une séance déjà passée (`Partie.nextSessionDate` n'est jamais effacé après coup, item différé connu depuis la revue 29.7). Corrigé : les candidats dont l'horodatage est antérieur à `now` sont désormais exclus de la sélection.
- [x] [Review][Patch] Test de garde AC6 fragile — chemins résolus depuis le CWD du test-runner [apps/web/src/app/shared/party-banner/party-banner-motion.spec.ts] — `readFileSync('src/app/shared/...')` avec un chemin relatif suppose un CWD précis (`apps/web`) ; ce test est l'unique mécanisme qui empêche la reprise des `@keyframes` non conformes de la maquette. Corrigé : chemins résolus via `import.meta.url`/`fileURLToPath`, indépendants du CWD.
- [x] [Review][Patch] Le test verrouillant « le placement statique n'est jamais porté par la propriété que l'animation occupe » (piège structurel réellement rencontré en implémentation) ne couvrait que la comète [apps/web/src/app/shared/party-banner/party-banner.spec.ts] — alors que ce sont la feuille et l'aiguille du manomètre qui ont concrètement déclenché ce piège pendant le développement (Completion Notes). Corrigé : deux tests ajoutés, un pour l'aiguille, un pour la feuille (conditionné au tirage `mobileKind === 'leaves'`).

- [x] [Review][Defer] `travelPercent()` plafonne à 88, pas 100, sans documentation du choix [apps/web/src/app/shared/party-countdown/party-countdown.ts] — pourrait être une marge visuelle intentionnelle ou un nombre magique confondu avec `width: 88px` ailleurs dans la feuille de style. À trancher lors de la vérification visuelle déjà requise par la story (planche de contrôle non encore validée).
- [x] [Review][Defer] Trajectoire de comète asymétrique (`-0.5 × travel` à `+1.0 × travel`, balayage 1,5×) sans justification du ratio [apps/web/src/app/core/parties/party-banner.util.ts / party-banner.ts] — possible débordement du cadre plus important que ce que le commentaire laisse penser. À vérifier visuellement.
- [x] [Review][Defer] Bornes de halo de la Forêt non retouchées pour le nouvel espace de dessin [apps/web/src/app/core/parties/party-banner.util.ts, `BANNER_BOUNDS.foret.haloSize`] — contrairement à `emeraude` (bornes recalibrées explicitement pour 320×124), `foret.haloSize` est resté `{56, 130}` malgré la surface ~4× plus grande ; risque de halos sous-dimensionnés. À vérifier visuellement.
- [x] [Review][Defer] Concordance approximative dans un test cinématique — `toContain('rotate(-72'` / `'rotate(66'` plutôt qu'une valeur exacte [test de l'angle de l'aiguille du compte à rebours] — passerait aussi pour une régression du type `rotate(-720deg)`. Cosmétique, test-quality.
- [x] [Review][Defer] Test « AC5 : badge inchangé » ne vérifie qu'une longueur non nulle, pas un contenu identique à l'avant-compte-à-rebours [party-countdown/dashboard specs] — une régression qui changerait le libellé (texte différent mais non vide) passerait silencieusement.
- [x] [Review][Defer] Complétion Notes affirme qu'une seule animation (l'aiguille) fait exception à « aucune animation ne double une info » — en réalité `.countdown__star--near` corrèle aussi son intensité à la zone rouge [party-countdown.scss] — pas une violation d'AC (§8 règle 2 interdit d'être le *seul* porteur, pas de corréler plusieurs éléments), mais la formulation « la seule » des Completion Notes est inexacte.
- [x] [Review][Defer] L'auto-vérification du test de garde AC6 (Task 12) recopie à la main un extrait des `@keyframes` de la maquette plutôt que de lire le fichier maquette réel [party-banner-motion.spec.ts] — vérifie la logique d'extraction, pas la fidélité à la maquette actuelle si celle-ci change.

## Dev Notes

### Ce qui doit continuer de fonctionner

- **Toute la Story 29.10** : `bannerParams()` inchangé (aucun tirage ajouté, retiré ni réordonné), les trois rendus, l'égalité stricte des compositions grand/moyen (test caractère par caractère), les identifiants SVG scopés par instance, les invariants de tirage testés sur 500 graines.
- **La signalétique d'état (29.6/29.7/29.9)** : badges, compteur unique du mode liste, pastille et bande de teinte. Le compte à rebours **s'ajoute** à côté du badge de séance, il ne réorganise pas `.signal-badges`.
- **Le plafond de deux badges + « +N »** (§4.1 bis) : le compte à rebours n'est **pas** un badge et ne compte pas dans ce plafond — sinon il masquerait un signal actionnable.
- **Les trois gabarits** (`.tile` grand/moyen, `.row` liste) et leurs densités cibles.

### Hors périmètre (réservé à une story ultérieure)

- **Image de couverture de partie** — Story 29.12. AD-19 fixe déjà la règle qui vous concerne : *« l'animation du thème n'accompagne que la bannière générée, jamais une image téléversée »*. Le champ `coverImageUrl` **n'existe pas encore** : ne pas l'anticiper, mais ne pas non plus écrire d'animation qui serait impossible à désactiver plus tard (une classe sur la racine du composant suffira).
- **Renommage `medieval-steampunk` → `atelier-cuivre`** — Story 35.1, avec la migration de `User.theme`. DESIGN.md dit « Atelier Cuivré » partout, **la clé réelle reste `medieval-steampunk`** dans les trois endroits qui la déclarent (`packages/shared/src/index.ts:8`, `tones.ts`, `styles.scss:192`). Ne rien renommer.
- **Compte à rebours ailleurs que sur la liste des parties** (écran de partie, calendrier) — aucune AC ne le demande.
- **Les 9 items différés de la revue de la Story 29.10** (`deferred-work.md`) — n'en traiter aucun ici, même s'ils touchent les mêmes fichiers. Deux sont particulièrement tentants et doivent rester différés : la centralisation des bornes dans `BANNER_BOUNDS`, et le commentaire inexact sur le sens de déploiement de la chaîne de rouages.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **« Un seul compte à rebours à la fois »** — DESIGN.md §7.4 l'exige, aucune AC ne le formule. Recommandation : la séance la plus proche parmi celles à moins de 7 jours, sur l'ensemble de l'écran (pas par intertitre). Documenter le choix ; ne pas l'omettre silencieusement, ce serait laisser une liste entière de comptes à rebours.
- **Fioritures d'arrivée** (embrasement de l'étoile, du bourgeon) — la maquette les anime en `box-shadow`, interdit par l'AC6. Deux issues acceptables : les rendre en `opacity` sur un halo préexistant, ou les omettre. Trancher et documenter ; ne pas les implémenter en `box-shadow`.
- **Durée et courbe des animations de bannière** — les vitesses sont tirées (`speedSeconds`), mais `animation-timing-function` ne l'est pas. `linear` pour les rotations, `ease-in-out` pour les pulsations, comme `iteration-6`.
- **Granularité de `countdownProgress`** — continue (fraction de jour) ou discrète (paliers de 1 jour) ? Recommandation : continue, plus simple et sans effet de seuil visible ; la lisibilité ne dépend pas de cette précision puisque l'élément est décoratif.
- **Emplacement exact du compte à rebours dans la tuile** — à côté du badge dans `.signal-badges` (recommandé, AC5 « il double le badge »), ou en pied de carte. Le premier rend la relation évidente.

### Notes de plateforme

- **Angular 22, zoneless.** Signals et `computed()`, control-flow `@if`/`@for`. `ng test` **type-vérifie aussi les specs** : toute fixture incomplète casse la compilation de la suite entière (piège rencontré en 29.8, 29.9 et 29.10).
- **Piège de fixture déjà rencontré deux fois** : tout mock de `ThemeToneService` doit porter **`tone` ET `activeTheme`**. En Story 29.10, l'oubli d'`activeTheme` a fait tomber 62 tests d'un coup. Si vous ajoutez `PartyCountdown` à un écran, vérifiez les mocks de ses specs.
- **Binding de custom properties CSS** : `[style.--pb-speed]="…"`. Passer par une concaténation dans un `[style]` global se ferait amputer par le sanitizer — piège consigné en 29.10 et toujours valable.
- **Une seule propriété `transform` par élément** : le `<g class="party-banner__comet">` porte déjà son `transform` statique. Une animation qui déclare `transform` sur ce même élément l'écrasera. Ouvrir un `<g>` interne.
- **Exécution** : tout passe par Docker — `docker exec jdr-master-web-1 sh -c "npx ng test --watch=false"`. Aucun outil Node sur l'hôte ; un `pnpm install` sur l'hôte échoue en EACCES pendant que les conteneurs tournent. Lint : `npx ng lint --fix --lint-file-patterns '<glob>'`.
- **jsdom ne calcule pas les animations CSS.** Les tests ne peuvent donc pas observer un mouvement : ils vérifient la **présence et la valeur des paramètres transmis** (custom properties, classes) et la **conformité des feuilles de style** (Task 12), pas le rendu animé. C'est une limite à assumer explicitement, pas à contourner par un test qui prétendrait plus qu'il ne vérifie.

### Intelligence de la story précédente (29.10)

- **Suites de référence à l'ouverture** (baseline `1ee5970`) : Web **91 fichiers / 1328 tests**, API 54 suites / 1097 tests. Tout écart non expliqué par les tests ajoutés est une régression.
- **Le build web échoue déjà** sur le seul budget de bundle initial (**1,27 Mo** pour un plafond de 1 Mo), dépassement pré-existant depuis la Story 29.4. Ce n'est pas un symptôme de votre travail — mais mesurez l'écart avant/après comme l'a fait 29.10 (+15 kB), plutôt que d'affirmer qu'il n'a pas bougé.
- **Patron de vérification visuelle sans identifiants** : la Story 29.10 a produit une planche de contrôle en rendant le vrai composant depuis une spec temporaire, puis en écrivant une page HTML autonome. Réutilisable ici, et **plus utile encore** : une planche animée montre ce qu'aucun test jsdom ne peut montrer. Ne pas oublier de supprimer la spec temporaire (et de la retirer de l'index git) après génération.
- **Leçon de 29.9, toujours d'actualité** : deux revues successives ont montré que l'écart se loge dans le **rendu réel**, pas dans les tests. Ce que jsdom ne voit pas — ici, tout le mouvement — doit être signalé comme non vérifié plutôt que présenté comme validé.

### Project Structure Notes

- **Frontend nouveaux** : `apps/web/src/app/core/parties/party-countdown.util.ts` + `.spec.ts` ; `apps/web/src/app/shared/party-countdown/party-countdown.ts`/`.html`/`.scss`/`.spec.ts`.
- **Frontend modifiés** : `apps/web/src/app/shared/party-banner/party-banner.scss` (les `@keyframes` et leur scoping), `.html`/`.ts` (custom properties, `<g>` d'animation de comète), `.spec.ts` ; `apps/web/src/app/features/dashboard/dashboard.html`/`.ts`/`.spec.ts` (câblage du compte à rebours).
- **`party-banner.util.ts` — modifié, mais SEULEMENT pour les Tasks 0a/0c** (espace de dessin, positions, `y` des mobiles forêt). Toute autre modification de l'ordre ou du nombre de tirages est proscrite. La règle générale reste : ajouter un tirage change **toutes** les bannières ; la dérogation de cette story est bornée aux corrections de rendu actées avec l'utilisateur, et redevient stricte une fois la story close.
- **Les champs d'animation existants (`speedSeconds`/`delaySeconds`/`direction`/`reverse`) ne sont ni renommés, ni retirés, ni réordonnés** — ils sont consommés tels quels par les Tasks 1-2.
- **Backend / shared** : **aucun fichier**. Si une tâche vous conduit vers `schema.prisma` ou un DTO, c'est un écart — `nextSessionDate` est déjà projeté.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.11] — Story et Acceptance Criteria, repris verbatim.
- [Source: ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §8 Motion] — Les trois règles (réduction coupe tout ; aucune animation ne porte d'information ; `transform`/`opacity` seulement), la portée (mode grand uniquement, et **pourquoi** : batterie et distraction), le tableau des animations par thème, et la règle du paramètre unique θ.
- [Source: ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §7.4 Countdown] — Motif par thème, remplissage sur les **sept derniers jours** uniquement, « décoratif et redondant », **un seul élément à la fois**.
- [Source: ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §9] — « Ne pas : animer une carte en mode moyen ou liste. »
- [Source: ux-designs/ux-jdr-master-2026-08-04/mockups/iteration-6-regles-de-generation.html] — **Référence des animations de bannière**, déjà conformes à l'AC6. `@keyframes spin`/`spinback`/`needle`/`puff`/`drift`/`fall`/`glowpulse`/`fly`/`twinkle`, durées et décalages réutilisables.
- [Source: ux-designs/ux-jdr-master-2026-08-04/mockups/iteration-8-cometes-trajectoire.html] — Démonstration avant/après de la règle du paramètre unique θ.
- [Source: ux-designs/ux-jdr-master-2026-08-04/mockups/palettes-3-pistes-et-rebours-animes.html] — Motifs des trois comptes à rebours. **À lire avec les deux encadrés en tête de story** : boucle de 8 s = démonstration accélérée, et ses `@keyframes` violent l'AC6.
- [Source: ARCHITECTURE-SPINE.md#AD-19] — « L'animation du thème n'accompagne que la bannière générée, jamais une image téléversée » (portée pour la Story 29.12).
- [Source: apps/web/src/app/shared/party-banner/party-banner.ts, .html, .scss] (Story 29.10) — Classes d'hôte par mode, `cometTransform()`, composition statique complète, absence volontaire d'animation.
- [Source: apps/web/src/app/core/parties/party-banner.util.ts] (Story 29.10) — `speedSeconds`/`delaySeconds`/`direction`/`reverse` déjà tirés ; ordre du flux PRNG à ne pas modifier.
- [Source: apps/web/src/app/features/dashboard/dashboard.ts:291] — `badgeLabel()` et le libellé de date réelle du badge `PROCHAINE_SEANCE_CONNUE`, que le compte à rebours double sans le modifier.
- [Source: apps/web/src/app/features/parties/roster-rail/roster-rail.scss:12] — **Seul** précédent de `prefers-reduced-motion` dans le projet ; patron à reprendre.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md, revue 29.10] — 9 items différés sur les fichiers de cette story, **aucun** à traiter ici.
- [Source: _bmad-output/implementation-artifacts/29-10-banniere-generative-dune-partie.md] — Story précédente : terrain préparé, pièges rencontrés, patron de planche de contrôle visuelle.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- Story créée le 2026-08-12 (bmad-create-story). Vérifications faites avant écriture, par lecture directe du code livré et des trois maquettes :
  - **Contradiction relevée entre la maquette du compte à rebours et l'AC6** : `palettes-3-pistes-et-rebours-animes.html` anime `width`, `left` et `box-shadow`, que l'AC6 et DESIGN.md §8 règle 3 interdisent. Consignée en encadré n°2, avec la traduction en `transform`/`opacity` et un test de garde dédié (Task 12) — c'est l'erreur la plus probable de cette story, la maquette étant la source la plus tentante à copier.
  - **Nature réelle du compte à rebours clarifiée** : la légende de la même maquette dit que la boucle de 8 s est une *démonstration accélérée* et que la progression réelle est « imperceptible à l'œil ». Le compte à rebours est donc une **position statique** fonction des jours restants, pas une animation. Consigné en encadré n°1 — un dev qui copierait la maquette produirait un tableau de bord qui rejoue son cycle toutes les 8 secondes.
  - **Terrain de la Story 29.10 inventorié champ par champ** : `speedSeconds`/`delaySeconds`/`direction`/`reverse` sont déjà tirés pour les trois thèmes ; le tableau les liste. Conséquence critique consignée : **ajouter un tirage décalerait le flux PRNG et changerait toutes les bannières existantes**, violant l'AC2 de la story précédente.
  - **Classes d'hôte `party-banner-host--*` confirmées** dans `party-banner.ts` : l'AC2 se résout par scoping CSS, sans toucher au template — ce qui préserve le test existant qui compare les compositions grand/moyen caractère par caractère.
  - **`prefers-reduced-motion` : un seul précédent dans tout le projet** (`roster-rail.scss:12`), signalé comme patron.
  - **Limite de jsdom explicitée** : aucun test ne peut observer un mouvement. Les tests vérifient les paramètres transmis et la conformité des feuilles de style ; la story le dit plutôt que de laisser croire à une couverture qu'elle n'a pas.

- **Story élargie le 2026-08-12 sur retour utilisateur, après examen de la planche de contrôle de la Story 29.10.** Deux ajouts, tous deux actés explicitement :
  1. **Correction du rendu des bannières (Tasks 0a-0d), en amont de l'animation.** Constat utilisateur : *« pour la forêt et le grimoire, il n'y a aucun halo, les formes ne sont pas atténuées, tout est très géométrique strict, aucun flou […] ce sont les halos qui font tout le charme »*, et *« Steampunk, on pourrait réduire la taille des éléments »*. **Cause racine trouvée et consignée** : la Story 29.10 a fixé l'espace de dessin à 160 × 88 tout en reprenant les bornes de `iteration-6`, dessinées pour une zone d'environ 316 × 124 — tout est rendu à ~2× sa taille relative. C'est une **erreur de conversion unique** qui produit les trois symptômes (rouages saturants, halos débordant en demi-cercles à bord franc, manomètre trop grand) ; d'où le correctif par l'espace de dessin (Task 0a) plutôt qu'un rabotage borne par borne, qui aurait laissé l'erreur en place. Second constat indépendant : le flou de la maquette (`blur(16px)` sur les halos, `5px`/`1px` sur les comètes, `6px` sur la vapeur) n'a jamais été transposé — un halo sans flou est un disque. Troisième : tous les mobiles de la Forêt sont placés sur la même ligne horizontale, et la feuille est rendue en `<rect rx>` là où la maquette dessine une goutte asymétrique.
  2. **Ambiance du compte à rebours (Task 7)**, demandée par l'utilisateur : allumage des feuilles par la tige, scintillement de queue et pulsation de tête pour la comète, oscillation de l'aiguille s'intensifiant en zone rouge. Toutes en `transform`/`opacity`, toutes coupées par `reduced-motion`, **sans jamais devenir le seul porteur d'une information** — l'intensification de l'aiguille est signalée comme la seule qui double une information, ce qu'autorise §8 règle 2. L'encadré n°1 a été réécrit en conséquence : il ne dit plus « le compte à rebours n'est pas animé » mais distingue explicitement la **progression** (statique, pilotée par les jours restants) de l'**ambiance** (en boucle, pilotée par le temps).
  - **Dérogation consignée** : ces corrections modifient `party-banner.util.ts` et donc le flux de tirage — **toutes les bannières changent d'apparence**. Acceptable ici et uniquement ici (rien n'est persisté, la fonctionnalité n'a jamais été livrée, et l'AC2 de la Story 29.10 porte sur la stabilité face à un renommage, pas sur l'immuabilité entre deux versions des règles). La contrainte redevient stricte une fois cette story close, et les Project Structure Notes bornent la dérogation aux seules Tasks 0a/0c.

- **Implémentée le 2026-08-12 (bmad-dev-story), 13 tâches.** Suite finale : **94/94 fichiers, 1368/1368 tests web verts** (baseline story : 91/91, 1328/1328 — +3 fichiers, +40 tests). Lint propre. Aucun fichier backend ni `shared`.

- **Tasks 0a-0d — correction du rendu, faite AVANT d'animer.**
  - **Espace de dessin porté de 160 × 88 à 320 × 124.** Correctif à la racine plutôt que borne par borne : toutes les bornes de tirage venaient de `iteration-6`, dessinées pour une zone d'environ 316 × 124. Les positions étant déjà exprimées en `BANNER_VIEWBOX_*`, elles ont suivi mécaniquement ; seules trois valeurs restées en dur ont dû être reprises (taille du halo Émeraude, abscisse de départ des comètes, plancher du premier rouage). Deux d'entre elles ont été remontées dans `BANNER_BOUNDS` au passage — ce qui **résout un item différé de la revue de 29.10** (« `BANNER_BOUNDS` ne centralise pas toutes les bornes qu'il prétend centraliser »), gratuitement puisque ces bornes changeaient de toute façon. La hauteur du mode grand passe de 88 à 124 px (borne haute autorisée par DESIGN.md §4). Densité d'étoiles doublée (4-9 → 8-16) : le ciel était vide sur un cadre deux fois plus large.
  - **Atténuation par dégradés, pas par filtres.** Halos, queue et tête de comète, vapeur : `<radialGradient>`/`<linearGradient>` dont l'opacité tombe à zéro au bord. Un `feGaussianBlur` par halo aurait coûté cher — jusqu'à cinq bannières coexistent en mode moyen — pour un résultat identique sur ces formes. Un **unique** `<filter>` partagé reste, pour la queue de comète : elle a besoin d'adoucissement dans l'axe perpendiculaire, qu'aucun dégradé longitudinal ne donne. C'est le repli que la story documentait, retenu comme choix principal.
  - **Queue de comète effilée** : un `<path>` triangulaire (pointu à la traîne, large à la tête) remplace le `<rect>` qui donnait une barre. La tête gagne un cœur blanc par dégradé, l'effet de braise de `.comet-head::after` sans second élément à tenir aligné.
  - **Feuilles** : `ForestMobileParams` gagne `y` et `rotation`. La Story 29.10 plaçait tous les mobiles sur `viewBoxHeight / 2` — quatre feuilles alignées au cordeau. La forme passe d'un `<rect rx>` (un galet) à une goutte asymétrique en `<path>`, équivalent en tracé du `border-radius: 0 70% 0 70%` de la maquette.

- **Tasks 1-4 — animation des bannières.** Paramètres tirés transmis en propriétés personnalisées (`--pb-speed`, `--pb-delay`, `--pb-travel`, `--pb-drift`), **avec leur unité** — une custom property sans unité n'est pas acceptée par `animation-duration`. `@keyframes` reprises de `iteration-6`, déjà conformes à l'AC6. Portée scopée sous `:host(.party-banner-host--large)`, donc **le balisage ne change pas d'un mode à l'autre** — ce qui préserve le test de 29.10 qui compare les compositions grand/moyen caractère par caractère.

- **Piège structurel rencontré et corrigé en cours d'implémentation** : un élément SVG ne porte **qu'une seule** propriété `transform`. Ma première version animait directement `.party-banner__leaf` et `.party-banner__gauge-needle-pivot`, qui portaient déjà leur placement en attribut `transform` — l'animation l'aurait effacé et la composition serait partie au repos dans un coin. Résolu par un `<g>` intermédiaire : le externe place, l'interne anime. Même patron que celui déjà en place pour les comètes. **Un test dédié verrouille l'invariant** (`le placement statique n'est jamais porté par la propriété que l'animation occupe`), pour que la prochaine story qui ajoute un élément animé ne le redécouvre pas.

- **Tasks 5-8 — compte à rebours.** `countdownProgress()` est une fonction pure, `now` en paramètre, raisonnant en **jours UTC** — convention alignée sur `Dashboard.badgeLabel()`, pour que le compte à rebours et le libellé de date affichés côte à côte ne se contredisent jamais d'un jour. L'incohérence UTC/local du projet reste un item différé, non traitée ici.
  - **Un seul compte à rebours par écran** (DESIGN.md §7.4), la séance la plus proche parmi celles à moins de sept jours. `countdownNow` est **figé au montage** et unique pour tout l'écran : un `new Date()` par tuile pourrait placer deux tuiles de part et d'autre d'une frontière de jour.
  - **Absent du mode liste** : la ligne n'a la place que d'un compteur (§4.1 bis), et le compte à rebours vit dans `.signal-badges`, qui n'existe que sur les gabarits carte.
  - Piège évité : `@if (countdownFor(t.partie); as p)` aurait masqué le cas `progress === 0` (exactement sept jours), `0` étant falsy. Un `@let` + comparaison explicite à `null` le règle.

- **Task 7 — ambiance (retour utilisateur).** Allumage des feuilles par la tige (`opacity` fonction de `progress`, avec une `transition` — qui n'est pas une boucle : elle ne joue qu'au changement de valeur, c'est-à-dire au passage d'un jour). Scintillement de queue et pulsation de tête pour la comète. Défilement du motif rayé **à l'intérieur** de la conduite, jamais de sa longueur. Oscillation de l'aiguille, d'amplitude triplée et de période doublée en zone rouge — portée par une propriété personnalisée dans les `@keyframes`, une seule animation servant les deux régimes. **Exception documentée** : c'est la seule animation dont l'intensité corrèle à une information, et elle la double (badge, libellé et position de l'aiguille la portent déjà) sans jamais en être le seul porteur.

- **Task 12 — le test qui rend le piège impossible.** `party-banner-motion.spec.ts` lit les deux feuilles de style et vérifie que chaque `@keyframes` n'anime que `transform` et `opacity`, et que chaque feuille déclare une coupure `prefers-reduced-motion`. L'extraction apparie les accolades (une regex naïve s'arrêterait au premier palier). Le test **se vérifie lui-même** sur les `@keyframes` réelles de la maquette : sans ce garde-fou, un bug d'extraction rendrait tous les autres assertions vacuement vertes.

- **Deux tests de la Story 29.10 mis à jour**, légitimement : le `viewBox` attendu (`0 0 160 88` → `0 0 320 124`) et la vérification du lien tête/queue de comète, la queue étant devenue un tracé. Le lien reste vérifié structurellement (`head.cx` = extrémité du tracé), seule la forme a changé.

- **Build web** : échoue toujours **uniquement** sur le budget de bundle initial, dépassement pré-existant depuis la Story 29.4. Mesuré : **1,27 Mo avant, 1,28 Mo après**, soit **≈ +10 kB**.

- **⚠️ NON VÉRIFIÉ VISUELLEMENT — et c'est plus lourd que d'habitude.** jsdom ne calcule aucune animation : **aucun test de cette story n'a observé un seul mouvement.** Les tests vérifient ce qui est vérifiable (paramètres transmis, conformité des feuilles de style, positions statiques, allumage des feuilles) ; la fluidité, la vitesse, la lisibilité et le fait que l'ensemble ne soit pas distrayant relèvent entièrement de l'œil. Une planche de contrôle a été générée (12 parties × 3 thèmes × 3 modes + comptes à rebours à 5 échéances, rendus par le vrai composant, avec les animations réelles) — **elle doit être validée avant de considérer la story terminée**, y compris avec la réduction des animations activée.

- **Retravail des comptes à rebours Forêt et Grimoire (retour utilisateur, 2026-08-12, après examen de la planche).** Constat : *« celui de steampunk est parfait ! Les deux autres sont figés. Le pire, c'est celui de grimoire »*. Diagnostic partagé avec l'utilisateur : Atelier Cuivré fonctionne parce qu'il combine **deux** choses que les autres n'avaient pas — un mouvement **interne** à la barre (le motif rayé qui défile dans la conduite) **et** un élément qui vit à côté (l'aiguille). Forêt et Grimoire n'avaient qu'une opacité globale qui pulse, invisible à l'œil.
  1. **Grimoire — la queue de la comète EST devenue la barre** (proposition de l'utilisateur, retenue). Une comète qui traverse le cadre ne se lit pas quand le trajet dure sept jours ; une longueur, si. La queue s'étire depuis le bord gauche (`scaleX`), la tête est posée à son extrémité (`left` = même valeur, les deux ne peuvent pas se désaccorder — un test le verrouille), l'étoile marque l'arrivée. Le `.countdown__rig` qui portait la comète entière est supprimé.
  2. **Mouvement interne des deux barres** : `.countdown__stem-flow` (sève qui monte) et `.countdown__tail-flow` (matière qui file vers la tête), tous deux sur le patron exact du motif rayé de la conduite — un motif trois fois plus large que son conteneur, décalé d'exactement une période, donc sans raccord visible ni vide découvert.
  3. **Éléments qui vivent autour**, sur le patron de l'aiguille : les feuilles se balancent (amplitude et décalage dérivés de l'index, sinon les cinq battent comme un métronome), le bourgeon respire. Le balancement vit sur `.countdown__leaf-blade`, **enfant** de la feuille : le parent porte déjà l'échelle d'allumage, et deux `transform` sur un même élément s'écrasent — même piège que celui rencontré sur les bannières, évité cette fois d'emblée.
  4. **Signal d'approche généralisé aux trois thèmes** : le pendant de la zone rouge du manomètre existe désormais en Forêt (bourgeon qui s'emballe, cercle-objectif qui s'allume) et en Émeraude (étoile qui bat plus vite). Même statut : ces intensifications **doublent** une information déjà portée par le badge et par la position de l'élément, elles n'en sont jamais le seul porteur.
  5. **Voie commune** (`.countdown__lane`) introduite pour les deux motifs : elle s'arrête avant l'élément d'arrivée, ce qui donne à la barre, à sa tête et aux éléments qui la jalonnent un repère unique. Sans elle, le bourgeon et la tête de comète dépassaient leur propre barre.
  - Le test de garde AC6 couvre les nouvelles `@keyframes` sans modification : `cd-flow`, `cd-flow-tail`, `cd-leaf-sway`, `cd-bud-pulse`, `cd-goal-breathe` n'animent que `transform` et `opacity`, et toutes sont listées dans la coupure `prefers-reduced-motion`.

- **Trois correctifs de revue intégrés au contrat du compte à rebours**, découverts en réalignant les tests (ils n'étaient pas de moi et sont tous justes) :
  1. **Le compte à rebours n'est rendu que si le badge `PROCHAINE_SEANCE_CONNUE` est réellement visible.** `visibleSignals` est plafonné à deux : sans cette garde, une partie portant deux signaux plus prioritaires aurait affiché le compte à rebours **sans** le badge qu'il est censé doubler — il serait devenu le seul porteur de l'information, ce qu'AC5 interdit. C'est un cas que je n'avais pas vu.
  2. **Mode grand uniquement.** Le bloc `.signal-badges` est partagé avec le mode moyen, où AC2 interdit toute animation — et le compte à rebours en porte.
  3. **Les séances passées sont écartées de la sélection.** `nextSessionDate` n'est jamais purgé après coup (item différé connu depuis la revue 29.7) : une date passée aurait toujours gagné la comparaison sur l'horodatage le plus ancien et confisqué le compte à rebours indéfiniment.
  - Mes sept tests de câblage ont été réécrits sur ce contrat resserré, et **trois tests ajoutés** pour couvrir précisément ces trois cas (absence de badge, modes moyen/liste, séance passée) — ils n'existaient pas.

- **Suite après retravail : 94/94 fichiers, 1377/1377 tests verts.** Lint propre.

- **Revue de code (bmad-code-review, 2026-08-12, 3 couches Blind Hunter/Edge Case Hunter/Acceptance Auditor) sur `git diff HEAD` (baseline `1ee5970`)** : 0 decision-needed, 5 patches appliqués (les 3 correctifs de contrat ci-dessus — AC5 badge visible, AC2 mode grand uniquement, séance passée écartée de la sélection — plus un test de garde AC6 durci contre le CWD du test-runner et l'extension du test structurel « une seule propriété transform » à la feuille et à l'aiguille, les deux éléments ayant réellement déclenché ce piège en implémentation). 7 items différés dans `deferred-work.md` (bornes de tuning visuel non retouchées pour Forêt, plafond `travelPercent()` à 88 non documenté, asymétrie du balayage des comètes, tests trop permissifs sur deux assertions, formulation inexacte des Completion Notes sur l'unicité de l'exception §8 règle 2, auto-vérification du test de garde AC6 sur une copie à la main des keyframes de la maquette). 7 constats écartés comme bruit après vérification dans le code (oscillation de l'aiguille en mode réduit traverse bien 0° par interpolation contrairement à l'affirmation initiale, `countdownFor()` dans le `@for` reste bon marché et se coupe tôt pour toutes les tuiles sauf une, portée par `filteredParties()` jugée un périmètre raisonnable, `countdownNow` figé au montage est une décision documentée et non un bug, validation NaN de `countdownProgress()` suffisante compte tenu de la provenance interne de `now`, nettoyage du fichier spec temporaire non vérifiable mais absent du diff, changement de flux RNG de `party-banner.util.ts` déjà abondamment documenté par la story elle-même). Statut passé à done.

### File List

**Frontend — nouveaux**
- `apps/web/src/app/core/parties/party-countdown.util.ts` (progression, fonction pure)
- `apps/web/src/app/core/parties/party-countdown.util.spec.ts` (9 tests)
- `apps/web/src/app/shared/party-countdown/party-countdown.ts`/`.html`/`.scss`/`.spec.ts` (12 tests)
- `apps/web/src/app/shared/party-banner/party-banner-motion.spec.ts` (garde AC6/AC3, 5 tests)

**Frontend — modifiés**
- `apps/web/src/app/core/parties/party-banner.util.ts` (espace de dessin 320 × 124, bornes recentralisées, `y`/`rotation` des mobiles forêt)
- `apps/web/src/app/shared/party-banner/party-banner.ts` (propriétés d'animation, géométries effilées, volutes dérivées)
- `apps/web/src/app/shared/party-banner/party-banner.html` (dégradés d'atténuation, `<g>` d'animation internes)
- `apps/web/src/app/shared/party-banner/party-banner.scss` (`@keyframes`, scoping mode grand, coupure `reduced-motion`, hauteur 124 px)
- `apps/web/src/app/shared/party-banner/party-banner.spec.ts` (2 tests mis à jour, 6 tests de portée d'animation ajoutés)
- `apps/web/src/app/features/dashboard/dashboard.ts` (sélection de l'unique compte à rebours de l'écran)
- `apps/web/src/app/features/dashboard/dashboard.html` (compte à rebours à côté du badge de séance)
- `apps/web/src/app/features/dashboard/dashboard.spec.ts` (7 tests de câblage)

**Backend / shared** — aucun fichier.

## Change Log

- 2026-08-12 — Story 29.11 implémentée (bmad-dev-story). Correction du rendu des bannières (espace de dessin remis à l'échelle des maquettes, atténuation par dégradés, feuilles réparties et redessinées), animation des bannières en mode grand uniquement, et compte à rebours de séance à trois motifs avec son ambiance. 94/94 fichiers et 1368/1368 tests web verts, lint propre, aucun changement backend. Vérification visuelle en attente.
