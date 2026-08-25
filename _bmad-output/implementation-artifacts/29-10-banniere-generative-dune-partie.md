---
baseline_commit: 6bd5a7c
---

# Story 29.10: Bannière générative d'une partie

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a utilisateur,
I want que chaque partie porte une identité visuelle stable,
so that je la reconnaisse d'un coup d'œil dans une liste.

## Acceptance Criteria

1. **Given** une partie, **When** sa bannière est rendue, **Then** elle est calculée à partir d'une graine dérivée du seul identifiant de la partie.
2. **Given** je renomme la partie, ou qu'un thème est renommé, **When** la bannière est rendue à nouveau, **Then** elle est rigoureusement identique.
3. **Given** n'importe quel mode d'affichage, **When** la bannière est rendue, **Then** le rendu passe par un point de dérivation unique, **and** deux écrans ne peuvent pas produire deux bannières différentes pour la même partie.
4. **Given** les trois modes d'affichage, **When** ils rendent la bannière, **Then** la grande carte porte la bannière pleine, le mode intermédiaire une vignette carrée, le mode liste une vignette atténuée surmontée du monogramme.
5. **Given** la base de données, **When** on l'inspecte, **Then** ni la graine, ni les paramètres tirés, ni le rendu n'y figurent.
6. **Given** chacun des trois thèmes, **When** une bannière est générée, **Then** elle respecte les règles de tirage de son thème, **and** aucun élément ne pénètre la zone d'exclusion du manomètre dans le thème Atelier Cuivré.

## Contexte

**Dixième story de l'épic 29** — CAP-20 du SPEC (« Identité visuelle d'une partie ») et FR-47 du PRD. Elle livre la moitié « générée » de l'identité visuelle ; la moitié « téléversée » (image de couverture) est la **Story 29.12**, et l'animation la **Story 29.11**.

