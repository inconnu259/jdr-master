---
baseline_commit: 711b0b385f59263981d7cf8301eb492f5eb652ae
---

# Story 36.13 : La grille Semaine à densité variable

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · **Front pur** · **aucune migration, aucun appel réseau nouveau** · porte **FR-36** et **clôt Q-24** [Source: epics.md:1910, epics.md:1929]

> ⚠️ **Story prise HORS ORDRE, avant la 36.6.** La séquence de l'épic la place en avant-dernière position. Elle est remontée ici sur décision de l'utilisateur du 2026-08-20, pendant la préparation de la 36.6 : voir l'**encadré n°1**. La 36.6 reste en `backlog`, son analyse est consignée dans `sprint-status.yaml`.

---

## Story

As a **utilisateur sur téléphone**,
I want **que la vue semaine reste utilisable en portrait**,
so that **je n'aie pas à choisir entre voir la semaine et lire ce qu'elle contient**.

---

## 🚨 Encadré n°1 — Pourquoi cette story passe devant la 36.6

La 36.6 (« la piste de participation d'un vote ») a un AC qui dit : « **Given** la place disponible **When** la piste est rendue **en vue semaine**, dans le rail ou dans l'agenda **Then** un compteur « 3 / 4 » double la forme ». En préparant la 36.6, l'analyse a buté sur un fait :

**`CalendarWeekView` ne reçoit ni `entries` ni `activeLayers`.** Elle ignore totalement les votes, et ne connaît des séances qu'une **pastille au niveau JOUR** dans l'en-tête de colonne (`calendar-week-view.html:33-35`), jamais au niveau créneau. Poser une piste de participation dans une cellule qui ne sait pas qu'un vote existe n'a pas de sens — la 36.6 aurait dû reporter son AC4, exactement comme la 36.5 avait reporté le sien **vers cette story**.

Vérification faite avant de basculer : **la 36.13 ne dépend de rien qui reste à faire.** Portée « Front » pure ; la seule dépendance déclarée de la fin d'épic est celle de la **36.12 → Q-25**. Ses trois prérequis réels sont livrés : le rail permanent (36.1 ✅), la sélection par glissement (36.3 ✅), et les **informations pratiques** que la cellule large doit afficher (36.5 ✅ — `composeSeanceInfo()` existe et son niveau `'compact'` n'est consommé par personne). Aucune story de 36.6 à 36.12 ne touche la vue Semaine.

**Ce que cette story livre à la 36.6 :** une cellule de Semaine qui reçoit `entries` + `activeLayers`, dérive son contenu du point unique `buildDayDetail()`, et porte déjà **le mot « Vote »** quand le rang gagnant est un vote. La 36.6 n'aura plus qu'à y accrocher sa piste et son compteur.

---

## 🚨 Encadré n°2 — Le patron existe en entier : la vue Mois

Ne rien inventer. La densité variable est **résolue** dans ce projet, et sa solution est documentée avec son motif.

| Ce qu'il faut | Où c'est déjà fait |
| --- | --- |
| Projeter des `AgendaEntry` en contenu par créneau | `buildMonthDetails(dateKeys, entries, activeLayers, declarations)` — `day-detail.utils.ts:280-292` |
| La préséance entre séance / vote / indispo / dispo / rien | `SLOT_PRECEDENCE` — `day-detail.utils.ts:51-56`. **Jamais réécrite** |
| Le titre gouverné par le rang gagnant | `calendar-month-view.ts:148` — `s.winner === 'vote' ? s.pollLabel : …` |
| Replier les informations pratiques par budget | `composeSeanceInfo(parts, density)` — `day-detail.utils.ts:260-265` |
| Basculer la densité **sans logique TS** | `@container month-grid (min-width: 712px)` — `calendar-month-view.scss:288-303` |

**Le point décisif, et l'AC5 en dépend :** dans la vue Mois, `band.text` et `band.info` sont **toujours calculés et toujours présents dans le DOM** (`calendar-month-view.html:127-135`) ; **c'est le CSS seul qui les masque**. Aucun `@if` de largeur, aucun `ResizeObserver`, aucune seconde vue. C'est exactement ce que l'AC5 exige (« aucune vue supplémentaire n'est instanciée »), et c'est **gratuit** si l'on imite ce patron.

**Ce qu'il ne faut PAS imiter :** le Mois masque **tout** texte sous son seuil. La Semaine, elle, doit garder du texte sous le seuil (AC3).

---

## 🚨 Encadré n°3 — Le contrat DOM du glissement, et pourquoi aucun test ne vous préviendra

Le glissement de la Semaine fait son hit-test ainsi (`calendar-week-view.ts:484-486`) :

```ts
const el = document.elementFromPoint(ev.clientX, ev.clientY);
const cellEl = el?.closest('[data-cell-date]');
```

**`data-cell-date` est porté par `.slot-cell` elle-même** (`calendar-week-view.html:44`). Cette story ajoute des nœuds **à l'intérieur** de la cellule (titre, sous-lignes). Tant qu'ils restent des descendants de `.slot-cell`, `closest()` les remonte et le geste tient.

🚨 **Le danger : `elementFromPoint` est STUBBÉ dans les tests** (`calendar-week-view.spec.ts:150-182`, jsdom n'a pas de géométrie). Si un nœud sortait de la cellule — un élément en `position: fixed`, un overlay, un portail Material, un `::before` étendu qui déborde et capte le pointeur — **les 15 tests de glissement resteraient verts et le geste serait cassé en production**. Il n'existe aucun garde-fou automatisé.

Deux règles opposables :
1. Tout ce que la cellule affiche est un **descendant DOM de `.slot-cell`**.
2. Tout nouveau nœud interne porte **`pointer-events: none`** sauf raison écrite — le pointeur doit toujours atterrir sur la cellule.

---

## 🚨 Encadré n°4 — Ce que la cellule contient déjà, et qui entre en concurrence

La cellule n'est pas vide. Trois choses s'y disputent la place, et deux existent déjà :

- **`.decl-label`** (`calendar-week-view.html:63-65`, `.scss:171-177`) — « Dispo · Ponctuel », produit par `formatDeclLabel()` (`.ts:50-54`) et `findWeekDecl()` (`.ts:56-85`). **Elle occupe la cellule aujourd'hui.** Le titre d'événement va s'y ajouter, pas la remplacer : décider et **commenter** leur cohabitation (l'un au-dessus de l'autre ? le titre l'emporte quand il y en a un ?).
- **La boîte** — `.slot-cell { min-height: 44px (56px ≥ 768px); display: flex; align-items: flex-start; padding: 4px }` (`.scss:92-99`). Un titre 11 px + une sous-ligne 10 px n'y tiennent pas sans refonte de cette boîte (la planche prévoit `min-height: 56px` desktop / `38px` téléphone, `contrat-ui-calendrier.html:151-152`).
- **`.seance-dot`** dans l'en-tête de colonne (`.html:33-35`) — marqueur **au niveau jour**. Une fois la cellule capable de nommer sa séance **au créneau**, cette pastille devient un doublon grossier. ⚠️ **Ne pas la retirer dans cette story** : aucun AC ne le demande, `seanceMarkerDates()` est câblé depuis `calendar-view.html:48`, et la retirer serait une régression non demandée. **La consigner dans `deferred-work.md`.**

---

## 🚨 Encadré n°5 — Deux décisions tranchées avec l'utilisateur le 2026-08-20

### a) Le seuil : **container query sur la grille, 500 px** — Q-24 close

`EXPERIENCE.md:696-699` dit « < 500 px (portrait) » / « ≥ 500 px (paysage, tablette, bureau) », **sans dire où la mesure se fait**. Q-24 est restée ouverte et **nommément attribuée à cette story** (`36-1-le-rail-de-detail.md:97-100`, `36-2-….md:267`).

**Tranché : `@container week-grid (min-width: 500px)`**, sur la largeur de la **grille**, en imitant le Mois.

**Motif, écrit pour qu'il ne se reperde pas :** en **contexte de partie**, un panneau latéral prend ~40 % de la largeur. Une media query sur la fenêtre dirait « large » pendant que les cellules seraient écrasées — c'est exactement le raisonnement consigné en commentaire pour le Mois (`calendar-month-view.scss:63-70`). Le rail, lui, emploie une media query (`calendar-detail-rail.scss:141`) parce qu'il occupe **toute** la largeur de la page : chez lui, contenant ≈ fenêtre, et il n'y a pas d'écart à trahir. Les deux choix sont cohérents, ils ne s'opposent pas.

**Conséquence gratuite :** 100 % CSS ⇒ aucune logique de largeur en TS, donc **aucune vue supplémentaire instanciée** (AC5) sans rien faire pour, et rien à tester en TS sur la bascule.
**Écarté :** `BreakpointObserver` (patron CDK pourtant présent dans le projet — `list-control-bar.ts:32-58`, `partie-detail.ts:121`, `scenario-timeline.ts:76`) — il ferait dépendre le rendu d'un signal de largeur et frotterait avec l'AC5.

### b) ⚠️ Le contenu sous le seuil : **le titre entier, tronqué par CSS** — pas de règle de mot

L'AC3 dit « elle en affiche **un seul mot** », et la planche rend « Les Cendres d'Ashal » → **« Ashal »**, « Le Convoi du Nord » → **« Convoi »** (`contrat-ui-calendrier.html:566-570`).

🚨 **Aucune règle déterministe ne reproduit ces deux exemples** : le premier prend le **dernier** mot, le second le **deuxième**. Ce sont des choix de designer faits à la main. Une troncature naïve au premier mot donnerait « Les » et « Le ».

**Tranché : aucune extraction de mot. La cellule reçoit le titre complet, `white-space: nowrap` + `text-overflow: ellipsis` le coupe** → « Les Cendr… », « Le Convoi… ».

**Motif :** zéro logique à tester, et **jamais de mot trompeur** — une règle heuristique ferait surgir un mot du milieu d'un titre, imprévisible pour le lecteur, sur une surface dont tout l'enjeu est la lisibilité.
⚠️ **Divergence frontale assumée**, sur deux fronts, **à répercuter par `bmad-ux` / `correct-course`** : contre la lettre de l'AC3 (« un seul mot ») et contre le rendu de la planche. Elle est **volontaire et documentée**, pas un oubli. Le rail reste, lui, porteur du texte complet à toutes les largeurs (36.1 + AC4) : rien n'est perdu, c'est le principe même de la table de densité.

---

## 🚨 Encadré n°6 — Trois écarts trouvés en lisant le code, écrits nulle part

1. **`SLOT_ROWS.label` vaut « Soirée » dans la Semaine** (`calendar-week-view.ts:222-230`) et **« Soir » dans `RAIL_SLOTS`** (`day-detail.utils.ts:24-28`). Ce label sert **trois** choses : la gouttière, `cellAriaLabel()` (`.ts:413`) et `selectionRangeLabel()` (`.ts:322`). Retirer le texte visible de la gouttière **ne doit casser aucune des deux autres**. Aligner ou non les deux vocabulaires est **hors périmètre** — le consigner.
2. **L'icône de créneau change de statut d'accessibilité selon la surface.** Au rail elle est `aria-hidden="true"` parce que **le mot la suit** (`calendar-detail-rail.html:19-32`). En gouttière de Semaine elle **remplace** le mot : elle doit donc porter un **`aria-label` explicite** — c'est écrit (`DESIGN.md:358`, `:362`) et c'est ce que fait la planche (`contrat-ui-calendrier.html:292`). **Copier le SVG du rail sans changer ce point rendrait la gouttière muette aux lecteurs d'écran** (AC2).
3. **La planche porte deux variantes du soleil d'après-midi** : 8 rayons dans la grille Semaine desktop (`contrat-ui-calendrier.html:294`), 4 rayons au rail et en téléphone (`:297`, `:589`). Le rail implémente la variante 4 rayons (`calendar-detail-rail.html:24-27`). **Prendre celle du rail** et ne pas introduire un second dessin du même objet.

---

## Acceptance Criteria

Les six premiers sont ceux d'`epics.md` (Story 36.13), **verbatim**. Les suivants sont ajoutés par cette story et portent leur motif.

**AC1 — Sept colonnes, toujours, et une gouttière à icônes**
**Given** la vue semaine, quelle que soit la largeur
**When** elle est rendue
**Then** elle conserve ses **sept colonnes**
**And** la gouttière porte une icône par créneau — lever, plein jour, nuit

**AC2 — Les icônes sont nommées**
**Given** ces icônes
**When** elles sont rendues
**Then** chacune porte un libellé accessible explicite

**AC3 — Sous le seuil, la cellule abrège**
**Given** une largeur inférieure au seuil
**When** une cellule porte un événement
**Then** elle en affiche un seul mot
**And** le rail de détail donne le reste
> ⚠️ **Livré sous la forme tranchée à l'encadré n°5b** : le **titre complet tronqué par CSS**, jamais un mot extrait. Divergence assumée avec la lettre de cet AC.

**AC4 — Au-dessus du seuil, la cellule déplie — et le rail demeure**
**Given** une largeur supérieure au seuil — paysage, tablette, ordinateur
**When** une cellule porte un événement
**Then** elle affiche son titre et ses informations pratiques
**And** le rail **demeure** et déplie ce que la cellule abrège
**And** aucune règle de cette story ne masque le rail

**AC5 — La bascule ne construit rien**
**Given** le passage d'une largeur à l'autre
**When** il se produit
**Then** aucune vue supplémentaire n'est instanciée
**And** la sélection par glissement se comporte identiquement

**AC6 — Le Mois ne porte pas ces icônes**
**Given** la vue mois
**When** elle est rendue
**Then** elle ne porte **pas** ces icônes — la position y dit déjà le créneau

**AC7 — Un seul point de dérivation**
**Given** une cellule de Semaine qui doit nommer ce qu'elle porte
**When** son contenu est calculé
**Then** il vient de `buildDayDetail()` / `buildMonthDetails()` et de `composeSeanceInfo()`
**And** **aucune règle de préséance, aucun ordre de repli et aucune projection d'`AgendaEntry` n'est réécrit dans la Semaine**
*Motif : `SLOT_PRECEDENCE` gouverne déjà le Mois et le rail. Une troisième copie divergerait au premier correctif, comme la 36.2 l'a déjà vécu sur `text`/`winner`.*

**AC8 — Aucun appel réseau**
**Given** la vue Semaine ainsi enrichie
**When** elle s'affiche et quand on bascule de vue
**Then** **aucune requête HTTP supplémentaire n'est émise**
*Motif : `entries` et `activeLayers` sont déjà en mémoire au point d'appel (`calendar-view.html:31-42` les passe déjà au Mois). C'est un câblage, pas un chargement.*

**AC9 — Le geste survit intact**
**Given** les nœuds ajoutés dans la cellule
**When** un glissement traverse la grille
**Then** `closest('[data-cell-date]')` remonte toujours à la cellule
**And** les **26 tests existants** de `calendar-week-view.spec.ts` passent **sans modification de leurs assertions**
*Motif : encadré n°3 — c'est la seule régression que la suite de tests ne peut pas voir.*

**AC10 — Le vote est un événement comme un autre**
**Given** un créneau portant un vote en cours, la couche `votes-en-cours` allumée
**When** la cellule est rendue
**Then** elle le nomme, comme elle nomme une séance
*Motif : la table de densité nomme explicitement les deux — « Un mot — « Convoi », « Vote » » (`EXPERIENCE.md:697`).*

**AC11 — Les couches gouvernent la cellule**
**Given** une couche éteinte dans le panneau d'affichage
**When** la Semaine est rendue
**Then** ce que cette couche apportait **disparaît de la cellule**
**And** l'indisponibilité dérivée d'une séance **demeure** — elle ne dépend d'aucun réglage
*Motif : garantie FR-50, déjà protégée des deux côtés dans le Mois et le rail. La Semaine hérite du même contrat en héritant de `buildDayDetail()`.*

**AC12 — Le nom accessible dit tout, non tronqué**
**Given** une cellule portant un événement, à n'importe quelle largeur
**When** un lecteur d'écran l'annonce
**Then** il dit le créneau, la date, **l'état en toutes lettres**, et le **titre complet**
**And** ce que le CSS tronque visuellement n'est **jamais** tronqué dans le nom accessible
*Motif : c'est exactement ce que la 36.5 a dû corriger en revue de code sur le rail (`openLabel()` n'incluait pas `seanceInfo()`). Ne pas refaire la même faute une surface plus loin.*