**100 % frontend.** Le PRD le dit explicitement (`prd.md` §« Ne nécessitent aucun changement serveur ») : *« la bannière générée (FR-47 — calculée à l'affichage à partir de l'identifiant de la partie, rien n'est stocké) »*. Aucune migration Prisma, aucun champ DTO, aucun endpoint. `PartieDto.id` et `PartieDto.name` suffisent et existent déjà.

**Les emplacements ont été réservés par la Story 29.9 — cette story les remplit, elle ne restructure rien :**
- **Mode grand** : [dashboard.scss:30](../../apps/web/src/app/features/dashboard/dashboard.scss:30) porte un `.grid--large .tile::before` de 88 px, explicitement commenté « Emplacement de la bannière générative (Story 29.10) réservé dès maintenant […] 29.10 remplace le fond, pas la boîte ». **À remplacer par le vrai composant**, pas à empiler dessus.
- **Mode liste** : [dashboard.html:129](../../apps/web/src/app/features/dashboard/dashboard.html:129) commente l'emplacement laissé libre entre la pastille `.row__dot` et `.row__txt`. **La vignette 28 px + monogramme s'y insère.**
- **Mode moyen** : aucun emplacement n'existe encore — la vignette carrée 44 px est à **ajouter** dans l'en-tête de la tuile.

**Ce que la Story 29.9 a établi et qu'il ne faut pas casser :** trois gabarits distincts (`.tile` en grand/moyen, `.row` en liste), la teinte d'état `--tile-tint`/`.row__dot--*`, le compteur unique du mode liste, la troncature sur une ligne du nom et de la sous-ligne. La bannière **s'ajoute** à ces gabarits.

## Acceptance Criteria — traduction en invariants testables

| AC | Invariant vérifiable |
| --- | --- |
| 1, 2 | `bannerParams(id, theme)` ne lit jamais le nom de la partie. Deux appels avec le même `id` et le même `theme` sont profondément égaux. Changer le nom ne change rien. |
| 2 | Changer la **clé** de thème change le style, jamais le tirage : les valeurs tirées (positions, angles, comptes) sont identiques d'un thème à l'autre pour un même `id`. |
| 3 | Un seul module exporte la dérivation ; les trois modes l'appellent. Aucun composant ne recalcule une position, un angle ou un compte localement. |
| 5 | `git grep` sur le schéma Prisma : aucun champ `banner*`/`seed*` ajouté. Aucune migration créée. |
| 6 | Test de propriété sur ≥ 500 graines par thème : bornes respectées, tailles de rouages strictement décroissantes, zone d'exclusion jamais pénétrée (test sur boîtes englobantes). |

## Tasks / Subtasks

### Point de dérivation unique (AD-19)

- [x] Task 1 — `party-banner.util.ts` : la seule fonction qui traduit un identifiant en paramètres (AC: #1, #2, #3, #5)
  - [x] Créer `apps/web/src/app/core/parties/party-banner.util.ts` — **chemin imposé par le Structural Seed** (`ARCHITECTURE-SPINE.md` : `parties/party-banner.util.ts # POINT DE DÉRIVATION UNIQUE de la bannière (AD-19), rien de persisté`). Ne pas le placer dans `shared/` ni dans le composant.
  - [x] `bannerSeed(partieId: string): number` — hachage déterministe 32 bits. **Jamais `Math.random()`**, jamais `Date`, jamais `crypto.randomUUID()`. Proposé : FNV-1a 32 bits (implémentation de 6 lignes, à commenter). L'entrée est un **UUID v4** (`Partie.id`, `@default(uuid())` — vérifié dans `schema.prisma:58`) : 36 caractères dont beaucoup de tirets communs à tous, donc **hacher la chaîne entière**, jamais un préfixe ni `parseInt` d'un fragment.
  - [x] `makeRng(seed: number): () => number` — PRNG explicite et stable, retournant `[0,1)`. Proposé : mulberry32. Documenter le choix : le déterminisme de cette fonction est ce qui autorise le non-stockage (AD-19).
  - [x] `partyMonogram(name: string): string` — initiales des **deux premiers mots significatifs**, articles exclus, en capitales. Un seul mot significatif → ses deux premières lettres. Cas de référence (DESIGN.md §7.3) : « Les Cendres de Kavaan » → `CK`, « Le Convoi du Nord » → `CN`. **Seule fonction de ce fichier qui lit le nom** — le monogramme n'entre pas dans la graine, et la graine n'entre pas dans le monogramme.
  - [x] `bannerParams(partieId: string, theme: Theme): BannerParams` — union discriminée par thème, tous les tirages faits ici, aucune valeur tirée ailleurs.
  - [x] Aucun appel réseau, aucune injection Angular : fonctions pures, testables sans `TestBed` (même patron que `party-sort.ts`/`character-sort.ts`/`party-signal-priority.ts`).

- [x] Task 2 — Règles de tirage, thème par thème (AC: #6)
  - [x] **`grimoire-emeraude`** — ciel étoilé (densité tirée) + **un halo qui respire** + **1 à 3 comètes**. Chaque comète porte : angle θ, longueur, teinte (`--jdr-accent-1` vert ou `--jdr-accent-2` améthyste), sens de déplacement, et (pour 29.11) sa vitesse. Bornes lisibles dans la maquette `iteration-6` : queues 42-96 px, têtes 11-22 px, θ ≈ −22°..+2°, `iteration-7` ajoutant les sens droite→gauche et les angles descendants (+34°).
  - [x] **`foret-ancienne`** — **toujours** 2 halos pulsant en décalé (position et teinte vert/or tirées, diamètre 56-130 px, décalage 0-4 s) ; puis **tirage exclusif** : feuilles tombantes **OU** points lumineux ascendants, **jamais les deux**. 2 à 5 éléments mobiles, taille 3-11 px, dérive latérale ±26 px, décalage 0-6 s.
  - [x] **`medieval-steampunk`** — grille de plan technique **constante du thème, jamais tirée** (toute bannière la porte) ; **un manomètre toujours présent** (42-46 px, ancré dans l'un des deux coins hauts) ; **chaîne de N rouages engrenés, N tiré entre 2 et 6**, tailles **strictement décroissantes** (18-84 px), techniques tirées parmi **B / C / E uniquement — la technique D est rejetée** ; accessoires tirés : 0 à 3 rivets, vapeur présente ou non. **Le tuyau est retiré du répertoire** (ne pas le reprendre de `iteration-6`, qui le montre encore — `iteration-7` le corrige).
  - [x] **Contrainte dure de composition** : zone d'exclusion du manomètre = son cercle **+ 8 px de marge sur les quatre côtés**. Aucun rouage, rivet, ressort, bielle ni accessoire ne peut y être placé, **même partiellement** — le test porte sur les **boîtes englobantes**, pas sur les centres. Corollaire à implémenter explicitement : manomètre à gauche ⇒ chaîne à droite, et inversement.

### Composant de rendu

- [x] Task 3 — `PartyBanner` : composant présentationnel, trois rendus (AC: #3, #4)
  - [x] Créer `apps/web/src/app/shared/party-banner/party-banner.ts`/`.html`/`.scss`/`.spec.ts` — standalone, purement présentationnel, **aucune injection hors `ThemeToneService`**, aucun appel réseau.
  - [x] Entrées : `partieId` (requis), `partieName` (requis, pour le monogramme seul), `mode: ListViewMode` (`'large' | 'medium' | 'compact'`, union déjà déclarée dans `@master-jdr/shared` par la Story 29.9).
  - [x] Le composant appelle `bannerParams()` **une fois** dans un `computed()` et rend depuis ce résultat. Il ne tire rien lui-même.
  - [x] **Trois rendus, dimensions imposées par DESIGN.md §7.3** :
    - `large` : bannière complète, pleine largeur, **78-124 px de haut** (viser 88 px, la hauteur déjà réservée par 29.9), `border-radius` = `{radius.card}`.
    - `medium` : **vignette carrée 44 × 44 px**, la composition **recadrée au centre** (pas redessinée), `border-radius` 8 px.
    - `compact` : **vignette atténuée 28 × 28 px + monogramme par-dessus**, `border-radius` 6 px. **Rendu spécifique, jamais une bannière simplement réduite** — à 28 px seules la dominante colorée et le monogramme distinguent deux parties (§7.3, et §9 « ne pas : réduire une bannière complète en vignette de 28 px »).
  - [x] Décoratif : `aria-hidden="true"` sur la racine. Le nom de la partie est déjà porté en toutes lettres à côté dans les trois modes — la bannière n'ajoute aucune information. **Ne pas** ajouter de `role="img"` ni d'`aria-label`.
  - [x] Le thème est lu via `ThemeToneService.activeTheme()` (signal existant) — jamais via `document.body.className`, jamais via `localStorage`.

- [x] Task 4 — Câblage dans les trois modes de `Dashboard` (AC: #3, #4)
  - [x] **Mode grand** : remplacer le pseudo-élément `.grid--large .tile::before` de [dashboard.scss:30](../../apps/web/src/app/features/dashboard/dashboard.scss:30) par `<app-party-banner mode="large">` dans le gabarit `#tile` de `dashboard.html`. **Supprimer le placeholder et son commentaire**, ainsi que `--tile-tint` s'il ne sert plus qu'à lui (vérifier : il est aussi lu ailleurs ? sinon retirer les 4 déclarations avec le pseudo-élément — ne pas laisser du code mort).
  - [x] **Mode moyen** : insérer `<app-party-banner mode="medium">` dans l'en-tête de la tuile, à gauche du titre. Aucun emplacement n'existe — c'est le seul ajout structurel de cette story sur `dashboard.html`.
  - [x] **Mode liste** : insérer `<app-party-banner mode="compact">` dans le gabarit `.row`, **entre `.row__dot` et `.row__txt`** (emplacement commenté par la Story 29.9). Retirer le commentaire « emplacement laissé libre ».
  - [x] Vérifier que la densité cible de chaque mode tient toujours après l'ajout (§4.1 : ~2 / ~4-5 / ~12 éléments par écran mobile) — la vignette 28 px ne doit pas faire grandir la ligne au-delà de sa hauteur actuelle.

### Tests

- [x] Task 5 — `party-banner.util.spec.ts` : déterminisme et indépendance (AC: #1, #2, #3)
  - [x] Même `partieId` → paramètres profondément égaux, sur 100 appels consécutifs.
  - [x] Deux `partieId` différents → paramètres différents (au moins un champ diffère) sur un échantillon de 50 identifiants.
  - [x] **Le nom n'entre pas dans la graine** : `bannerParams(id, theme)` identique pour deux appels encadrant n'importe quel changement de nom (le nom n'est pas un paramètre de la fonction — le test le rend explicite et empêche une régression future qui l'ajouterait).
  - [x] **La clé de thème n'entre pas dans le tirage** : pour un même `id`, les valeurs tirées communes (comptes, positions normalisées, angles) sont identiques d'un thème à l'autre ; seul le style diffère.
  - [x] `partyMonogram()` : les deux cas de référence de DESIGN.md, un mot significatif unique, un nom entièrement composé d'articles, une chaîne vide, un nom accentué (capitales correctes).

- [x] Task 6 — `party-banner.util.spec.ts` : invariants de tirage, en test de propriété (AC: #6)
  - [x] **Sur ≥ 500 graines par thème** (identifiants générés déterministement dans le test, pas aléatoires) :
    - `medieval-steampunk` : `2 ≤ N ≤ 6` ; tailles de rouages **strictement décroissantes** ; techniques ∈ {B, C, E} et **jamais D** ; 0 ≤ rivets ≤ 3 ; manomètre 42-46 px dans un coin haut.
    - `medieval-steampunk` : **aucune boîte englobante d'élément ne coupe la zone d'exclusion** (cercle du manomètre + 8 px sur les 4 côtés). C'est le test qui porte l'AC6 — l'écrire en intersection de rectangles, jamais en distance entre centres.
    - `foret-ancienne` : exactement 2 halos ; **exclusivité** feuilles XOR points lumineux ; 2 ≤ éléments ≤ 5 ; bornes de taille/dérive/décalage respectées.
    - `grimoire-emeraude` : 1 ≤ comètes ≤ 3 ; chaque comète a un θ, une longueur, une teinte ∈ {accent-1, accent-2}, un sens.

- [x] Task 7 — `party-banner.spec.ts` : les trois rendus (AC: #4)
  - [x] `mode="large"` → élément de bannière pleine largeur présent, hauteur dans 78-124 px.
  - [x] `mode="medium"` → vignette 44 × 44, **aucun monogramme rendu**.
  - [x] `mode="compact"` → vignette 28 × 28 **et** monogramme rendu, texte = `partyMonogram(partieName)`.
  - [x] Racine `aria-hidden="true"` dans les trois modes.
  - [x] Changer `ThemeToneService.activeTheme()` change le style rendu mais **pas** le monogramme ni les comptes tirés.

- [x] Task 8 — `dashboard.spec.ts` : câblage, sans dupliquer les tests du composant (AC: #3, #4)
  - [x] Une `app-party-banner` par tuile en mode grand et moyen, une par ligne en mode liste.
  - [x] `mode` transmis correspond au `partiesViewMode()` courant.
  - [x] **Non-régression 29.9** : le placeholder `.grid--large .tile::before` a disparu ; `.row__dot`, `.row__count`, `.row__sub` et la troncature du nom sont intacts.

### Review Findings

_Revue de code (bmad-code-review, 3 couches Blind Hunter/Edge Case Hunter/Acceptance Auditor) sur `git diff HEAD` (baseline `6bd5a7c`), 2026-08-12._

- [x] [Review][Decision] Géométrie du sous-système rouages/manomètre — deux problèmes liés dans `apps/web/src/app/core/parties/party-banner.util.ts` : **(a)** les rivets étaient testés contre la zone d'exclusion comme un rectangle dont `{x, y}` est le **coin haut-gauche**, mais rendus comme un **cercle centré** sur `{x, y}` — décalage de 2px qui pouvait réintroduire jusqu'à la moitié du cercle dans la zone d'exclusion pour un rivet repoussé pile au bord (AC6). **(b)** `pushOutOfZone()` repoussait toujours un rouage en collision vers `y = zone.bas` sans jamais vérifier que la boîte repoussée reste dans `BANNER_VIEWBOX_HEIGHT` (88px) — un rouage de grande taille pouvait s'étendre hors du viewBox. **Décision utilisateur (2026-08-12) : corriger les deux.** Corrigé : `pushOutOfZone()` repousse désormais **horizontalement**, vers le côté opposé au manomètre (`corner`) — le canvas est bien plus large (160px) que la zone d'exclusion n'est large (~58-62px), donc ce repoussement reste dans les limites du canvas quelle que soit la taille de l'élément, contrairement au repoussement vertical (la zone touche toujours le haut du canvas, ne laissant que ~26-30px de marge en dessous). Rivets : convention de coordonnées unifiée sur le **centre** (cohérente avec le rendu en `<circle>`), la boîte testée est recentrée avant/après l'appel à `pushOutOfZone()`. Nouveau test de propriété ajouté (`party-banner.util.spec.ts`) verrouillant qu'aucun rouage/rivet repoussé ne disparaît entièrement du canvas sur 500 graines. Suite revérifiée : 91/91 fichiers, 1328/1328 tests verts (+1 nouveau test).

- [x] [Review][Patch] `fx` posé sur `<stop>` au lieu de `<radialGradient>` [apps/web/src/app/shared/party-banner/party-banner.html:21-28] — le tirage `backgroundFocus.x` n'avait aucun effet visuel (attribut SVG invalide à cet endroit, silencieusement ignoré par le navigateur), `backgroundFocus.y` n'était référencé nulle part. Corrigé : `[attr.fx]`/`[attr.fy]` déplacés sur `<radialGradient>`, exprimés en pourcentage (cohérent avec les bornes de tirage de `backgroundFocus`).

- [x] [Review][Defer] Commentaire du déploiement de la chaîne de rouages ne correspond pas à la formule [apps/web/src/app/core/parties/party-banner.util.ts:434-437] — pour `corner === 'right'`, les rouages tardifs (plus petits) dérivent vers le coin du manomètre plutôt que de s'en éloigner ; seul `pushOutOfZone()` (non documenté comme filet de sécurité) évite la collision. Deferred, rescue déjà en place et testé.
- [x] [Review][Defer] `BANNER_BOUNDS` ne centralise pas toutes les bornes qu'il prétend centraliser [apps/web/src/app/core/parties/party-banner.util.ts:337-343, 423] — taille/position du halo emeraude et plancher du premier rouage (60, en dur) contournent les constantes nommées. Deferred, cosmétique/maintenabilité.
- [x] [Review][Defer] `gaugeExclusionZone()` documenté « cercle + 8px » mais implémente un carré (boîte englobante du manomètre) [apps/web/src/app/core/parties/party-banner.util.ts:266-278] — plus conservateur qu'un vrai cercle, pas une violation, juste un décalage de commentaire. Deferred, cosmétique.
- [x] [Review][Defer] Champs d'animation non utilisés (`delaySeconds`/`speedSeconds`) tirés dès maintenant pour une story pas encore livrée (29.11) [apps/web/src/app/core/parties/party-banner.util.ts, plusieurs interfaces] — couple l'ordre de consommation du flux RNG de cette story à des besoins futurs non encore connus. Deferred, décision déjà justifiée dans les Dev Notes (Piège n°3).
- [x] [Review][Defer] Liste de mots exclus du monogramme non revue, présentée comme un choix arbitraire [apps/web/src/app/core/parties/party-banner.util.ts:96-114] — une partie nommée « Une Ombre » perd son mot le plus significatif. Deferred, déjà signalé comme décision ouverte par la story elle-même.
- [x] [Review][Defer] Non-chevauchement des comètes affirmé en commentaire mais jamais testé [apps/web/src/app/core/parties/party-banner.util.ts:363-364] — contrairement à la zone d'exclusion du manomètre (test de propriété dédié sur 500 graines). Deferred, risque visuel mineur.
- [x] [Review][Defer] Magic number `4` (taille du rivet) dupliqué sans constante partagée [apps/web/src/app/core/parties/party-banner.util.ts, party-banner.util.spec.ts] — contrairement à `GAUGE_EXCLUSION_MARGIN`, exportée exprès pour éviter la duplication. Deferred, cosmétique.
- [x] [Review][Defer] Le helper de test `svg.innerHTML.replace(/pb\d+/g, 'pbX')` neutralise toute sous-chaîne `pb`+chiffres, pas seulement les attributs d'id [apps/web/src/app/shared/party-banner/party-banner.spec.ts:43] — test uniquement, risque faible.
- [x] [Review][Defer] `bannerParams()` n'a aucune garde d'exécution si `theme` sort de l'union connue (préférence persistée périmée/corrompue) [apps/web/src/app/core/parties/party-banner.util.ts:489-496] — retournerait `undefined` malgré la signature. Deferred, même convention déjà acceptée ailleurs (valeurs validées `@IsIn` en amont).

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise complète

1. **La clé du troisième thème est `medieval-steampunk`, PAS `atelier-cuivre`.** DESIGN.md l'appelle « Atelier Cuivré » parce que le run d'UX a acté le renommage — **mais il n'est pas fait dans le code** : `THEMES` (`packages/shared/src/index.ts:8`) déclare `'medieval-steampunk'`, `THEME_NAMES` affiche « Médiéval Steampunk », `styles.scss:192` définit `.theme-medieval-steampunk`. Le renommage (AD-13/FR-43) emporte **la migration des valeurs persistées de `User.theme`** et est assigné à la **Story 35.1**. **Ne pas renommer quoi que ce soit dans cette story** — utiliser la clé existante et ne pas « corriger » au passage.
2. **Aucune animation.** C'est la Story 29.11. Mais DESIGN.md §8 règle 2 impose que *« au repos, la composition reste complète et lisible — rien ne manque »* : la composition statique livrée ici doit **déjà être complète**, de sorte que 29.11 n'ajoute que des `@keyframes`. Concrètement : les comètes, halos, rouages, vapeur et rivets sont **tous rendus** et positionnés ; ils ne bougent simplement pas encore.
3. **Construire les comètes selon la règle de §8 dès maintenant**, même sans animation : *« tout élément généré en mouvement dérive son orientation ET sa trajectoire d'un paramètre unique »* — un conteneur pivoté de θ, dans lequel 29.11 n'aura qu'à appliquer un `translateX` **local**. Cette règle a été extraite de **deux défauts successifs** du run d'UX (tête désalignée de sa queue, puis comète « en crabe »). Structurer autrement obligerait 29.11 à tout refaire. Démonstration avant/après : `mockups/iteration-8-cometes-trajectoire.html`.
4. **Rien n'est persisté (AD-19).** Pas de champ Prisma, pas de migration, pas de champ DTO, pas d'endpoint, pas de cache `localStorage`. Le déterminisme *est* le mécanisme de stabilité — ajouter du stockage « pour garantir la stabilité » crée une seconde source de vérité qui divergera à la première évolution des règles. Si l'implémentation semble avoir besoin de persister quelque chose, c'est que la dérivation n'est pas déterministe : corriger la dérivation, pas la persistance.
5. **Un seul point de dérivation, et il est déjà nommé par l'architecture** : `core/parties/party-banner.util.ts`. Le vrai risque d'AD-19 n'est pas le stockage, c'est **deux implémentations** produisant deux bannières pour la même partie selon l'écran. Aucun composant ne calcule une position, un angle, un compte ou une teinte : tout vient de `bannerParams()`.
6. **La graine dérive de l'identifiant SEUL** — ni le nom, ni la clé de thème. Sinon renommer une partie (ou renommer un thème en Story 35.1) changerait toutes les bannières et ruinerait le déterminisme dont dépend le non-stockage. Le thème sélectionne le **style** appliqué aux paramètres tirés ; il n'intervient **pas** dans le tirage. Le **monogramme**, lui, vient du nom — c'est voulu et sans contradiction : il n'est pas tiré, il est dérivé littéralement.
7. **`iteration-6` est la maquette de référence, mais `iteration-7` la corrige sur trois points** : le tuyau est retiré du répertoire, la grille technique devient une constante du thème (elle n'apparaît que sur certaines cartes dans `iteration-6`), et le sens de déplacement des comètes entre dans le tirage. En cas de divergence entre les deux, **`iteration-7` fait foi**, et DESIGN.md §7.3 par-dessus les deux.
8. **`.working/vignettes-generees.html` est périmé** (styles « Nébuleuse / Blason / Motif », explorés puis abandonnés au profit d'une personnalité graphique par thème). Ne pas s'en inspirer.

### Coût de rendu — la contrainte que le mode liste impose

Le mode liste affiche **~12 parties par écran mobile** et le mode moyen ~4-5 : la bannière est rendue **N fois**, pas une fois. Deux conséquences dures :

- **La composition complète (rouages SVG, étoiles, comètes) n'a sa place qu'en mode grand.** En moyen, c'est la même composition **recadrée** (`overflow: hidden`, donc même DOM) ; en liste, c'est un rendu **spécifique et pauvre** — un fond dégradé issu de la dominante colorée + le monogramme, **pas** la composition miniaturisée. C'est exactement ce que §7.3 demande, et c'est aussi ce qui rend la liste tenable.
- `bannerParams()` doit être appelée dans un `computed()` du composant, **jamais depuis le template** : un appel de fonction dans un binding se réévalue à chaque cycle de détection, ×12 lignes.

### Ce qui doit continuer de fonctionner

- **Les trois gabarits de la Story 29.9** : `.tile` (grand/moyen) et `.row` (liste) — la bannière s'y ajoute, elle ne les remplace pas. La bascule de gabarit `@if (partiesViewMode() === 'compact')` dans `dashboard.html` reste telle quelle.
- **La signalétique d'état (Stories 29.6/29.7/29.9)** : bande verticale `--tile-tint`/`border-left` sur les cartes, pastille `.row__dot` en liste, badges de signal, compteur unique. La bannière ne doit **jamais** masquer, recouvrir ni concurrencer la teinte d'état — DESIGN.md §7.2 en fait le vocabulaire d'état unique, quel que soit le mode.
- **La densité de chaque mode** (§4.1 : ~2 / ~4-5 / ~12 par écran mobile) — vérifiée en 29.9, à ne pas dégrader.
- **`ListControlBar`**, le tri, les filtres, les favoris, la recherche : aucun contact avec cette story.
- **`MyCharacters`/`CharacterSummaryCard`** : **hors périmètre**. La bannière est une identité de *partie*, pas de personnage ; l'avatar de personnage a déjà son propre mécanisme (`CharacterAvatar`, initiales + portrait).
- **Les cartes d'invitation reçue** en haut de `dashboard.html` (bloc `@if (received().length > 0)`) : ce sont aussi des `.tile` dans une `.grid`, **mais sans classe de densité et hors du gabarit `#tile`**. Elles ne reçoivent pas de bannière et ne doivent pas changer d'apparence. Vérifier qu'aucun sélecteur ajouté ne les atteint par ricochet.
- **Suites de référence à l'ouverture de la story** (baseline `6bd5a7c`) : Web **89 fichiers / 1273 tests**, API 54 suites / 1097 tests. Tout écart non expliqué par les tests ajoutés est une régression. Le build web échoue déjà sur le budget de bundle initial — dépassement pré-existant depuis la Story 29.4, **pas** un symptôme de cette story (mais surveiller qu'il n'empire pas : cette story ajoute du SVG inline).

### Hors périmètre (réservé à une story ultérieure)

- **Animation des bannières et compte à rebours** — Story 29.11 (`@keyframes`, `prefers-reduced-motion`, animation en mode grand uniquement).
- **Image de couverture de partie** — Story 29.12. AD-19 fixe déjà la priorité (*« si `Partie.coverImageUrl` est renseigné, l'image l'emporte dans tous les modes »*), mais le champ **n'existe pas encore** : ne pas l'ajouter, ne pas anticiper l'aiguillage. Concevoir simplement `PartyBanner` de façon qu'un futur `@if (coverImageUrl)` en amont puisse le court-circuiter sans le modifier.
- **Renommage `medieval-steampunk` → `atelier-cuivre`** — Story 35.1 (cf. piège n°1).
- **Bannière sur l'écran de détail d'une partie** — aucune AC de cette story ne la demande (les ACs parlent des trois **modes d'affichage** de la liste). À trancher au moment de 29.12/29.14 si besoin.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Fonction de hachage et PRNG** — FNV-1a 32 bits + mulberry32 proposés (courts, sans dépendance, déterministes). Toute autre paire explicite convient ; ce qui n'est **pas** négociable, c'est l'absence de `Math.random()` et le fait que le choix soit documenté dans le fichier.
- **Liste des mots non significatifs du monogramme** — proposée : `le, la, les, l', un, une, des, du, de, d', au, aux`. Aucune AC ne la fixe ; la documenter dans `party-banner.util.ts`.
- **Hauteur exacte de la bannière en mode grand** — 78-124 px autorisés par DESIGN.md §4 ; 88 px proposé (hauteur déjà réservée par 29.9, donc aucune régression de densité).
- **Technique de rendu** — SVG inline (`<defs>` + `<use>`, comme les maquettes) ou éléments HTML positionnés en CSS. Les maquettes mélangent les deux : rouages en SVG `<use>`, comètes/halos/étoiles en `<div>` + gradients. Reproduire ce partage est le chemin le plus court et le plus fidèle.
- **Recadrage central du mode moyen** — `overflow: hidden` sur un conteneur 44 × 44 contenant la composition à sa taille naturelle, plutôt qu'une seconde composition. C'est ce qu'exige §7.3 (« la composition **recadrée** au centre »), et c'est aussi ce qui garantit AC3 (un seul rendu, trois cadrages).

### Notes de plateforme (Angular 22)

- **Signals et `computed()`** partout, `@if`/`@for` en control-flow — conventions du projet, déjà appliquées par `ListControlBar` (Story 29.9), à reprendre.
- **Bindings de style dynamiques** : préférer les bindings par propriété (`[style.width.px]`, `[style.transform]`, `[style.background]`) comme le fait déjà [character-avatar.html](../../apps/web/src/app/features/characters/character-avatar/character-avatar.html) — un `[style]` massif construit par concaténation passe par le sanitizer et se fait silencieusement amputer. C'est le piège le plus probable de cette story, qui pose beaucoup de styles calculés.
- **Tests** : Vitest 4, jsdom, **zoneless** — pas de `zone.js`. `whenStable()` seul ne suffit pas après un `ngOnInit` asynchrone ; réutiliser la boucle de ticks déjà établie dans `dashboard.spec.ts`/`my-characters.spec.ts`. `party-banner.util.spec.ts` étant fait de fonctions pures, il n'a besoin d'aucun `TestBed` (même forme que `party-sort.spec.ts`).
- **`ng test` type-vérifie aussi les specs** : toute fixture `PartieDto` incomplète casse la compilation de la suite entière. Piège déjà rencontré en 29.8 et 29.9.
- **Exécution** : tout passe par Docker (`docker exec jdr-master-web-1 sh -c "npx ng test --watch=false"`). Aucun outil Node sur la machine hôte ; un `pnpm install` sur l'hôte échoue en EACCES pendant que les conteneurs tournent.

### Intelligence de la story précédente (29.9)

- **Écart maquette découvert après coup** : la Story 29.9 avait livré les trois modes comme trois **tailles** de la même carte, alors que DESIGN.md §4.1/§7.7 en fait trois **formes**. Corrigé en fin de 29.9 (gabarit `.row` propre au mode liste). Leçon directement applicable ici : **§7.3 exige trois rendus, pas trois échelles** — la vignette 28 px a son propre rendu, ce n'est pas la bannière réduite. Ne pas refaire l'erreur symétrique.
- **Exclusions de périmètre auto-décidées** : 29.9 s'était exclue elle-même du contenu par mode sans qu'aucune AC ni story aval ne le porte, créant un trou. Si cette story doit exclure quelque chose, **vérifier qu'une story aval le porte nommément** et l'écrire ici.
- **Patron de test DOM** : sélecteurs de classe stables (`.row__dot`, `.stat-pill`), libellés lus depuis `TONE_MAP` plutôt que codés en dur (patch de revue 29.6, réappliqué en 29.9).
- **Revue de code 29.9** : `lastScrollY` initialisé depuis la position réelle, handlers de template extraits en méthodes nommées plutôt qu'écrits inline dans le HTML. Reproduire ces deux conventions.

### Project Structure Notes

- **Frontend nouveaux** :
  - `apps/web/src/app/core/parties/party-banner.util.ts` + `.spec.ts` — **chemin imposé par le Structural Seed**, pas au choix.
  - `apps/web/src/app/shared/party-banner/party-banner.ts`/`.html`/`.scss`/`.spec.ts` — voisin de `shared/list-control-bar/` (Story 29.9) et `shared/identity/` (Story 28.2), qui fixent le patron du dossier partagé.
- **Frontend modifiés** : `apps/web/src/app/features/dashboard/dashboard.html`/`.scss`/`.spec.ts` (les trois câblages + retrait du placeholder).
- **Backend** : **aucun fichier**. Si une tâche vous conduit à ouvrir `schema.prisma`, `parties.service.ts` ou un DTO, c'est le signe d'un écart à AD-19 — s'arrêter et relire le piège n°4.
- **Shared** : **aucun fichier**. `ListViewMode` et `Theme` y sont déjà déclarés (Stories 29.9 et 28.4).
- **Non touchés** : `party-signals.service.ts`, `party-signal-priority.ts`, `party-sort.ts`, `list-control-bar/`, `my-characters/`, `character-summary-card/`, `character-avatar/`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.10] — Story et Acceptance Criteria, repris verbatim.
- [Source: _bmad-output/specs/spec-palier9-refonte-ui/SPEC.md#CAP-20] — Intent/critère de succès : *« Une partie donnée présente toujours la même bannière, sur tous les appareils et à toutes les connexions — elle ne change qu'au changement de thème. Aucune partie n'est jamais nue. »*
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-47] — Bannière générée par défaut, image de couverture en substitution (D-11).
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md] — Section « Ne nécessitent aucun changement serveur » : confirme que FR-47 est 100 % frontend.
- [Source: ARCHITECTURE-SPINE.md#AD-19] — Règle canonique complète : point de dérivation unique, rien de persisté, graine issue de l'identifiant seul, priorité de l'image de couverture, animation réservée à la bannière générée.
- [Source: ARCHITECTURE-SPINE.md, Structural Seed] — `core/parties/party-banner.util.ts` : chemin et rôle imposés.
- [Source: ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §7.3 GeneratedBanner] — Mécanique de la graine, trois rendus et leurs dimensions, dérivation du monogramme, règles et bornes de tirage des trois thèmes, contrainte dure de la zone d'exclusion.
- [Source: ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §4] — Bannière 78-124 px selon le mode ; densité cible des trois modes.
- [Source: ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §6] — Radius : `{radius.card}` en grand, 8 px en moyen, 6 px en liste.
- [Source: ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §8] — Règle de construction des éléments générés en mouvement (paramètre unique θ), à appliquer dès maintenant ; portée de l'animation (mode grand uniquement, Story 29.11).
- [Source: ux-designs/ux-jdr-master-2026-08-04/DESIGN.md §9] — « Ne pas : réduire une bannière complète en vignette de 28 px — le mode liste a son propre rendu. »
- [Source: ux-designs/ux-jdr-master-2026-08-04/mockups/iteration-6-regles-de-generation.html] — **Implémentation de référence** : trois graines par thème, techniques de rouage `#gB`/`#gC`/`#gE` en SVG `<defs>`, comètes en conteneur pivoté (`.comet-rig`), halos/étoiles/feuilles/particules en `<div>` + gradients. Valeurs numériques directement réutilisables comme bornes.
- [Source: ux-designs/ux-jdr-master-2026-08-04/mockups/iteration-7-corrections.html] — **Fait foi en cas de divergence** : grille technique constante, zone d'exclusion respectée, sens de comète tiré, tuyau retiré.
- [Source: ux-designs/ux-jdr-master-2026-08-04/mockups/iteration-8-cometes-trajectoire.html] — Démonstration avant/après de la règle du paramètre unique θ.
- [Source: ux-designs/ux-jdr-master-2026-08-04/imports/reference-engrenage.html] — Référence fournie par l'utilisateur pour la technique de rouage E.
- [Source: apps/web/src/app/features/dashboard/dashboard.html, dashboard.scss] (Story 29.9) — Emplacements réservés : `.grid--large .tile::before` à remplacer, slot commenté dans `.row` à remplir, en-tête de tuile à étendre pour le mode moyen.
- [Source: apps/web/src/app/core/parties/party-sort.ts, party-signal-priority.ts] — Patron exact d'un utilitaire pur du dossier `core/parties/` : fonctions exportées, aucun service, spec sans `TestBed`.
- [Source: apps/web/src/app/shared/list-control-bar/] (Story 29.9) — Patron exact d'un composant partagé standalone : 4 fichiers, inputs/outputs signals, aucun accès aux services de données.
- [Source: apps/web/src/app/features/characters/character-avatar/character-avatar.ts, .html] — Précédent le plus proche d'un visuel dérivé (initiales, taille en union fermée, bindings `[style.*]` par propriété).
- [Source: packages/shared/src/index.ts:8, apps/web/src/app/core/theme/tones.ts:8, apps/web/src/styles.scss:192] — **Vérifié par lecture directe** : la clé du troisième thème est `medieval-steampunk`, le renommage n'a pas eu lieu.
- [Source: _bmad-output/implementation-artifacts/sprint-status.yaml, story 35-1] — Le renommage `medieval-steampunk` → `atelier-cuivre` et la migration `User.theme` sont assignés à la Story 35.1.
- [Source: _bmad-output/implementation-artifacts/29-9-modes-daffichage-et-barre-de-controles.md] — Story précédente : emplacements réservés, écart maquette et sa correction, conventions de test, patrons de revue à reproduire.

## Dev Agent Record

### Agent Model Used

Claude Opus 5 (bmad-create-story)

### Debug Log References

### Completion Notes List

- Story créée le 2026-08-12 (bmad-create-story). Vérifications faites avant écriture, par lecture directe du code :
  - **Aucun champ de bannière nulle part** — `schema.prisma`, `PartieDto` et `packages/shared/src/index.ts` sont vierges ; `party-banner.util.ts` n'existe pas. Cohérent avec AD-19 et avec l'analyse du PRD (« aucun changement serveur »).
  - **La clé du troisième thème est toujours `medieval-steampunk`** dans les trois endroits qui la déclarent (`shared`, `tones.ts`, `styles.scss`) — le renommage en `atelier-cuivre` que DESIGN.md emploie partout n'a **pas** eu lieu et appartient à la Story 35.1, avec la migration de `User.theme`. Consigné en piège n°1 : c'est l'erreur la plus probable de cette story, DESIGN.md n'employant jamais la clé réelle.
  - **Les emplacements des trois modes ont été réservés par la Story 29.9** et sont commentés dans le code (`dashboard.scss:30` pour le mode grand, `dashboard.html:129` pour le mode liste) ; seul le mode moyen n'a aucun emplacement et demande un ajout structurel.
  - **`iteration-6` et `iteration-7` divergent** (tuyau, constance de la grille, sens des comètes) : ordre de préséance explicité plutôt que laissé au hasard. `.working/vignettes-generees.html` identifié comme exploration abandonnée et signalé comme tel.
  - **Angular 22 zoneless + `ng test` type-vérifiant les specs** : deux pièges déjà rencontrés en 29.8/29.9, rappelés en notes de plateforme.

- **Implémentée le 2026-08-12 (bmad-dev-story), TDD sur les 8 tâches.** Suite finale : **91/91 fichiers, 1327/1327 tests web verts** (baseline story : 89/89, 1273/1273 — +2 fichiers, +54 tests). Lint propre sur tous les fichiers touchés. Aucun fichier backend ni `shared` modifié.

- **AC5 vérifiée matériellement, pas seulement par intention** : `git status` limité à `apps/api` et `packages/shared` renvoie **0 fichier**. Aucune migration, aucun champ Prisma, aucun champ DTO, aucun endpoint. Toute la story tient dans `apps/web`.

- **Décisions prises en implémentation** (celles que la story laissait ouvertes) :
  - **Hachage FNV-1a 32 bits + PRNG mulberry32**, retenus tels que proposés. Courts, sans dépendance, déterministes. L'UUID est haché en entier — un test le verrouille (deux UUID ne différant que par leur dernier caractère donnent des graines différentes).
  - **Mots non significatifs du monogramme** : `le, la, les, l', un, une, des, du, de, d', au, aux`, retenus tels que proposés. L'apostrophe droite **et** typographique séparent. Repli défensif sur `?` pour un nom vide ou sans lettre, et repli sur les mots bruts pour un nom entièrement fait d'articles (« Le La » → `LL`) — sans quoi une partie ainsi nommée n'aurait aucune vignette.
  - **Hauteur du mode grand** : 88 px, retenue telle que proposée (celle que la Story 29.9 avait réservée), donc aucune régression de densité.
  - **Technique de rendu : un seul SVG par bannière**, et non le mélange `<div>`/SVG des maquettes. Écart assumé et motivé : `preserveAspectRatio="xMidYMid slice"` fait le recadrage central du mode moyen **nativement**, ce qui rend AC3 structurel — les modes grand et moyen partagent littéralement le même balisage, et un test compare les deux compositions caractère par caractère. Le mélange HTML/CSS aurait demandé une seconde mise en page pour le carré 44 px, donc un second endroit où diverger.
  - **Espace de dessin normalisé 160 × 88** (`BANNER_VIEWBOX_*`), exporté depuis le point de dérivation : les bornes de tirage sont exprimées dans cet espace, jamais en pixels d'écran.

- **Interprétation consignée d'un invariant de la story** (tableau « AC → invariant », ligne AC2). La story demandait que « les valeurs tirées communes (positions, angles, comptes) soient identiques d'un thème à l'autre ». Pris au pied de la lettre, cet invariant est incompatible avec DESIGN.md §7.3, qui pose qu'il n'y a **délibérément aucune structure commune** entre les trois thèmes (2-6 rouages, 1-3 comètes, 2-5 mobiles : des vocabulaires disjoints, pas des valeurs comparables). Ce qu'AD-19 exige réellement, c'est que **la clé de thème n'entre pas dans le tirage**. Implémenté et testé ainsi : `bannerSeed()` ne prend que l'identifiant, et le **premier tirage du flux** est `dominant` (la dominante colorée), **commun aux trois thèmes** — un test vérifie sur 50 identifiants que les trois thèmes rendent la même dominante. C'est la trace exécutable de l'invariant réel. `dominant` n'est pas un artifice de test : c'est ce qui distingue deux parties en mode liste, où la composition n'est pas rendue.

- **Zone d'exclusion du manomètre (AC6) — résolue par construction, pas par vérification.** `pushOutOfZone()` fait **une seule passe** : si la boîte englobante coupe la zone, l'élément est reposé à `zone.bas`. La correction se démontre — après déplacement la boîte est entièrement sous la zone, deux rectangles ne peuvent donc plus se couper, quelle que soit leur position horizontale. Choix délibéré contre un rejet-et-retirage, qui consommerait le flux PRNG de façon dépendante des données et ruinerait la reproductibilité (donc AC1). Même principe pour la décroissance **stricte** des tailles de rouages : chaque taille est tirée dans `[plancher réservé, précédent − 4]`, le plancher réservant 4 unités par rouage restant, ce qui rend l'intervalle toujours non vide. Aucune de ces deux propriétés n'est vérifiée après coup : elles sont impossibles à violer. Les tests de propriété sur **500 graines par thème** les confirment de l'extérieur.

- **Règle du paramètre unique θ appliquée dès maintenant** (DESIGN.md §8), bien que rien ne soit animé : chaque comète est rendue dans un `<g transform="translate(x y) rotate(θ) scale(direction 1)">`, la queue partant de l'origine et la tête posée à son extrémité. Un test vérifie la forme exacte du `transform` **et** que `head.cx === tail.width`. La Story 29.11 n'aura qu'à ajouter un `translateX` local dans ce repère ; elle ne peut pas réintroduire le défaut de « comète en crabe » sans casser ce test.

- **Identifiants SVG scopés par instance** (`pb1-bg`, `pb2-gear-B`…), via un compteur de module. Piège non anticipé par la story : une liste rend jusqu'à une douzaine de bannières simultanées, et des `id` fixes feraient pointer toutes les instances sur les défs de la première — les onze autres afficheraient la composition de la première. Un test le verrouille. Corollaire : les comparaisons de composition dans les specs neutralisent ces identifiants, puisqu'ils **doivent** différer.

- **Gap de fixture trouvé et corrigé** (piège annoncé par la story, effectivement réalisé) : `dashboard.spec.ts` mockait `ThemeToneService` avec `tone` seul. `PartyBanner` lit `activeTheme`, ce qui a fait tomber **62 tests** d'un coup, tous par la même cause. Mock étendu ; aucune autre spec n'était concernée (vérifié par la suite complète).

- **Coût de rendu tenu** : le mode liste ne rend **aucun** SVG — seulement une vignette dégradée + le monogramme, conformément à §7.3 (« à 28 px, ce qui différencie deux parties n'est ni le motif ni la composition »). C'est aussi ce qui rend douze bannières par écran tenables. `bannerParams()` est appelée dans un `computed()`, jamais depuis un binding de template.

- **Nettoyage effectué** : le placeholder `.grid--large .tile::before` de la Story 29.9 est supprimé, ainsi que la variable `--tile-tint` sur les 4 classes de teinte — elle n'existait que pour lui, la laisser aurait été du code mort. Vérifié : aucun autre lecteur.

- **Build web** : échoue toujours **uniquement** sur le budget de bundle initial, dépassement pré-existant depuis la Story 29.4. Mesuré des deux côtés, la story demandant de surveiller qu'il n'empire pas : **1,25 Mo avant, 1,27 Mo après**, soit **≈ +15 kB** — la géométrie SVG inline des trois techniques de rouage. Aucun autre écart.

- **Non vérifié visuellement** : l'application exige une session authentifiée, et je ne saisis pas d'identifiants. Les compositions sont verrouillées structurellement par les tests (bornes, invariants, comptes d'éléments, ordre de rendu), mais **le rendu à l'œil des trois thèmes reste à valider** — c'est précisément ce qu'un test DOM ne dit pas.

- **Revue de code (bmad-code-review, 2026-08-12, 3 couches Blind Hunter/Edge Case Hunter/Acceptance Auditor) sur `git diff HEAD` (baseline `6bd5a7c`)** : 1 decision-needed résolue par l'utilisateur (géométrie rouages/manomètre — repoussement horizontal plutôt que vertical hors de la zone d'exclusion, canvas bien plus large que la zone n'est large ; convention de coordonnées des rivets unifiée sur le centre, cohérente avec leur rendu en `<circle>` ; nouveau test de propriété verrouillant l'absence de disparition hors canvas sur 500 graines). 1 patch appliqué (`fx`/`fy` du dégradé de fond déplacés du `<stop>` vers le `<radialGradient>`, exprimés en pourcentage — le tirage `backgroundFocus` avait jusqu'ici zéro effet visuel). 9 items différés dans `deferred-work.md` (commentaire du sens de déploiement de la chaîne de rouages inexact, bornes non centralisées dans `BANNER_BOUNDS`, doc « cercle » vs implémentation carrée de la zone d'exclusion, champs d'animation tirés en avance pour la Story 29.11, liste de mots exclus du monogramme non revue, non-chevauchement des comètes non testé, magic number dupliqué, helper de test de neutralisation d'id trop large, absence de garde d'exécution sur un thème hors union). 8 constats écartés comme bruit après vérification dans le code (edge cases monogramme sans crash réel, `name`/`partieId` non-nullables garantis par le schéma et la validation backend, union `ListViewMode` déjà validée en amont, compteur de module sans risque en l'absence de SSR, déviation AC2 déjà documentée et justifiée dans les Completion Notes, plancher de rouage bien exercé par les rouages tardifs, suppression de `--tile-tint` vérifiée sans lecteur restant). Suite finale revérifiée : 91/91 fichiers, 1328/1328 tests web verts (+1 test), lint propre sur les fichiers touchés. Statut passé à done.

### File List

**Frontend — nouveaux**
- `apps/web/src/app/core/parties/party-banner.util.ts` (point de dérivation unique, AD-19)
- `apps/web/src/app/core/parties/party-banner.util.spec.ts` (33 tests, dont les propriétés sur 500 graines × 3 thèmes)
- `apps/web/src/app/shared/party-banner/party-banner.ts`
- `apps/web/src/app/shared/party-banner/party-banner.html`
- `apps/web/src/app/shared/party-banner/party-banner.scss`
- `apps/web/src/app/shared/party-banner/party-banner.spec.ts` (14 tests)

**Frontend — modifiés**
- `apps/web/src/app/features/dashboard/dashboard.ts` (import + déclaration de `PartyBanner`)
- `apps/web/src/app/features/dashboard/dashboard.html` (câblage des 3 modes, conteneur `.tile__head`)
- `apps/web/src/app/features/dashboard/dashboard.scss` (retrait du placeholder et de `--tile-tint`, mise en page des emplacements)
- `apps/web/src/app/features/dashboard/dashboard.spec.ts` (7 tests de câblage + `activeTheme` ajouté au mock `ThemeToneService`)

**Backend / shared** — aucun fichier (AC5, vérifié par `git status`).

## Change Log

- 2026-08-12 — Story 29.10 implémentée (bmad-dev-story). Bannière générative dérivée à l'affichage, jamais persistée : `party-banner.util.ts` (graine FNV-1a + PRNG mulberry32, monogramme, règles et bornes de tirage des 3 thèmes, zone d'exclusion du manomètre garantie par construction) et composant `PartyBanner` à 3 rendus, câblé sur les 3 modes du `Dashboard`. 91/91 fichiers et 1327/1327 tests web verts, lint propre, aucun changement backend.