---

## Tasks / Subtasks

### 1. Câbler les données jusqu'à la vue (AC7, AC8, AC10, AC11)
- [x] Ajouter deux `input()` à `CalendarWeekView` : `entries = input<AgendaEntry[]>([])` et `activeLayers = input<readonly CalendarLayerKey[]>([])`, en copiant les signatures du Mois (`calendar-month-view.ts:190-199`).
- [x] Les passer depuis `calendar-view.html:43-54` : `[entries]="calendarEntries()"` et `[activeLayers]="activeLayers()"` — **les mêmes expressions que celles déjà passées au Mois**, ligne 31-42. Ne créer aucun signal nouveau.
- [x] Dans `buildWeek()` ou un `computed()` frère, appeler **`buildMonthDetails(les 7 dateKeys, entries, activeLayers, declarations)`** une seule fois par semaine rendue. **Une seule projection**, jamais sept appels à `buildDayDetail()`.
- [x] Étendre `SlotData` (`calendar-week-view.ts:23-27`) d'un champ portant le `DaySlotDetail` du créneau — ou de champs plats dérivés. **Ne pas dupliquer `status`** : arbitrer entre `computeDisplayStatus` (existant) et le `status` que `buildDayDetail` calcule déjà, et **commenter le choix** (voir « Décisions laissées à l'implémentation »).
- [x] Supprimer le doublon local `dateKey()` (`calendar-week-view.ts:397-399`) au profit de `toDateKey()` (`day-detail.utils.ts:122-127`) — même convention, deux implémentations.

### 2. La gouttière à icônes (AC1, AC2, AC6)
- [x] Remplacer le texte des `.row-label` par les trois SVG, **copiés depuis `calendar-detail-rail.html:19-32`** (variante 4 rayons pour l'après-midi — encadré n°6.3).
- [x] Leur poser un **`aria-label` explicite** (« Matin », « Après-midi », « Soir ») — **et non `aria-hidden`**, contrairement au rail (encadré n°6.2).
- [x] Style repris de `calendar-detail-rail.scss:53-63` (`stroke: currentColor`, `fill: none`, `stroke-width: 1.7`, extrémités arrondies, `color: var(--jdr-text-muted)`), taille 15 × 15 px (`DESIGN.md:358`), réduite en portrait si la gouttière l'exige.
- [x] Adapter `grid-template-columns` (`calendar-week-view.scss:32-41`) — la planche donne `30px repeat(7,1fr)` desktop et `24px repeat(7,1fr)` téléphone (`contrat-ui-calendrier.html:144-145`). Le `auto` actuel suit le texte retiré : le **fixer**, sinon la gouttière change de largeur avec l'icône.
- [x] **Vérifier que `SLOT_ROWS.label` reste utilisé** par `cellAriaLabel()` (`.ts:413`) et `selectionRangeLabel()` (`.ts:322`) — encadré n°6.1.
- [x] **AC6 : ne toucher à rien dans `calendar-month-view`.** Le vérifier par `git status` en fin de story.

### 3. La cellule à densité variable (AC3, AC4, AC5)
- [x] Rendre, dans `.slot-cell`, le titre de l'événement (rang gagnant : `seanceLabel` ou `pollLabel`) et ses informations pratiques via `composeSeanceInfo(slot, 'compact')` — **le niveau `'compact'` existe et n'est consommé par personne** (`day-detail.utils.ts:238`).
- [x] **Toujours les émettre dans le DOM**, aux deux densités. **Aucun `@if` de largeur, aucun `ResizeObserver`, aucun `BreakpointObserver`** — c'est l'AC5.
- [x] Poser `container-type: inline-size; container-name: week-grid` sur `.week-grid` et un unique bloc `@container week-grid (min-width: 500px)` qui **révèle** les informations pratiques. Sous le seuil : titre seul, `nowrap` + `text-overflow: ellipsis`.
- [x] Refondre la boîte de `.slot-cell` (`.scss:92-99`) pour loger titre + sous-ligne : `min-height` 38 px sous le seuil / 56 px au-dessus, corps 11 px (titre) et 10 px (sous-ligne) — `contrat-ui-calendrier.html:151-163`.
- [x] **Tout nœud ajouté est un descendant de `.slot-cell` et porte `pointer-events: none`** (encadré n°3).
- [x] Arbitrer et **commenter** la cohabitation avec `.decl-label` (encadré n°4).
- [x] **Ne pas toucher** au `@media (min-width: 768px)` existant (`.scss:187-209`) : il règle les gouttières et les corps, pas la densité de contenu. Deux mécanismes, deux rôles — l'écrire en commentaire.

### 4. Accessibilité (AC2, AC12)
- [x] Étendre `cellAriaLabel()` (`.ts:401-414`) pour qu'il annonce, en plus du créneau / de la date / de l'état, le **titre complet et les informations pratiques non tronqués**.
- [x] Vérifier que le nom accessible ne double pas l'icône de gouttière (elle nomme la **ligne**, la cellule nomme **son** créneau).

### 5. Tests — Web (AC1 à AC12)
- [x] **Faire d'abord passer les 26 tests existants sans toucher à leurs assertions** (AC9). S'ils exigent une adaptation du **harnais** (les nouveaux `input()` ont des valeurs par défaut, donc en principe non), le dire explicitement au Change Log.
- [x] Ajouter un test de **non-régression du glissement** qui n'utilise **pas** le stub `elementFromPoint` : vérifier que le nœud de titre nouvellement rendu satisfait `titleEl.closest('[data-cell-date]') === cellEl` (encadré n°3, AC9).
- [x] Gouttière : trois icônes, chacune avec son `aria-label` (AC1, AC2).
- [x] Sept colonnes présentes aux deux densités (AC1).
- [x] Contenu **toujours dans le DOM** aux deux densités — l'assertion porte sur la présence du nœud, pas sur sa visibilité (jsdom n'évalue pas les container queries) (AC3, AC4, AC5).
- [x] Le titre vient du **rang gagnant** : une séance nommée, puis un vote nommé (AC10).
- [x] Couche éteinte ⇒ le titre disparaît, **l'indisponibilité demeure** (AC11).
- [x] `cellAriaLabel()` porte le titre complet, non tronqué (AC12).
- [x] Aucune requête HTTP : le harnais ne fournit **aucun** `HttpClient` — si le composant en réclamait un, c'est que l'AC8 est violé (AC8).
- [x] Zoneless : utiliser la boucle de ticks établie du projet (`for (let i=0;i<10;i++){ await Promise.resolve(); fixture.detectChanges(); }`) — `whenStable()` seul ne suffit pas. Attention à sa cohabitation avec `vi.useFakeTimers()` déjà en place dans le bloc de sélection.

### 6. Vérification
- [x] **Mesurer la baseline AVANT tout changement** : `docker compose exec web pnpm test` et `pnpm lint`, working tree propre. Chiffres attendus au démarrage : **web 103 fichiers / 1748 tests**, lint **143** (baseline de sortie de la 36.5) — **reconfirmer**, ne pas recopier.
- [x] Web : tests verts, lint = baseline, `pnpm typecheck`.
- [x] Le build échoue sur le seul budget de bundle pré-existant (~1,38 Mo) — **écart connu, pas une régression**.
- [x] ✅ **VÉRIFICATION VISUELLE RÉELLE OBLIGATOIRE.** La 36.5 a trouvé **trois défauts invisibles aux 1748 tests** par ce seul moyen (une bande réduite à « 20… », une heure tronquée en « 2… », un seuil à 1120 px inatteignable). À regarder : la grille **en largeur téléphone portrait** (sept colonnes tiennent-elles vraiment ? le titre est-il lisible ?), **en paysage**, **et en contexte de partie avec le panneau latéral ouvert** — c'est le cas qui justifie la container query, et le seul qui puisse la démentir.
- [x] Vérifier à l'œil que le rail **demeure** aux deux largeurs (AC4) et que le Mois n'a pas bougé (AC6).

### Review Findings

Revue adversarielle du 2026-08-20 (bmad-code-review) — 3 couches parallèles (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 9 constats retenus après triage : 1 decision-needed (résolue par l'utilisateur → patch), 4 patch (dont la decision-needed résolue), 0 defer, 4 rejetés (nits déjà couverts ou non actionnables). Chaque constat significatif a été vérifié sur le code réel avant triage.

- [x] [Review][Patch] **Bogue critique de cascade CSS — `.decl-label` ne réapparaît jamais au-dessus du seuil.** La règle inconditionnelle `.slot-cell.has-event .decl-label { display: none; }` était déclarée APRÈS le bloc `@container week-grid (min-width: 500px)` qui tente de la lever ; à spécificité égale, l'ordre source l'emporte, donc le label restait invisible à toute largeur. [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.scss] — corrigé (règle de base déplacée avant le bloc `@container`)
- [x] [Review][Patch] `preview` (aperçu d'une saisie en cours) ignorait les séances et pouvait afficher « disponible »/« inconnu » sur une case verrouillée par une séance confirmée pendant un glissement — contradiction visuelle et a11y avec FR-50, que ce même diff corrige pourtant pour `status`. Écart explicitement documenté et assumé par la story (Completion Note #3), mais confirmé comme défaut réel par deux revues indépendantes ; **décision utilisateur : aligner sur le Mois**. [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts] — corrigé (`weekPreviewDetails`, même patron que `calendar-month-view.ts`)
- [x] [Review][Patch] `[class.has-event]` utilisait `!== null` alors que le template teste la véracité (`@if ... as title`) — un `seanceLabel`/`pollLabel` en chaîne vide aurait marqué la cellule `has-event` sans rien y afficher. [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.html] — corrigé (`!!eventTitle(...)`)
- [x] [Review][Patch] `cellAriaLabel()` calculait `composeSeanceInfo` sur `slotData.detail` sans garder le garde `winner === 'seance'` (contrairement à `eventInfo()`), un défaut de forme déjà signalé en revue de code de la story 36.5 (rail `openLabel()`) et réapparu ici — inoffensif aujourd'hui (résultat jeté), mais fragile au prochain refactor. [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts:507] — corrigé (garde alignée sur `eventInfo()`)
- [x] [Review][Patch] `.slot-cell { min-height: 44px }` sous le seuil ne correspondait pas aux 38 px du contrat d'UI (Task 3, `contrat-ui-calendrier.html:151-163`), sans justification consignée contrairement aux autres écarts délibérés de la story. [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.scss:116] — corrigé (aligné sur 38px)

Rejetés (non actionnables ou déjà couverts) : tests `weekDateKeys`/`dayKey` tautologiques sur la conversion UTC→locale (faiblesse de test, aucun défaut de production observable) ; écart cosmétique gouttière 30px (media query 768px) / densité container query 500px en scénario panneau latéral — mécanisme délibérément séparé et documenté par l'auteur ; absence de branche par défaut dans le `@switch` d'icônes — `SLOT_ROWS` est un tableau local fixe à 3 entrées, non atteignable en pratique ; AC3 « un seul mot » non implémenté — écart pré-autorisé par l'utilisateur le 2026-08-20 et déjà consigné pour suivi via `correct-course`/`bmad-ux`, hors du périmètre de cette revue de code.

---

## Hors périmètre

- **La piste de participation et le compteur « 3 / 4 »** → **story 36.6**. Cette story livre la cellule qui les accueillera ; elle ne les dessine pas.
- **La jauge de disponibilité du groupe** dans la cellule de Semaine → **story 36.8** (canal séparé, hors préséance).
- **Le mode Destinée** → 36.9. **L'Agenda** → 36.11 / 36.12. **La légende et la barre repliée** → 36.14.
- **Retirer `.seance-dot`** de l'en-tête de colonne, devenue un doublon grossier → à **consigner** dans `deferred-work.md`, pas à corriger (encadré n°4).
- **Aligner « Soirée » (Semaine) et « Soir » (rail)** → à consigner (encadré n°6.1).
- **Factoriser les blocs jumeaux de sélection** entre Mois et Semaine (`calendar-week-view.ts:262-582` vs `calendar-month-view.ts:278-652`, quasi identiques) → dette pré-existante, **ne pas l'ouvrir ici** : elle toucherait le geste, que l'AC5 et l'AC9 exigent de laisser intact.
- **Le test d'axe du glissement**, présent au Mois (`calendar-month-view.ts:538-541`) et absent de la Semaine → écart pré-existant, hors périmètre.
- **`/security-review`** — en dette depuis la 36.4 puis la 36.5. Cette story est **front pur, sans donnée nouvelle ni endpoint** : elle n'aggrave rien, mais **ne solde pas la dette**.

---

## Ce qui doit continuer de fonctionner

- **La sélection par glissement de la Semaine en entier** — long-press 450 ms, seuil de 8 px, annulation au scroll tactile, clamp sur le slot de l'ancre, `suppressNextClick`, Échap, Shift+flèches, la barre de sélection et l'écriture groupée avec sa résolution de conflits (36.3, 36.4).
- **`buildWeek()`, `getWeekStart()`, `findWeekDecl()`, `formatDeclLabel()`, `computeDisplayStatus`** et le rendu de `.decl-label`.
- **`weekRangeCells()`** et le contrat `WeekCell` qu'il consomme (`selection.utils.ts:24-35`) — la Semaine n'est pas seule à le lire.
- **Le contrat DOM** : `.slot-cell`, `data-cell-date`, `data-cell-slot`, `.week-grid`, `.slot-cell.selected`, `app-selection-bar` — les tests s'y accrochent nommément.
- **`buildDayDetail` / `SLOT_PRECEDENCE` / `composeSeanceInfo` / `buildMonthDetails`** — **étendus si besoin, jamais dupliqués**.
- **La vue Mois telle qu'elle est** (AC6) et **le rail à toutes les largeurs** (AC4, acquis de 36.1).
- **La pastille de séance** de l'en-tête de colonne, jusqu'à décision contraire.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Instancier deux vues, ou brancher un `@if` sur la largeur.** L'AC5 l'interdit. Le Mois montre comment s'en passer : tout dans le DOM, le CSS masque (encadré n°2).
2. 🚨 **Sortir un nœud de `.slot-cell`** — overlay, `position: fixed`, portail. Le glissement casse **et les tests restent verts** (encadré n°3).
3. **Réécrire la préséance dans la Semaine.** Troisième copie de `SLOT_PRECEDENCE` : elle divergera (AC7).
4. **Appeler `buildDayDetail()` sept fois.** `buildMonthDetails()` existe pour ça.
5. **Copier l'icône du rail avec son `aria-hidden`.** En gouttière elle remplace le mot : elle doit être nommée (encadré n°6.2, AC2).
6. **Introduire un second dessin du soleil d'après-midi** (la planche en a deux) — prendre celle du rail (encadré n°6.3).
7. **Extraire « un mot » du titre.** Tranché : titre entier, ellipse CSS (encadré n°5b).
8. **Poser une media query au lieu d'une container query.** Elle mentirait en contexte de partie (encadré n°5a).
9. **Toucher au `@media (min-width: 768px)` existant** en croyant que c'est le seuil de densité. Ce n'en est pas un : il règle les gouttières et les corps de texte.
10. **Retirer le texte de `SLOT_ROWS.label`** au lieu de retirer son *rendu* : il alimente aussi `cellAriaLabel()` et `selectionRangeLabel()` (encadré n°6.1).
11. **Tronquer le nom accessible** comme le CSS tronque le visuel. C'est le défaut exact que la revue de code de la 36.5 a relevé sur le rail (AC12).
12. **Laisser `.decl-label` et le titre se marcher dessus** sans décision écrite (encadré n°4).
13. **Croire que jsdom évalue les container queries.** Il ne le fait pas : les tests assertent la **présence** des nœuds, jamais leur visibilité effective. D'où la vérification visuelle obligatoire.
14. **Oublier la boucle de ticks zoneless**, ou la mêler naïvement à `vi.useFakeTimers()` déjà présent dans le bloc de sélection.
15. **Retirer `.seance-dot`** parce qu'elle fait doublon. Régression non demandée (encadré n°4).

### Décisions arrêtées par cette story

- **Seuil = `@container week-grid (min-width: 500px)`**, sur la largeur de grille. **Q-24 close.**
- ⚠️ **Sous le seuil : le titre complet, tronqué par CSS.** Aucune extraction de mot. Divergence assumée avec l'AC3 et avec la planche.
- **Densité `'compact'`** pour la cellule large (le niveau libre), `'full'` restant celui du rail.
- **La gouttière porte des icônes nommées**, la case du Mois n'en porte aucune.
- **Un seul point de dérivation** : `buildMonthDetails()` + `composeSeanceInfo()`.
- **Le vote est nommé dans la cellule** dès cette story ; sa **piste** attend la 36.6.
- **Aucune logique de largeur en TS.**
- **La pastille de séance reste**, son retrait est consigné en dette.

### Décisions laissées à l'implémentation

- **`SlotData` : porter le `DaySlotDetail` entier, ou des champs plats dérivés.** *Recommandation : le détail entier, comme le Mois porte `DayBand` — moins de champs à faire suivre quand la 36.6 ajoutera les siens.*
- **Le `status` de la cellule : `computeDisplayStatus` (existant) ou celui de `buildDayDetail` ?** Les deux existent et pourraient diverger. *Recommandation : garder `computeDisplayStatus` pour le fond — c'est lui que la sélection et l'aperçu (`preview`) consomment — et n'utiliser `DaySlotDetail` que pour le contenu textuel. **Commenter ce partage**, c'est le point le plus subtil de la story.*
- **Cohabitation `.decl-label` / titre** — l'un sous l'autre, ou le titre l'emporte.
- **Largeur exacte de la gouttière** (30 / 24 px de la planche, ou une valeur unique).
- **Taille de l'icône en portrait** (15 px, ou 11 px comme la planche téléphone).
- **Faire porter le container query à `.week-grid` ou à un conteneur parent** — attention : `.week-grid` porte déjà `display: grid`, `container-type: inline-size` s'y ajoute sans conflit (le Mois fait exactement cela).

### Notes de plateforme

- **Web** : Angular 22 **zoneless**, Material 22.0.2, Vitest 4, TypeScript 6.0.2. `@if`/`@for`, signals, `input()`/`output()` signal-based, `standalone: true`, `import type` pour `@master-jdr/shared`.
- **Aucune dépendance nouvelle. Aucun changement API, Prisma ou `packages/shared`.**
- **Exécution : tout par Docker.**
- **Container queries** : déjà employées en production dans ce projet (`calendar-month-view.scss:288`), donc le support navigateur est un fait acquis, pas une hypothèse.
- **Baseline à reconfirmer au démarrage** (`HEAD = 711b0b3`, working tree propre) : **web 103 fichiers / 1748 tests**, lint **143**, build en échec sur le seul budget de bundle pré-existant. Côté API, rien ne doit bouger.

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : aucun câblage nouveau requis, et aucun n'est perdu.** Cette story n'introduit **aucune source de données** : elle consomme `calendarEntries()` et `activeLayers()`, déjà alimentés par `CalendarView` et **déjà rafraîchis** par le câblage existant (`scenarios.changed()` → `notifyChanged(partieId)`), que le Mois exploite aujourd'hui. La Semaine hérite donc du temps réel du Mois **du seul fait d'être branchée sur le même signal**. La dette héritée sur `GET /me/calendar` (non rafraîchi sur `profile/calendar`, `deferred-work.md:17`) reste **ouverte et non aggravée**. [Source: CLAUDE.md ; docs/checklist.md]

### Sécurité

- **Aucune surface serveur touchée** : ni endpoint, ni DTO, ni schéma, ni autorisation. Le risque propre de cette story est **nul côté données**.
- **XSS** : les titres de séance et de vote sont écrits par des utilisateurs et rendus ici sur une nouvelle surface. La défense est **l'échappement d'Angular en interpolation**, comme partout ailleurs (doctrine `AD-17`). 🚨 **Ne jamais utiliser `[innerHTML]`** pour rendre un titre dans la cellule.
- **Non-fuite inter-parties** : garantie en amont par `buildDayDetail()` et les couches ; cette story n'ouvre aucun chemin de données nouveau.
- **`/security-review`** reste **dû sur l'épic** (36.4, 36.5, et 36.10 à venir) — non soldé par cette story, non aggravé par elle.

### Dette refermée par cette story

- **Le report de la vue Semaine par la story 36.5** (« la cellule de vue Semaine → story 36.13 ») : la cellule sait enfin nommer sa séance **et ses informations pratiques**, ce qui referme l'écart consigné là-bas.
- **Le doublon `dateKey()` / `toDateKey()`** entre `calendar-week-view.ts:397` et `day-detail.utils.ts:122`.
- **L'AC4 de la story 36.6**, qui n'aurait pas pu être honoré : elle trouvera une Semaine câblée.

### Dette explicitement NON refermée

- **`deferred-work.md:15`** — liste Agenda non bornée. Sans rapport, non aggravée.
- **`deferred-work.md:17`** — écart de rafraîchissement temps réel de `GET /me/calendar`.
- **`deferred-work.md:7`** — le rail masque un vote actif quand le créneau porte déjà une séance (chaîne `@if/@else if` mutuellement exclusive). ⚠️ **La cellule de Semaine va reproduire la même structure de rang gagnant** : ne pas corriger ici, mais **ne pas l'aggraver non plus** — et le consigner, car la 36.6 butera dessus.
- **Les blocs jumeaux de sélection** Mois / Semaine — dette structurelle, hors périmètre.
- **L'écart de test d'axe** entre Mois et Semaine.
- **`/security-review`** depuis la 36.4.
- **Nouvelles entrées à écrire dans `deferred-work.md`** : la pastille `.seance-dot` devenue doublon, et la divergence « Soirée » / « Soir ».

### Project Structure Notes

**Modifiés — Web (aucun fichier neuf attendu)**
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts` (+2 `input()`, `SlotData` étendu, `cellAriaLabel()`, suppression du `dateKey()` local)
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.html` (gouttière à icônes, contenu de cellule)
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.scss` (container query `week-grid`, boîte de `.slot-cell`, `.ic`, `grid-template-columns`)
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts` (tests ajoutés, **assertions existantes intactes**)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` (deux inputs passés — **les mêmes expressions que pour le Mois**)

**Possiblement modifié**
- `apps/web/src/app/features/calendar/day-detail.utils.ts` — **seulement si** une extension est nécessaire. Toute modification ici touche le Mois et le rail : la justifier, et relancer leurs tests.

**Non touchés (à confirmer par `git status`)**
- `calendar-month-view/**` (AC6) · `calendar-detail-rail/**` · `calendar-agenda-view/**` · `selection.utils.ts` · `selection-bar/**` · `conflict-dialog/**` · `constraint-panel/**` · **tout `apps/api/`** · **tout `packages/shared/`** · `apps/web/src/styles.scss`

### References

- [Source: **epics.md — Story 36.13**] — les six AC, verbatim, dont le ⚠️ du 2026-08-17 sur la permanence du rail.
- [Source: epics.md:1910, :1929] — « FR-36 | 36.13 » et « Front ».
- [Source: epics.md:1934 — Convention de lecture du contrat d'UI] — le contrat décrit l'état d'arrivée de **l'épic** ; une story intermédiaire peut ne pas y ressembler encore, et ce n'est **pas** une divergence. Le ⚠️ signale autre chose : un écart à la **cible finale**.
- [Source: **EXPERIENCE.md §9** — « La grille Semaine à densité variable (Q-20, tranchée le 2026-08-17) »] — la table de densité, le ⚠️ sur la permanence du rail, et **le calcul qui a tranché** (mesure sur 375 px : la gouttière ne rapportait que +1,7 px, « sept colonnes en portrait » était le vrai problème ; en paysage ≈ 107 px par jour suffisent au titre + lieu + heure).
- [Source: **DESIGN.md §7.10** — SlotIcon] — soleil levant / soleil haut / croissant, 15 × 15 px, `stroke: text-muted` 1,6, `aria-label` explicite ; **portée : gouttière de Semaine et rail ; la case du Mois n'en porte pas** (motif écrit : la position y dit déjà le créneau).
- [Source: **DESIGN.md §7.10 bis** — DetailRail] — le rail est permanent à toutes les largeurs, trois lignes toujours, accessoires repliés en premier.
- [Source: **contrat-ui-calendrier.html:143-163**] — la grille Semaine au pixel : `30px repeat(7,1fr)` / `24px repeat(7,1fr)`, `.cell` 56 px / 38 px, `.t` 11 px gras `nowrap` ellipse, `.s` 10 px muted.
- [Source: contrat-ui-calendrier.html:292-300] — la Semaine desktop rendue : gouttière à icônes nommées, cellule `.se` portant `.t` + deux `.s` (« chez Marc », « 20 h 30 · dés »).
- [Source: contrat-ui-calendrier.html:556-590] — la Semaine **portrait**, nouveauté de la révision 2, et son rail dessous.
- [Source: contrat-ui-calendrier.html:583 — annotation 27] — ⚠️ « En Semaine portrait, un mot par case … En paysage (≥ 500 px), le titre, le lieu et l'heure reviennent dans la cellule — **et le rail reste** ».
- [Source: **prd.md:289-294 — FR-36**] — la vue Semaine est conservée et **change de rôle** : élargie le 2026-08-17 à la **lecture détaillée**, « les laisser porter une simple pastille est le gaspillage le plus visible du calendrier actuel ». C'est la raison d'être de cette story.
- [Source: `36-5-les-informations-pratiques-dune-seance.md`] — le report explicite de la cellule de Semaine vers cette story, `composeSeanceInfo()` et ses trois niveaux, et **les trois défauts que seule la vérification visuelle a trouvés**.
- [Source: `36-1-le-rail-de-detail.md:97-100`, `36-2-la-case-du-mois-trois-bandes-et-la-preseance.md:267`, **prd.md:481**] — **Q-24 laissée ouverte et attribuée à cette story** : « seuil de densité ≈ 500 px, à trancher à l'implémentation de 36.13 ».
- [Source: docs/checklist.md ; CLAUDE.md] — évaluation SSE obligatoire, `/security-review` et `/code-review` en fin de palier.

---

## Décisions arbitrées avec l'utilisateur (2026-08-20)

1. **Prendre la 36.13 avant la 36.6.** Condition posée par l'utilisateur : « si la 36.13 dépend d'autres stories, on prend l'option hors périmètre ; sinon on part sur 36.13 ». Vérification faite — elle ne dépend de rien qui reste à faire (encadré n°1) — donc bascule.
2. **Seuil : container query sur la grille, 500 px** (encadré n°5a). **Q-24 close.**
3. ⚠️ **Sous le seuil : titre entier tronqué par CSS**, aucune règle de mot (encadré n°5b).
4. *(Conservée pour la 36.6, pas pour ici)* **`membersCount` sur `SessionPollDto`** pour l'effectif de la troupe en contexte de partie — consignée dans `sprint-status.yaml`, entrée `36-6-…`.

### ⚠️ À répercuter hors story

- **`epics.md` — AC3 de la 36.13** : « un seul mot » n'est pas livré à la lettre. À amender ou à acter comme divergence (`correct-course` / `bmad-ux`).
- **La planche contractuelle** rend « Ashal » et « Convoi » ; l'implémentation rendra « Les Cendr… ». À répercuter dans la révision suivante du contrat d'UI.
- **Q-24** doit être marquée **close** dans le PRD §7 avec sa réponse (container query, 500 px, mesurée sur la grille) et son motif.
- **`deferred-work.md`** : deux entrées nouvelles (pastille `.seance-dot` en doublon ; « Soirée » vs « Soir »).

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story, 2026-08-20)

### Debug Log References

- **Baseline mesurée avant tout changement** (`HEAD = 711b0b3`, working tree propre) : web **103 fichiers / 1748 tests** verts, lint **143**. Conforme aux chiffres annoncés par la story.
- **Phase rouge confirmée** : les 10 nouveaux tests échouaient tous (`setInput('entries')` sur un input inexistant), les 1748 existants restaient verts.
- **Phase verte** : **103 fichiers / 1758 tests** verts (+10), lint **143 = baseline**, build en échec sur le seul budget de bundle pré-existant (1,39 Mo).
- Pas de script `typecheck` côté web (il n'existe que pour l'API) : le typage est vérifié par le compilateur Angular, qui s'exécute à chaque `pnpm test` — et il a effectivement attrapé une erreur, voir la note n°2.

### Completion Notes List

1. **Le câblage, tel que prévu.** `CalendarWeekView` reçoit `entries` et `activeLayers` — les **mêmes expressions** que celles déjà passées à la vue Mois, aucun signal nouveau créé dans `CalendarView`. Une seule projection par semaine (`buildMonthDetails` sur les 7 clés), jamais sept appels à `buildDayDetail()`. `weekDateKeys()` a été extraite pour que la projection porte exactement sur les jours que `buildWeek()` rend : deux boucles de dates divergentes auraient décalé les titres d'une colonne sans que rien ne le signale.

2. **Le compilateur a attrapé ce que les tests ne voyaient pas.** Rendre `SlotData.detail` requis cassait `selection.utils.spec.ts`, qui construit des `WeekCell` de fixture sans se soucier du contenu affiché. Le champ est donc **optionnel** : `buildWeek()` le renseigne toujours, et une spec sans rapport n'a pas eu à être modifiée.

3. 🚨 **UN DÉFAUT RÉEL TROUVÉ ET CORRIGÉ, non prévu par la story : la vue Semaine contredisait le Mois et le rail.** Le test AC11 a échoué en réclamant `data-status="UNAVAILABLE"` sous une séance et en recevant `UNKNOWN`. Motif : le statut de la cellule vient de `computeDisplayStatus`, **qui ne lit que les déclarations et ignore les séances**. La règle de FR-50 — « une séance confirmée rend le créneau indisponible, quelle que soit la couche » — vit dans `buildDayDetail()`, et la Semaine ne l'avait jamais eue faute de connaître les séances. Le même jour s'affichait donc *pris* en Mois et *non déclaré* en Semaine. **Corrigé** : quand un détail existe, c'est lui qui dit le statut. Hors séance les deux valeurs coïncident (mêmes déclarations en entrée), donc aucun test existant ne bouge — et c'est bien ce qui s'est produit.
   **`preview` reste calculé par `computeDisplayStatus`** : c'est l'aperçu d'une déclaration *en cours de saisie*, une projection de ce que l'utilisateur est en train de poser, pas un état du calendrier. Conséquence connue et assumée : un aperçu peut afficher « disponible » par-dessus une séance pendant la saisie. Aucun AC ne le couvre, rien n'est aggravé.

4. **Le seuil, comme tranché.** `@container week-grid (min-width: 500px)` sur `.week-grid`. **Zéro logique de largeur en TS** — pas de `ResizeObserver`, pas de `BreakpointObserver`, pas de `@if` de largeur : l'AC5 (« aucune vue supplémentaire n'est instanciée ») est satisfait structurellement, pas par une précaution. Le `@media (min-width: 768px)` préexistant a été **conservé dans son rôle** (confort d'affichage : gouttière, gouttières inter-cellules, corps de texte) et un commentaire dit explicitement qu'il n'est **pas** le seuil de densité, pour que personne ne les fusionne plus tard.

5. **La gouttière.** Les trois SVG sont **ceux du rail, à l'identique** (variante 4 rayons pour l'après-midi — la planche en portait deux, un seul dessin par objet dans le projet). Différence voulue et testée : ils portent un `aria-label` explicite au lieu de `aria-hidden`, **parce qu'ici l'icône remplace le mot** au lieu de l'accompagner. `grid-template-columns` passe de `auto` à une largeur **fixe** (24 px, 30 px au-delà de 768 px) : l'`auto` suivait la largeur du texte « Après-midi », désormais absent.

6. **`SLOT_ROWS.label` intact.** Seul son *rendu* dans la gouttière a été remplacé ; le label continue d'alimenter `cellAriaLabel()` et `selectionRangeLabel()`, et il sert désormais aussi d'`aria-label` aux icônes. La divergence « Soirée » (Semaine) / « Soir » (rail) **subsiste telle quelle** — hors périmètre, à consigner.

7. **Le contrat DOM du glissement est tenu, et prouvé.** Les deux nœuds ajoutés sont des descendants de `.slot-cell` et portent `pointer-events: none`. Un test dédié l'affirme **sans utiliser le stub `elementFromPoint`** (`title.closest('[data-cell-date]') === cell`) : c'est le seul garde-fou possible, puisque les 15 tests de glissement resteraient verts même si le geste était cassé.

8. **Cohabitation avec `.decl-label` tranchée** (le point laissé à l'implémentation) : `.slot-cell` passe en colonne, l'**événement d'abord** — c'est ce que la case doit dire en premier — puis l'état déclaré, inchangé. Les informations pratiques sont le **premier repli** : sous le seuil, la cellule ne garde que le titre tronqué, et le rail porte le texte complet à toutes les largeurs.

9. **AC6 vérifié par `git status`** : aucun fichier de `calendar-month-view/**` n'est modifié. Aucun changement non plus côté `apps/api/`, `packages/shared/`, `day-detail.utils.ts`, `selection.utils.ts` ni `styles.scss`. Les 5 fichiers touchés sont exactement ceux annoncés par la story.

10. ✅ **VÉRIFICATION VISUELLE RÉELLE FAITE** (Chrome, session MJ+joueur ouverte par l'utilisateur). Les trois cas exigés ont été regardés.

11. 🚨 **UN DÉFAUT TROUVÉ À L'ŒIL, INVISIBLE AUX 1758 TESTS — et corrigé.** En branche étroite, `.decl-label` partait sur **trois lignes** (« Indispo / · / Ponctu / el ») dans une colonne de ~43 px et faisait exploser la hauteur de la cellule, pendant que le titre d'événement, lui, s'ellipsait proprement à côté. Cause : `word-break: break-word` sans `nowrap`. **Le défaut pré-existait** — la story ne l'a pas créé — mais la règle de densité qu'elle installe le rend intenable, et l'encadré n°4 demandait précisément de trancher cette cohabitation. **Corrigé** : `.decl-label` passe en une ligne à l'ellipse comme le reste de la cellule, et **sous le seuil une cellule portant un événement ne montre que lui** (`.slot-cell.has-event .decl-label { display: none }`, rétabli au-dessus du seuil) — empiler « Chro… » et « Ind… » dans 43 px n'informe personne, l'état restant dit par la couleur du fond et le détail par le rail. Mesure après correction : hauteur de cellule **uniforme à 66 px**, `.decl-label` sur **une seule ligne de 12 px**.

12. ✅ **LA MESURE QUI VALIDE LE CHOIX DE LA CONTAINER QUERY** — calendrier **de partie, panneau latéral ouvert** : fenêtre **1384 px**, grille **398 px**, soit **986 px d'écart**. La container query bascule correctement en **étroit** ; une media query sur la fenêtre aurait affiché la branche dense dans des colonnes de **48 px**. C'est exactement le scénario que l'encadré n°5a annonçait, vérifié sur l'écran réel — Q-24 est tranchée sur une mesure, pas sur une intuition.

13. ✅ **Le correctif de statut (note n°3) se voit à l'écran** : la séance du 1er juin rend ses cellules **sur fond indisponible**, là où la vue Semaine les aurait laissées « non déclaré ». Elle occupe les trois créneaux, l'entrée étant `FULL_DAY` — convention documentée de `entryCoversSlot()`, identique au Mois et au rail, pas un défaut.

14. ✅ **Autres constats visuels** : sept colonnes tenues à 360 px comme à 398 px ; gouttière à icônes lisible aux deux densités ; rail **présent à toutes les largeurs** et porteur du détail complet ; nom accessible correct (`« Matin, jeudi 3 septembre : indisponible »`) ; le rail nomme bien le créneau touché en vue Semaine (« JEUDI 3 SEPTEMBRE — SOIR »).

15. ⚠️ **CE QUI N'A PAS PU ÊTRE VU À L'ŒIL, ET POURQUOI** — les **informations pratiques** (`.ev-info`) en branche large. Le jeu de données de développement ne contient **aucune séance portant heure/lieu/note** : la seule séance existante (« L'Affaire du Bijou Volé », 1er juin 2026) n'en a aucune, et les valeurs de démonstration posées via `psql` par la story 36.5 ne sont pas sur ce compte. Le rendu de `.ev-info` est donc couvert **par les tests seulement** (AC4/AC7, niveau `compact` : « 20:30 · chez Marc »), pas par l'œil. **À regarder lors de la revue de code**, ou en posant une séance avec informations pratiques.

16. 📋 **Observation hors périmètre, à consigner** : la cellule de Semaine **nomme** l'événement mais ne le **marque** pas — pas de liseré de vote ni de filet de séance, alors que le contrat d'UI prévoit `.wk .cell.se` et `.cell.vo` (`contrat-ui-calendrier.html:156-159`) et que la doctrine P-1 veut qu'une information ne repose jamais sur le seul texte. Aucun AC de cette story ne le demande — la 36.2 a fait ce travail pour le Mois, personne ne l'a fait pour la Semaine. **Non implémenté ici** (hors périmètre), à porter en dette : c'est aussi le fond sur lequel la 36.6 posera sa piste.

### File List

**Modifiés — Web (aucun fichier neuf, comme prévu)**
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts` (inputs `entries`/`activeLayers`, `weekDateKeys()`, `SlotData.detail`, statut suivant le détail, `eventTitle()`, `eventInfo()`, `cellAriaLabel()` étendu, `dateKey()` délégué à `toDateKey()`)
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.html` (gouttière à icônes nommées, titre et informations pratiques dans la cellule)
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.scss` (container query `week-grid` à 500 px, gouttière fixe, `.slot-icon`, `.ev-title`, `.ev-info`, cellule en colonne)
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts` (**+10 tests**, assertions existantes **inchangées**)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` (deux inputs passés à la vue Semaine)

**Non touchés (confirmé par `git status`)**
- `calendar-month-view/**` (AC6) · `calendar-detail-rail/**` · `calendar-agenda-view/**` · `day-detail.utils.ts` · `selection.utils.ts` · `selection-bar/**` · `apps/api/` · `packages/shared/` · `apps/web/src/styles.scss`

### Change Log

- 2026-08-20 — **Implémentation complète (Tasks 1 à 6, bmad-dev-story). Statut → review.** La vue Semaine reçoit `entries` et `activeLayers` — **les mêmes expressions que le Mois**, aucun signal nouveau — et dérive son contenu du **point unique** `buildMonthDetails()` + `composeSeanceInfo('compact')` : aucune règle de préséance réécrite (AC7). **Q-24 CLOSE** : `@container week-grid (min-width: 500px)`, **zéro logique de largeur en TS**, donc l'AC5 est satisfait structurellement. **LA MESURE QUI TRANCHE Q-24 A ÉTÉ FAITE À L'ÉCRAN** : en contexte de partie, panneau ouvert, la fenêtre fait **1384 px** et la grille **398 px** — **986 px d'écart** ; une media query aurait affiché la branche dense dans des colonnes de 48 px. 🚨 **UN DÉFAUT RÉEL TROUVÉ ET CORRIGÉ, non prévu par la story : la Semaine contredisait le Mois et le rail.** Le statut de la cellule venait de `computeDisplayStatus`, qui **ignore les séances** ; la règle FR-50 (« une séance rend le créneau indisponible ») vit dans `buildDayDetail()` et la Semaine ne l'avait jamais eue. Le même jour s'affichait *pris* en Mois et *non déclaré* en Semaine. Corrigé — et visible à l'écran sur la séance du 1er juin. 🚨 **UN SECOND DÉFAUT TROUVÉ À L'ŒIL, INVISIBLE AUX 1758 TESTS** : `.decl-label` partait sur **trois lignes** dans une colonne de 43 px et faisait exploser la hauteur de la cellule (`word-break: break-word` sans `nowrap`, défaut **pré-existant** que la densité rendait intenable) — corrigé, hauteur désormais uniforme à 66 px, et sous le seuil une cellule portant un événement ne montre que lui. ⚠️ **Divergence assumée livrée telle quelle** : sous le seuil, **le titre entier tronqué par CSS** et non « un seul mot » — à répercuter sur `epics.md` AC3 et sur la planche. **Web 103 fichiers / 1758 tests** (baseline 1748, **+10**), lint **143 = baseline**, build en échec sur le seul budget de bundle pré-existant. **AC6 confirmé par `git status`** : aucun fichier du Mois modifié, ni API, ni `packages/shared`. ❌ **NON VU À L'ŒIL : les informations pratiques en cellule** — aucune séance du jeu de données n'en porte ; couvertes par les tests seulement. 📋 Observation consignée : la cellule **nomme** l'événement mais ne le **marque** pas (ni liseré de vote ni filet de séance, contrairement au contrat) — hors périmètre, à porter en dette. ❌ **`/security-review` reste dû depuis la 36.4** : non aggravé par cette story front-only, non soldé.
- 2026-08-20 — Story créée (bmad-create-story), quatre sous-agents d'exploration. Prise **hors ordre, avant la 36.6**, sur décision de l'utilisateur : la 36.6 exige une vue Semaine capable de porter un vote, et la 36.13 ne dépend de rien qui reste à faire. **Q-24 close** (container query sur la grille, 500 px). ⚠️ **Une divergence assumée** : sous le seuil, le titre entier tronqué par CSS au lieu d'« un seul mot ».
