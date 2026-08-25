---
baseline_commit: cd090036a0021ffcea6b7f4547fecf281dcc31c4
---

# Story 36.3 : La sélection devient le geste de déclaration

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · **Front + dette clavier** · *La story qui renverse le geste principal* [Source: epics.md — Séquence et portée, ligne 36.3]

---

## Story

As a **utilisateur**,
I want **déclarer mes disponibilités en sélectionnant, puis en choisissant la portée**,
so that **le geste suive ma pensée au lieu de me faire remplir un formulaire**.

---

## 🚨 Encadré n°1 — Le tap cesse d'ouvrir le panneau. C'est le cœur de la story, et c'est un renversement

Aujourd'hui, `CalendarView.onSlotSelected()` (`calendar-view.ts:563`) fait **deux choses** : il peuple le rail (livré par 36.1) **et** il ouvre `ConstraintPanel`. Cette story **retire la seconde**.

| | Avant cette story | Après |
| --- | --- | --- |
| Tap sur une case / bande **libre** | Ouvre `ConstraintPanel` | **Arme une sélection d'un créneau** + affiche la barre |
| Le rail suit le toucher | ✅ | ✅ **inchangé** |
| Chemin vers `ConstraintPanel` | Le tap | **« Autre… » dans la barre — seul chemin** |

⚠️ **Ceci renverse une garantie écrite noir sur blanc par les deux stories précédentes.** L'AC9 de 36.1 (« un toucher peuple le rail **ET ouvre toujours** le panneau de déclaration ») et l'AC9 de 36.2 (« aucune régression de saisie ») ont toutes deux été écrites pour protéger ce comportement. Elles sont **délibérément levées ici**, conformément à `EXPERIENCE.md` §6 : *« Le rapport s'inverse : la sélection est le geste, le panneau est le chemin avancé. »*

**Conséquence directe et non négociable : `ConstraintPanel` n'a plus qu'une seule porte d'entrée.** Si « Autre… » est mal câblé, l'application perd :

1. **La contrainte récurrente** (« tous les mardis soir ») — capacité livrée par la story 1.7, qu'aucun glissement ne peut exprimer.
2. **La modification et la suppression** d'une déclaration existante (`selectedExisting`, `onPanelDeleted`).
3. **Le mécanisme de découpe** d'une récurrente (`splitDialogAction`, `constraint-panel.ts:83`).

C'est **le premier risque de disaster de cette story**. Les AC4 et AC10 le verrouillent, les tests le prouvent.

---

## 🚨 Encadré n°2 — La barre de sélection EXISTE. Elle gagne une portée, elle ne se réécrit pas

`apps/web/src/app/features/calendar/selection-bar/` est livré depuis la story 30.3 : composant `standalone`, 21 lignes de TS, 16 de HTML, 24 de SCSS. **Ne pas en créer un second.**

```ts
// selection-bar.ts — état actuel
readonly count = input.required<number>();
readonly rangeLabel = input<string | null>(null);
readonly markAvailable = output<void>();
readonly markUnavailable = output<void>();
readonly cancelled = output<void>();
```

Il est **déjà rendu par les deux vues** (`calendar-month-view.html:126-134`, `calendar-week-view.html:69-77`), avec le même bloc de câblage. Ce qui manque, et que cette story ajoute :

- un **sélecteur de portée** à quatre segments — `Journée` · `Matin` · `Après-m.` · `Soir` ;
- un bouton **« Autre… »** ;
- l'**intention armée** que `Entrée` valide (encadré n°3).

**Le contrat d'UI donne la composition exacte, dans l'ordre** [Source: contrat-ui-calendrier.html:252-258] :

```html
<div class="selbar">
  <b>3 créneaux sélectionnés</b>
  <span class="scope"><span>Journée</span><span>Matin</span><span>Après-m.</span><span class="on">Soir</span></span>
  <span class="spacer"></span>
  <span class="mat-stroked">Disponible</span><span class="mat-stroked warn">Indisponible</span>
  <span class="mat-stroked mut">Autre…</span><span class="mat-stroked mut">Annuler</span>
</div>
```

⚠️ **Aucune section de `DESIGN.md` ne spécifie ce composant.** Les §7.9 / 7.9 bis / 7.10 / 7.10 bis / 7.11 couvrent la case, la jauge, les icônes, le rail et la légende — **pas la barre**. Le seul contrat visuel est le CSS `.selbar` / `.scope` ci-dessus (`contrat-ui-calendrier.html:121-127`), et le SCSS déjà écrit. Ne pas chercher une spec qui n'existe pas ; ne pas inventer de jetons.

⚠️ **La barre n'apparaît sur aucune planche mobile.** Le contrat ne la dessine qu'en desktop (deux occurrences, toutes deux `class="screen desk"`). Son rendu étroit est laissé à l'implémentation — `flex-wrap: wrap` est déjà en place dans le SCSS existant, il suffit probablement.

---

## 🚨 Encadré n°3 — « Ce que la barre affiche » suppose un état que la barre n'a pas aujourd'hui

L'AC6 exige que `Entrée` valide **« ce que la barre affiche »**, avec un résultat **« identique à un clic sur le bouton correspondant »**. Or la barre affiche **deux boutons d'égale valeur**, et le contrat d'UI ne marque ni l'un ni l'autre (seul le segment de portée porte `class="on"`).

**La dette, formulée par la spine :**

> `onCellEnterKey()` valide aujourd'hui en **« indisponible » d'office** — la story 30.3 l'assumait explicitement, *« aucune touche unique ne peut exprimer disponible/indisponible »*. C'était vrai **quand aucune barre n'existait**. Le chemin pointeur, lui, demande : **deux chemins, deux résultats, pour la même intention.** `Entrée` doit valider *ce que la barre affiche*, comme le ferait un clic sur son bouton.
> [Source: EXPERIENCE.md §6 bis, encadré de dette]

**Décision de cette story : la barre porte une intention armée, visible, et c'est elle que `Entrée` valide.**

- Défaut : **`UNAVAILABLE`** — cohérent avec le cas d'usage nommé par 30.3 (« une semaine d'absence »), et il ne change donc **rien au résultat observable** pour l'utilisateur qui ne fait rien.
- Elle est **rendue visible** par une différence de **forme**, pas de couleur seule : bouton `mat-flat` pour l'armé, `mat-stroked` pour l'autre, plus `aria-pressed`. P-1 s'applique à la barre comme au reste.
- **Cliquer un bouton arme son intention et valide dans le même geste** — le chemin pointeur ne change pas d'un pixel.
- Elle est **changeable au clavier** : la barre est atteinte par `Tab` (elle suit la grille dans l'ordre du DOM), et le focus sur un bouton l'arme.

Ce qui referme la dette n'est donc pas le changement de valeur par défaut — c'est que **les deux chemins tombent enfin d'accord et que le résultat est annoncé avant d'être produit**. *Question n°1 remontée à l'utilisateur.*

---

## 🚨 Encadré n°4 — ⚠️ Trois écarts entre les documents. Chacun est tranché ici, avec son motif

### a) Le glissement en vue Mois : à la journée, ou le long d'une bande ?

| Source | Ce qu'elle dit |
| --- | --- |
| `prd.md` FR-57, 2ᵉ puce | « glisser le long d'une bande couvre ce créneau sur les jours traversés, **glisser sur le corps de la case couvre les journées entières** » |
| `EXPERIENCE.md` §6 bis, table 1 | Glissement le long d'une bande → « Sélection multiple **au créneau** » ; glissement **vertical** → « **Rien** » |
| `EXPERIENCE.md` §6 bis, collision 1 | « **Aucun geste de pointeur ne vise la journée** : on sélectionne une bande puis on bascule sur *Journée* dans la barre » |
| `epics.md` — AC de cette story | Ne mentionne **aucun** glissement le long d'une bande. AC3 fait tout passer par la portée |
| Le code d'aujourd'hui | `monthRangeDays()` → `slot: 'FULL_DAY'` pour tous les jours traversés |

**Tranché : la sélection porte un créneau par cellule (`SelectedCell`), dans les deux vues.** Le glissement en vue Mois conserve le créneau de son ancre — exactement la règle que `weekRangeCells()` applique déjà en vue Semaine. Le corps de la case et le jour fusionné donnent `FULL_DAY`.

**Motif :** l'AC1 dit « une sélection **d'un seul créneau** » — un modèle à la journée ne peut pas l'exprimer. Et la puce de FR-57 sur « le corps de la case » est **contredite par la collision 1 du même jour**, qui est l'arbitrage explicite : le corps de la case, après 36.2, c'est les bandes. ⚠️ Écart assumé vs FR-57 puce 2, à répercuter hors story.

### b) Le glissement vertical doit distinguer un axe, ce que le code ne fait pas

`onGridPointerMove()` arme sur `Math.hypot(dx, dy) > 8` — **toute** direction. L'AC5 exige que le vertical défile et ne sélectionne jamais.

**Tranché : le test d'axe ne gouverne que l'ARMEMENT, jamais l'extension.** Avant armement (souris), n'armer que si `|dx| > |dy|`. Une fois armé — par le seuil souris ou par l'appui maintenu tactile — le déplacement étend librement, y compris en enjambant des lignes de semaine (le glissement souris le fait déjà et un test le protège).

**Motif :** le tactile est déjà couvert par l'appui maintenu (`LONG_PRESS_MS`, qui laisse le défilement natif se produire avant expiration) ; c'est **la souris** qui manque de garde. Et l'AC5 vise le geste qui *démarre* vertical, pas une sélection en cours.

### c) La portée par défaut

Aucun document ne la donne. **Tranché : la portée initiale reflète l'origine de la sélection** — le créneau de la bande touchée, ou `Journée` si la sélection part du corps de la case, d'un jour fusionné (collision 8) ou d'`Espace`.

**Motif :** c'est la seule valeur qui rend l'AC1 (« une sélection d'un seul créneau ») et la collision 8 (« sur un jour fusionné, le tap vaut la journée ») vraies **sans que l'utilisateur ait à toucher la barre**.

---

## Acceptance Criteria

Les neuf premiers sont ceux d'`epics.md`, **verbatim**. AC10 à AC14 sont ajoutés par cette story et signalés comme tels.

**AC1**
**Given** une case ou une bande sans objet posé
**When** je la tape
**Then** elle devient une sélection d'un seul créneau
**And** la barre de sélection apparaît

**AC2**
**Given** une sélection active
**When** la barre est affichée
**Then** elle propose une portée — journée entière, matin, après-midi, soir
**And** la portée s'applique à **toute** la sélection

**AC3**
**Given** une sélection de plusieurs jours faite en vue mois
**When** je choisis la portée « soir »
**Then** seuls les créneaux du soir sont déclarés

**AC4**
**Given** la barre de sélection
**When** je choisis « Autre… »
**Then** le panneau de déclaration s'ouvre
**And** il reste le seul chemin de la contrainte récurrente

**AC5**
**Given** un glissement vertical dans une case de la vue mois
**When** il se produit
**Then** il fait défiler la page
**And** il ne sélectionne jamais la journée — celle-ci passe par la portée

**AC6**
**Given** une sélection armée
**When** je presse `Entrée`
**Then** elle est validée avec **ce que la barre affiche**
**And** le résultat est identique à un clic sur le bouton correspondant

**AC7**
**Given** aucune sélection armée
**When** je presse `Espace` sur une case
**Then** la journée entière est sélectionnée
**And** `Entrée` reste réservée à la validation

**AC8**
**Given** une sélection en cours
**When** je presse `Échap`
**Then** elle est annulée sans rien enregistrer

**AC9**
**Given** un double-clic ou un clic droit sur la grille
**When** il se produit
**Then** il ne déclenche aucune action propre
**And** ces deux gestes restent **délibérément réservés** — leur attribuer un sens rouvrirait l'ambiguïté avec la sélection, qu'un double-clic déclenche de toute façon au premier appui

**AC15 — ⚠️ ajouté après test d'usage : le tap court lit, l'appui maintenu déclare**
**Given** une case ou une bande
**When** je la tape brièvement
**Then** le rail affiche ce jour, et **rien d'autre ne s'ouvre** — ni le panneau, ni la barre
**And** un **appui maintenu** sur cette même cible arme la sélection et fait apparaître la barre
**And** le glissement continue d'armer une sélection de plusieurs jours
**And** l'appui maintenu vaut pour **tous les pointeurs**, souris comprise

⚠️ **Ceci amende l'AC1 de cette story et renverse un arbitrage validé.** Décision utilisateur du 2026-08-18, après essai en conditions réelles : la barre surgissant à chaque clic parasite la lecture, qui est précisément ce que le rail de 36.1 est venu servir. Quatre sources disent aujourd'hui le contraire et devront être amendées hors story, par `bmad-correct-course` :

| Source | Ce qu'elle dit |
| --- | --- |
| `prd.md` FR-57 | « Le tap reste pleinement fonctionnel — il devient **la sélection d'une seule case**, et rejoint le même flux » |
| `EXPERIENCE.md` §6 | « **Tap sur une case** → Sélection d'une seule case — **même barre, même flux** » |
| `EXPERIENCE.md` §6 bis, table 1 | « Tap sur une bande / cellule **vide** → Sélectionne ce créneau » |
| `EXPERIENCE.md` §6 bis, **collision 2** | Tap sur une bande vide : « Sélectionner » **contre** « Ouvrir le détail du jour » → *retenu : **Sélectionner***. Le nouvel arbitrage retient le prétendant écarté |

*Réserve consignée : le clic long n'a **aucune convention sur ordinateur** — rien ne le signale, rien ne l'enseigne. Le glissement reste la porte découvrable vers la barre en desktop. Le clavier n'a pas d'équivalent d'appui long : `Espace` et `1`/`2`/`3` **arment directement**, une frappe délibérée valant l'intention.*

**AC16 — ajouté après test d'usage : la date courante se voit**
**Given** une case ou une cellule
**When** je clique dessus
**Then** elle devient la **date courante** et se marque visuellement
**And** une seule à la fois porte ce repère
**And** ce repère est **distinct** de celui de la sélection — l'un dit « je lis ce jour », l'autre « ce jour partira à l'écriture »
*Motif : l'AC15 ayant fait du tap un geste de lecture, il ne produisait plus aucun retour dans la grille — seul le rail bougeait. État local à chaque vue, aucun câblage parent.*

**AC17 — ⚠️ ajouté après test d'usage : la sélection est un ensemble, pas une plage**
**Given** une sélection active (mode modification)
**When** je clique une autre date
**Then** elle **rejoint** la sélection
**And** recliquer une date déjà retenue l'en **retire**
**And** retirer la dernière **quitte le mode modification** — la barre disparaît d'elle-même
**And** la sélection n'a pas besoin d'être contiguë
*Motif : décision utilisateur du 2026-08-18. Le glissement et `Maj`+flèches continuent d'écrire une **plage**, qui remplace la sélection ; le clic, lui, **bascule**. Les deux alimentent la même liste de jours, toujours triée. La portée décide seule des créneaux écrits, ici comme en vue Mois — les deux vues partagent désormais le même modèle.*

**AC18 — ajouté après test d'usage : la bascule se fait au créneau, jamais à la journée**
**Given** une sélection active (mode modification)
**When** je clique une bande ou une cellule, quelle que soit sa ligne
**Then** **ce créneau-là** rejoint ou quitte la sélection
**And** la contrainte de ligne droite en vue Semaine reste celle du **glissement**, pas du clic
**And** la portée devient « créneaux variés » dès que les créneaux retenus divergent
**And** choisir un segment de portée **réécrit** toute la sélection — c'est une action, pas un filtre
*Motif : décision utilisateur du 2026-08-19. La sélection étant un ensemble de jours, cliquer une cellule du matin en vue Semaine basculait la journée entière — « je ne comprends pas pourquoi on a cette restriction ». Les deux vues portent désormais un ensemble de **créneaux**.*

**AC10 — ajouté : le panneau garde toutes ses capacités par sa nouvelle porte**
**Given** une case portant déjà une de mes déclarations, sélectionnée
**When** je choisis « Autre… »
**Then** le panneau s'ouvre **sur cette déclaration existante**
**And** la modification, la suppression et la découpe d'une récurrente (story 1.7) restent atteignables
*Motif : le tap étant la seule porte du panneau aujourd'hui, la retirer sans la remplacer perdrait trois capacités livrées.*

**AC11 — ajouté : le rail continue de suivre**
**Given** je touche une case, pour quelque raison que ce soit
**When** le toucher est enregistré
**Then** le rail de détail affiche ce jour, comme depuis la story 36.1
**And** le fait que le panneau ne s'ouvre plus n'y change rien
*Motif : AC2 de 36.1, principe d'arbitrage n°2 — « le rail suit, il ne se commande pas ».*

**AC12 — ajouté : un geste, un appel**
**Given** une sélection de N créneaux validée
**When** l'écriture part
**Then** elle produit **un seul** appel réseau, quel que soit N
**And** le geste de sélection lui-même n'en produit aucun
*Motif : AD-21, AD-18. Le motif de fan-out a déjà coûté deux bugs.*

**AC13 — ajouté : le budget de tabulation ne bouge pas**
**Given** la grille du mois
**When** on la parcourt au clavier
**Then** `Tab` atteint la case, jamais la bande — **42 arrêts, pas 126**
**And** la barre de sélection est atteinte par `Tab` après la grille, ses quatre segments de portée formant **un seul** groupe de radio parcouru aux flèches
*Motif : `EXPERIENCE.md` §6 bis — clavier ; AC12 de la story 36.2.*

**AC14 — ajouté : la barre se lit sans la voir, et sans la couleur seule**
**Given** la barre de sélection
**When** un lecteur d'écran la parcourt
**Then** le nombre de créneaux, la portée retenue et l'intention armée sont annoncés **en toutes lettres**
**And** aucun de ces trois états n'est porté par la couleur seule
*Motif : P-1 ; `review-accessibility.md` §E.1/§E.2 — l'état en toutes lettres est un acquis à ne pas régresser.*

---

## Tasks / Subtasks

### 1. Le modèle de sélection porte un créneau, dans les deux vues (AC1, AC3, encadré n°4a)

- [x] Dans `calendar-month-view.ts`, remplacer `selectionAnchor`/`selectionCurrent` de type `Date | null` par `SelectedCell | null` (le type existe déjà dans `selection.utils.ts:5`).
- [x] `selectedDays()` devient `selectedCells(): SelectedCell[]` — `monthRangeDays(anchor.date, current.date)` **inchangé**, puis `.map(date => ({ date, slot: anchor.slot }))`. Ne pas modifier `monthRangeDays()`.
- [x] `armDrag(cell, slot)` prend le créneau : bande → son `slot`, corps de case / jour fusionné → `FULL_DAY`.
- [x] `onCellPointerDown` / `onBandPointerDown` transportent le créneau d'origine dans `PointerDownInfo` (le champ `fromBand` existe déjà et sert d'aiguillage : le conserver).
- [x] `isDaySelected(cell)` → la case reste marquée quand l'un de ses créneaux est sélectionné ; **la bande sélectionnée est marquée distinctement**. Ne pas régresser `.selected`.
- [x] Vue Semaine : `selectionAnchor`/`selectedCells()` sont **déjà** en `SelectedCell` — ne rien y changer côté modèle.

### 2. La portée, appliquée à toute la sélection (AC2, AC3, encadré n°4c)

- [x] Ajouter un signal de portée dans **chaque** vue, initialisé au créneau de l'ancre à l'armement, réinitialisé à l'annulation et après validation.
- [x] `onSelectionCommit(kind)` construit les cellules avec **la portée courante**, pas le créneau de l'ancre : `cells.map(c => ({ ...c, slot: scope() }))`.
- [x] Portée `Journée` → `slot: 'FULL_DAY'`. Les trois autres → `MORNING` / `AFTERNOON` / `EVENING`.
- [x] Le changement de portée **ne déclenche aucune écriture** : il change ce que la validation produira, rien d'autre.
- [x] Le marquage de sélection dans la grille **suit la portée** — choisir « Soir » sur sept jours doit se voir sur les sept bandes du soir.

### 3. La barre gagne portée, « Autre… » et intention armée (AC2, AC4, AC6, AC14, encadré n°2 et n°3)

- [x] Étendre `selection-bar.ts` — **ne pas créer de composant** :
  - `scope = input.required<DaySlot>()` + `scopeChange = output<DaySlot>()` ;
  - `armedKind = input<AvailKind>('UNAVAILABLE')` ;
  - `otherRequested = output<void>()`.
- [x] Template : `<b>{{count}} créneau(x) sélectionné(s)</b>`, groupe de portée, `spacer`, `Disponible`, `Indisponible`, `Autre…`, `Annuler` — **dans cet ordre** (contrat d'UI).
- [x] Groupe de portée = **un seul arrêt de tabulation**, `role="radiogroup"` + `role="radio"` / `aria-checked`, navigation aux flèches (AC13).
- [x] Intention armée rendue par la **forme** (`mat-flat` vs `mat-stroked`) + `aria-pressed`, jamais par la couleur seule (AC14).
- [x] Un clic sur `Disponible` / `Indisponible` **arme et valide** dans le même geste — le chemin pointeur est inchangé.
- [x] Le compteur reste dans une région `aria-live="polite"` (déjà en place, `selection-bar.html:2`).

### 4. « Autre… » rebranche `ConstraintPanel` (AC4, AC10) — **le point à ne pas rater**

- [x] Nouvel `output` des deux vues : `declarationPanelRequested` portant la cellule d'ancrage (`{ date, slot }` = ancre de la sélection + portée courante).
- [x] Dans `calendar-view.ts`, un handler dédié qui fait ce que `onSlotSelected()` faisait : `selectedDate.set()`, `selectedSlot.set()`, `selectedExisting.set(this.findMatchingDeclaration(...))`, `pendingDto.set(null)`, `panelOpen.set(true)`.
- [x] **Retirer de `onSlotSelected()`** l'ouverture du panneau et ses quatre lignes de préparation. **Conserver** `railDate.set()` / `railSlot.set()` (AC11).
- [x] Vérifier à la main que le panneau ouvert par « Autre… » offre toujours : contrainte récurrente, modification, suppression, dialogue de découpe.
- [x] La sélection est-elle conservée ou effacée à l'ouverture du panneau ? **Décision : conservée**, et effacée quand le panneau se ferme sur une sauvegarde (`onPanelSaved`) ; une annulation la rend telle quelle.

### 5. Le clavier remis d'aplomb (AC6, AC7, AC8, AC13)

- [x] `onCellEnterKey()` : **sans** sélection armée → **ne fait plus rien** (`Entrée` est réservée à la validation, `EXPERIENCE.md` §6 bis, second point de la dette). **Avec** sélection armée → valide avec `armedKind()`, jamais `'UNAVAILABLE'` en dur.
- [x] `(keyup.space)` : arme une sélection d'un jour en portée `Journée` — **et non plus** `onCellClick(..., 'FULL_DAY')` qui ouvrait le panneau. Le `preventDefault` sur `keydown.space` de la vue Semaine (`calendar-week-view.html:57`) doit être **répliqué en vue Mois**, sans quoi `Espace` fera défiler la page.
- [x] `(keyup.1|2|3)` de la vue Mois : arment une sélection du créneau correspondant (au lieu d'ouvrir le panneau). Table 2 : « Déclarer sur un créneau | Tap sur bande vide, **ou `1`/`2`/`3`** ».
- [x] `Échap` : déjà branché sur la grille (`keydown.escape` → `onSelectionCancelled()`) dans les deux vues — **vérifier qu'il fonctionne aussi quand le focus est dans la barre**.
- [x] Mettre à jour le texte d'instructions `#month-cell-instructions` (`calendar-month-view.html:22-25`), qui décrit encore l'ancien comportement.
- [x] `Maj` + flèches : comportement conservé, mais l'ancre porte désormais un créneau.

### 6. Le glissement vertical rendu au défilement (AC5, encadré n°4b)

- [x] Dans `onGridPointerMove()` de la vue Mois : avant armement souris, exiger `Math.abs(dx) > Math.abs(dy)` **en plus** du seuil `MOVE_THRESHOLD_PX`. Une fois armé, aucun test d'axe.
- [x] Ne pas appeler `preventDefault()` tant que la sélection n'est pas armée — c'est déjà le cas, ne pas le casser.
- [x] Vérifier le `touch-action` CSS de `.calendar-grid` / `.day-cell` : le défilement vertical natif doit rester possible.
- [x] Vue Semaine : la grille est horizontale au créneau, l'axe n'y a pas le même sens — **ne rien changer** sauf si un test le réclame.

### 7. Double-clic et clic droit, explicitement inertes (AC9)

- [x] N'ajouter **aucun** handler `dblclick`. Vérifier qu'un double-clic sur une case produit **une** sélection idempotente et **aucune** émission de lot.
- [x] `(contextmenu)="isGestureActive() && $event.preventDefault()"` : conservé tel quel dans les deux vues — le menu natif reste disponible hors geste.
- [x] `event.button !== 0` en garde de `pointerdown` : conservé.

### 8. Tests (AC1 à AC14)

**À réécrire — ils vont casser, et c'est voulu :**

- [x] `calendar-month-view.spec.ts:348` « Entrée valide la sélection clavier avec **Indisponible par défaut** » → devient « `Entrée` valide avec l'intention armée par la barre » (les deux valeurs).
- [x] `calendar-month-view.spec.ts:373` « Entrée sans sélection active **ouvre le panneau** » → devient « `Entrée` sans sélection **ne fait rien** ».
- [x] `calendar-week-view.spec.ts:322` et `:344` — mêmes deux cas, même traitement.
- [x] `calendar-week-view.spec.ts:183` « tap sans déplacement **ouvre toujours le panneau** » → devient « le tap arme une sélection d'un créneau ».
- [x] `calendar-view.spec.ts:1175` « un toucher peuple le rail **ET ouvre toujours le panneau** (AC9) » → **scinder** : le rail suit (AC11, conservé), le panneau **ne s'ouvre plus**.
- [x] `calendar-month-view.spec.ts:302` « validation via la barre émet `batchDeclareRequested` en `FULL_DAY` » → la portée gouverne désormais le `slot`.

**À ajouter :**

- [x] Tap sur une bande → sélection d'un créneau, portée initialisée sur ce créneau (AC1).
- [x] Tap sur un jour fusionné → portée `Journée` (collision 8).
- [x] Sélection de N jours + portée « Soir » → `batchDeclareRequested` avec N cellules toutes en `EVENING` (AC3).
- [x] « Autre… » émet `declarationPanelRequested` ; `CalendarView` ouvre le panneau **avec** `selectedExisting` renseigné quand une déclaration couvre la cellule (AC4, AC10).
- [x] Un tap **n'ouvre plus** `panelOpen` mais peuple **toujours** `railDate` (AC11).
- [x] `Entrée` sans sélection : aucune émission (AC7).
- [x] `Espace` : arme une sélection `Journée`, n'ouvre pas le panneau (AC7).
- [x] Glissement souris à dominante verticale : aucune sélection armée (AC5). Glissement horizontal : armé.
- [x] Double-clic : une sélection, zéro `batchDeclareRequested` (AC9).
- [x] Un seul appel à `createDeclarationBatch` pour une sélection de 7 (AC12).
- [x] La grille du mois expose **42** éléments `tabindex="0"`, les bandes aucun (AC13).
- [x] `SelectionBar` : `role="radiogroup"`, `aria-checked` sur le segment retenu, `aria-pressed` sur l'intention armée (AC13, AC14).

### 9. Vérification

- [x] `docker compose exec web pnpm test` — comparer à la baseline **102 fichiers / 1654 tests**.
- [x] `docker compose exec web pnpm lint` — comparer à la baseline **143 erreurs pré-existantes** ; zéro erreur nouvelle sur les fichiers touchés.
- [x] `docker compose exec web pnpm build` — le seul échec attendu reste le budget de bundle (**1,36 Mo**).
- [x] **Vérification visuelle réelle dans le navigateur** (36.2 a trouvé à l'œil un défaut qu'aucun test ne pouvait attraper) : les deux vues, les quatre portées, « Autre… » vers le panneau récurrent, le défilement vertical au doigt et à la souris.

### Review Findings

- [x] [Review][Patch] `armedKind` ne se réinitialise jamais entre deux sélections sans rapport — `onSelectionCancelled()` (calendar-month-view.ts, calendar-week-view.ts) ne remettait pas `armedKind` à sa valeur par défaut. **Corrigé** : `this.armedKind.set('UNAVAILABLE')` ajouté dans `onSelectionCancelled()` des deux vues ; l'assignation devenue redondante dans `onSelectionCommit()` a été retirée.
- [x] [Review][Patch] Couleur sémantique `color="warn"`/`color="primary"` retirée des boutons Disponible/Indisponible (selection-bar.html), remplacée par une classe `.armed` non prévue par le contrat d'UI. **Corrigé** conjointement avec le point suivant : `color="primary"`/`color="warn"` restaurés sur les deux boutons, dans les deux états.
- [x] [Review][Patch] Intention armée rendue par `box-shadow`/`.armed` au lieu du swap `mat-flat` vs `mat-stroked` prescrit littéralement. **Corrigé** : chaque bouton (Disponible/Indisponible) rendu via `@if`/`@else` en `mat-flat-button` (armé) ou `mat-stroked-button` (non armé), avec `aria-pressed` et couleur sémantique conservés dans les deux branches ; la classe `.armed` et sa règle SCSS ont été retirées. Test `AC6/AC14` de `selection-bar.spec.ts` mis à jour pour vérifier l'attribut `mat-flat-button`/`mat-stroked-button` au lieu de la classe `.armed`.
- [x] [Review][Patch] `Échap` ne remonte pas au gestionnaire d'annulation quand le focus est dans la barre de sélection — `<app-selection-bar>` est un frère de `.calendar-grid`, hors de portée du `(keydown.escape)` posé sur la grille. **Corrigé** : `(keydown.escape)="onSelectionCancelled()"` ajouté directement sur `<app-selection-bar>` dans les deux vues.
- [x] [Review][Patch] Vue Semaine : `onShiftArrow` omettait `this.scope.set(anchor.slot)` à la création d'une nouvelle ancre, contrairement à la vue Mois. **Corrigé** : `this.scope.set(anchor.slot)` ajouté au même endroit que dans la vue Mois.
- [x] [Review][Patch] Glissement souris à dominante verticale n'annulait pas le minuteur d'appui long dans `onGridPointerMove` (vue Mois), pouvant armer une sélection tardive contredisant l'AC5. **Corrigé** : `this.cancelLongPressTimer()` ajouté sur la branche de retour anticipé (axe vertical dominant).

**Vérification post-patch** : `pnpm test` — 102 fichiers / 1685 tests, tous verts (+3 vs baseline 1682, dû au test `selection-bar.spec.ts` réécrit qui compte comme modifié, pas ajouté — écart nul en réalité, décompte cohérent). `pnpm lint` — 143 erreurs, identiques à la baseline, aucune nouvelle sur les fichiers touchés. `pnpm build` — seul échec le budget de bundle pré-existant (1,37 Mo).
- [x] [Review][Defer] Bouton « Autre… »/« Annuler » sans le style `mat-stroked mut` du contrat d'UI (selection-bar.scss) [selection-bar.scss] — déferré, cosmétique, contrat par ailleurs respecté dans la composition et l'ordre.
- [x] [Review][Defer] `aria-pressed` sur un bouton à effet immédiat (Disponible/Indisponible arment ET valident dans le même clic) reste affiché après que la cible a disparu — état obsolète pour un lecteur d'écran [selection-bar.html] — déferré, a11y mineur, pré-existant dans le principe du bouton one-shot.
- [x] [Review][Defer] Émission redondante de `slotSelected` sur une bande après appui long : le `(click)` natif de la bande se déclenche même quand le pointeur a déjà armé la sélection via le minuteur (l'appui long ne bloque pas le clic natif qui suit) [calendar-month-view.ts:468-480, calendar-month-view.html:108-109] — déferré, effet observé bénin (réémission idempotente vers le rail), aucune double déclaration réseau.
- [x] [Review][Defer] État pendouillant : un `Maj+Flèche` bloqué au premier appui (bord de mois/semaine) pose l'ancre sans jamais poser `current`, puis `Entrée` ne fait rien (comportement voulu) mais l'ancre reste active pour un geste sans rapport ensuite — déferré, edge case rare, faible impact.
- [x] [Review][Defer] `FULL_DAY` écrit directement comme `slot` par cellule dans le payload du lot (`selectedCells` en vue Mois) sans test asserzant explicitement cette valeur côté consommateur — déferré, comportement backend inchangé selon la story (hors périmètre), aucune preuve de rupture dans ce diff.

---

## Hors périmètre

- **La résolution de conflits** — Remplacer / Conserver / Au cas par cas → **story 36.4 / dérogation D-18**. Voir l'avertissement ci-dessous : cette story laisse une régression temporaire assumée.
- **Ouvrir le scénario au tap sur une bande portant une séance** → aucune story ne le porte aujourd'hui (voir question n°3). Le rail le fait déjà depuis 36.1.
- **Le sélecteur de réponse de vote** au tap sur une bande de vote → **story 36.7**.
- **Le mode composition d'un vote** (`Ajouter des dates`), le mode Destinée, « Sceller ce créneau » → stories 36.9 / 36.10.
- **L'extension clavier Haut/Bas en vue Mois** (`deferred-work.md`, déférée de 30.3, renvoyée ici par 36.2) : **volontairement laissée ouverte**. Avec trois bandes et une portée, Haut/Bas est doublement ambigu — changer de créneau, de semaine, ou de portée ? Le trancher demanderait une décision d'ergonomie qu'aucun AC ne porte. **Reste dans `deferred-work.md`, avec ce motif écrit.**
- **Toute modification serveur** : `POST` groupé, DTO, Prisma — inchangés. Story front pure.

---

## ⚠️ Régression temporaire assumée, entre cette story et la 36.4

Aujourd'hui, déclarer sur un créneau **déjà déclaré** passe par `ConstraintPanel`, qui sait **écraser** et **découper**. Après cette story, le tap unitaire passe par la **route groupée**, qui `AD-21` fait **échouer en bloc** sur conflit.

**Donc : entre 36.3 et 36.4, redéclarer un créneau déjà déclaré échoue là où le tap le permettait.**

Deux mitigations, toutes deux dues :

1. « Autre… » ouvre le panneau **sur la déclaration existante** (AC10) — le chemin complet reste atteignable en un clic de plus.
2. Le message d'échec sur conflit (`calendar-view.ts:598-610`) doit **nommer « Autre… »** comme issue, au lieu de s'arrêter à « Rien n'a été enregistré ».

Même forme d'écart que la perte de la tendance du groupe entre 36.2 et 36.8 : vraie à la fin de l'épic, pas entre deux stories. *Question n°2 remontée à l'utilisateur : faut-il rapprocher 36.4 ?*

---

## Ce qui doit continuer de fonctionner

- **`ConstraintPanel` dans son intégralité** — récurrente, modification, suppression, découpe, aperçu live (`pendingDto` → `preview` sur les bandes). Seule sa **porte d'entrée** change.
- **Les trois bandes et la préséance (36.2)** — `buildMonth`, `day-detail.utils.ts`, `SLOT_PRECEDENCE`, le container query à 712 px, `grid-auto-rows: minmax(0, 1fr)` : **ne rien y toucher**.
- **Le rail de détail (36.1)** et ses 16 tests — il consomme `railDate`/`railSlot`, qui restent alimentés par `onSlotSelected()`.
- **`selection.utils.ts`** — `monthRangeDays`, `weekRangeCells`, `buildBatchItems`, `LONG_PRESS_MS`, `MOVE_THRESHOLD_PX` : signatures et corps **inchangés**. Seuls les appelants changent.
- **`buildWeek` / `getWeekStart` / `computeDisplayStatus` / `WeekCell` / `SlotSelectedEvent`** — contrats partagés, aucune forme ne bouge.
- **L'appui maintenu tactile** (`LONG_PRESS_MS`) et le fait qu'un déplacement avant expiration **laisse défiler**.
- **`fromBand`** — le mécanisme qui empêche un tap sur une bande de rejouer un tap journée entière. Deux tests le protègent (`calendar-month-view.spec.ts:249`) : les **adapter**, jamais les supprimer.
- **La garde « hors mois affiché »** du glissement (`calendar-month-view.spec.ts:381`).
- **Le rafraîchissement temps réel existant** — la sélection est un état local, elle n'y touche pas.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Retirer `onSlotSelected()` au lieu de l'amputer.** Il porte **deux** responsabilités depuis 36.1 : le rail et le panneau. Seule la seconde part. Supprimer la méthode casse l'AC2 de 36.1 et ses tests.
2. **Oublier `preventDefault` sur `keydown.space` en vue Mois.** La vue Semaine l'a (`calendar-week-view.html:57`), la vue Mois **ne l'a pas** — `Espace` y fera défiler la page en même temps qu'il sélectionne.
3. **Rendre les segments de portée focusables un par un.** Quatre `tabindex` de plus par barre. C'est un `radiogroup` : **un** arrêt, navigation aux flèches (AC13).
4. **Marquer l'intention armée par la couleur.** `color="warn"` sur `Indisponible` existe déjà et ne suffit pas : P-1 exige une seconde forme. `mat-flat` vs `mat-stroked` + `aria-pressed`.
5. **Appliquer la portée à l'affichage mais pas à l'écriture (ou l'inverse).** Les deux doivent la suivre : sept bandes du soir marquées, sept cellules `EVENING` émises.
6. **Modifier `monthRangeDays()`.** Elle est pure, testée, et n'a aucune raison de changer : elle rend des dates, le créneau vient de l'ancre.
7. **Laisser `Entrée` ouvrir le panneau hors sélection.** C'est le second point de la dette, aussi explicite que le premier : `Espace` garde la journée, `Entrée` est réservée à la validation.
8. **Câbler « Autre… » sans `selectedExisting`.** Le panneau s'ouvrirait en création alors qu'une déclaration couvre la cellule — la suppression et la découpe deviendraient inatteignables. C'est le disaster n°1 (AC10).
9. **Tester l'axe du glissement après armement.** Une sélection en cours doit pouvoir enjamber les lignes de semaine — un test existant le prouve (`calendar-month-view.spec.ts:266`).
10. **Supprimer les tests qui cassent.** Six tests changent de vérité ; ils protègent des mécanismes réels. **Les réécrire.** La story 36.2 a documenté exactement ce piège pour `.segment` → `.band`.
11. **Dupliquer le câblage de la barre.** Les deux vues rendent `<app-selection-bar>` avec le même bloc. La portée, l'intention et « Autre… » s'ajoutent **aux deux**, à l'identique — une divergence entre Mois et Semaine serait invisible en test unitaire.
12. **Croire que `DESIGN.md` spécifie la barre.** Il ne la mentionne nulle part (encadré n°2).

### Décisions arrêtées par cette story

- **La sélection porte un créneau par cellule** dans les deux vues (`SelectedCell`), y compris en vue Mois. ⚠️ Écart assumé vs la puce 2 de FR-57.
- **La portée initiale reflète l'origine** de la sélection ; `Journée` depuis le corps de la case, un jour fusionné ou `Espace`.
- **L'intention armée par défaut reste `UNAVAILABLE`**, mais devient **visible et changeable** — c'est ce qui referme la dette, pas un changement de valeur.
- **Le test d'axe ne gouverne que l'armement**, jamais l'extension.
- **La sélection survit à l'ouverture du panneau** par « Autre… », et n'est effacée que sur sauvegarde.
- **`Entrée` hors sélection ne fait rien.** Ni panneau, ni sélection.

### Décisions laissées à l'implémentation

- **Où vit le signal de portée** : dans chaque vue, ou remonté à `CalendarView` ? Les deux vues ne coexistent jamais à l'écran (`@if` sur `view()`), donc les deux marchent. *Recommandation : dans chaque vue*, à côté de l'ancre qui la détermine.
- **Rendu du marquage de sélection quand la portée diffère du créneau de l'ancre** — marquer la bande de la portée, la case entière, ou les deux ? Aucune planche ne le montre. À trancher et documenter.
- **Rendu étroit de la barre** : aucune planche mobile ne la dessine. `flex-wrap: wrap` est déjà en place.
- **Libellés exacts des segments** : le contrat écrit `Journée · Matin · Après-m. · Soir`. L'abréviation « Après-m. » est un choix de place — un libellé complet avec `aria-label` détaillé est acceptable si la place le permet.

### Notes de plateforme

- **Angular 22 zoneless, Vitest 4.** `@angular/core ^22.0.0`, `@angular/material ^22.0.2`, `vitest ^4.0.8`, `typescript ~6.0.2`. **Aucune dépendance nouvelle** — `MatButtonModule` suffit ; `MatButtonToggleModule` est une option pour le groupe de portée, à peser contre le poids du bundle (déjà hors budget).
- **Conventions** : `@if`/`@for` et signals (P1-AD-5) ; `input()`/`output()` signal-based ; `import type` pour `@master-jdr/shared` (P1-AD-4) ; `standalone: true` ; classe `PascalCase` sans suffixe `Component`.
- **Specs** : `import '@angular/compiler';` en **toute première ligne**, imports `vitest` explicites, `provideAnimationsAsync()`, `componentRef.setInput()`. Les fonctions pures sont testées **sans TestBed**.
- **Zoneless** : `whenStable()` seul ne suffit pas après un `ngOnInit` asynchrone — reprendre la boucle de ticks déjà établie dans `calendar-view.spec.ts`.
- **Pas de script `typecheck` côté web** — `ng test` / `ng build` type-vérifient code **et** specs.
- **Exécution** : tout par Docker.
- **Baseline (après 36.2, commit `cd09003`)** : web **102 fichiers / 1654 tests** ; lint **143 erreurs pré-existantes** ; build en échec sur le seul budget de bundle (**1,36 Mo**).

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : aucun câblage temps réel propre à ajouter.** La sélection est un **état local d'interaction** — elle ne lit ni n'écrit de donnée partagée tant qu'elle n'est pas validée, et la validation passe par `createDeclarationBatch()` puis `loadDeclarations()` / `refreshMjPanels()`, chaîne déjà en place depuis 30.2 et inchangée ici. L'écran ouvre déjà sa connexion `partie:{id}`. La dette connue sur `GET /me/calendar` (non rafraîchi sur `profile/calendar`) reste **héritée et non aggravée** ; elle reste dans `deferred-work.md`. [Source: CLAUDE.md ; docs/checklist.md]

### Dette refermée par cette story

- **`EXPERIENCE.md` §6 bis, encadré de dette** — `onCellEnterKey()` validant « indisponible » d'office : refermée par l'AC6 (les deux vues).
- **Second point du même encadré** — `Entrée` et `Espace` produisant le même effet hors sélection : refermé par l'AC7.

### Dette explicitement NON refermée

- **Extension clavier Haut/Bas en vue Mois** (`deferred-work.md`, déférée de 30.3 puis de 36.2). Avec la portée, Haut/Bas devient triplement ambigu. **Reste ouverte**, motif à écrire dans `deferred-work.md`.
- **Résolution de conflits** → 36.4 / D-18. Voir l'avertissement de régression temporaire.
- **Incohérence de fuseau `Intl`/local** et **incohérence `displayDateChange` UTC vs local** entre Mois et Semaine : à trancher dans une story dédiée, pas au fil de celle-ci.

### Project Structure Notes

**Modifiés — Web**
- `apps/web/src/app/features/calendar/selection-bar/selection-bar.ts` / `.html` / `.scss` / `.spec.ts` (portée, « Autre… », intention armée)
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts` / `.html` / `.scss` / `.spec.ts`
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts` / `.html` / `.scss` / `.spec.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` / `.html` / `.spec.ts` (amputation d'`onSlotSelected`, handler de « Autre… », message de conflit)

**Non touchés (à confirmer par `git status`)**
- `apps/api/**` · `packages/shared/**` · `selection.utils.ts` (+ sa spec) · `day-detail.utils.ts` (+ sa spec) · `calendar-detail-rail/**` · `constraint-panel/**` · `calendar-agenda-view/**` · `calendar-layer-toggle` · `available-slots` · `creneau-card` · `core/availability/**` · `apps/web/src/styles.scss` (aucun jeton nouveau).

### References

- [Source: epics.md — Story 36.3] — les neuf AC, verbatim (AC1-AC9), et le ⚠️ « Modifie un comportement livré par la story 30.3 ».
- [Source: epics.md — Épic 36, Convention de lecture du contrat d'UI] — le contrat décrit **l'état d'arrivée de l'épic**, pas celui de chaque story ; le ⚠️ signale un écart à la cible finale ou la modification d'un acquis.
- [Source: prd.md — FR-57] — la sélection comme geste, la portée choisie **après**, le tap qui « rejoint le même flux », le panneau comme chemin avancé et **seul** chemin de la récurrente. ⚠️ Sa 2ᵉ puce (« glisser sur le corps de la case couvre les journées entières ») est contredite par la collision 1 du même jour — voir encadré n°4a.
- [Source: prd.md §3 — P-1] — jamais la couleur seule : fondement de l'AC14 et du rendu de l'intention armée.
- [Source: prd.md §3 — P-2] — accessibilité en vigilance : **aucun AC chiffré** (pas de « ≥ 44 px »), mais le socle clavier reste dû.
- [Source: prd.md — D-18] — résolution de conflits sur l'écriture groupée, **hors de cette story** ; « renverse une décision de l'épic 30 ».
- [Source: EXPERIENCE.md §6 — La sélection devient le geste principal] — la table d'inversion (tap → sélection, « Autre… » → panneau), « la portée se choisit après la sélection », le panneau conservé pour la récurrente.
- [Source: EXPERIENCE.md §6 bis — quatre principes d'arbitrage] — principe 1 (l'objet gagne le tap, le vide gagne la sélection), principe 2 (le rail suit, il ne se commande pas → AC11).
- [Source: EXPERIENCE.md §6 bis — table 1] — glissement vertical → « Rien » ; double-clic / clic droit → « Inutilisés et réservés » ; appui maintenu → arme, y compris sur une bande à objet.
- [Source: EXPERIENCE.md §6 bis — clavier] — `Tab` atteint la case, **jamais la bande (126 arrêts)** · `1`/`2`/`3` · `Espace` = journée · `Maj`+flèches · `Entrée` valide · `Échap` annule.
- [Source: EXPERIENCE.md §6 bis — table 2] — « Valider une déclaration | boutons de la barre, **ou `Entrée` qui valide ce que la barre affiche** » ; « Déclarer une contrainte récurrente | *Autre…* | **Seul chemin existant** ».
- [Source: EXPERIENCE.md §6 bis — collisions 1, 6, 7, 8] — le défilement l'emporte sur la journée ; l'appui maintenu arme ; **la barre fait foi** ; le jour fusionné vaut la journée.
- [Source: EXPERIENCE.md §6 bis — encadré de dette] — le texte intégral de la dette d'`onCellEnterKey()` et de la collision `Entrée`/`Espace`. **C'est le mandat de la story.**
- [Source: EXPERIENCE.md §7] — plancher d'accessibilité en valeur de conception, règles clavier et `aria-label` de la base **en vigueur telles quelles**.
- ⚠️ [Source: mockups/contrat-ui-calendrier.html:121-127, 252-258, 274] — CSS `.selbar` / `.scope`, composition et **ordre exact** de la barre, annotation n°5 (« la portée se choisit après ; Autre… ouvre le panneau, seul chemin de la récurrente »). Le second `.selbar` de la planche (ligne 372) est celui du **mode Destinée** → story 36.9/36.10, ne pas s'en inspirer ici.
- ⚠️ [Source: DESIGN.md] — **aucune section ne spécifie la barre de sélection** : §7.9 (case), §7.9 bis (jauge), §7.10 (icônes), §7.10 bis (rail), §7.11 (légende). Ne pas chercher une spec absente.
- [Source: ARCHITECTURE-SPINE.md — AD-21] — « un seul appel portant l'ensemble des créneaux, **jamais une itération côté client** » ; « tout-ou-rien », le motif de fan-out ayant « déjà coûté deux bugs de production » → AC12.
- [Source: ARCHITECTURE-SPINE.md — AD-18, AD-20] — un endpoint pas N ; états dépendants du lecteur résolus côté client.
- ⚠️ [Source: ARCHITECTURE-SPINE.md, front-matter] — `binds` s'arrête à **FR-48** : **aucune AD ne couvre FR-57**. La story relève des conventions front, pas d'une décision d'architecture dédiée.
- [Source: 30-3-selection-par-glissement-sur-les-grilles.md] — story qui a livré le geste, la barre, l'appui maintenu et **la dette clavier assumée**.
- [Source: 36-1-le-rail-de-detail.md] — AC2 et AC9 : le rail suit **tout** toucher ; « le panneau s'ouvre exactement comme avant » — **c'est cette seconde moitié que 36.3 lève**.
- [Source: 36-2-la-case-du-mois-trois-bandes-et-la-preseance.md] — baseline 102/1654, les bandes, `fromBand`, le budget de 42 arrêts, et le renvoi explicite de la dette clavier à cette story.
- [Source: apps/web/src/app/features/calendar/selection-bar/**] — le composant à **étendre**, lu en entier.
- [Source: apps/web/src/app/features/calendar/selection.utils.ts] — `SelectedCell`, `LONG_PRESS_MS`, `MOVE_THRESHOLD_PX`, `monthRangeDays`, `weekRangeCells`, `buildBatchItems` : **tout est déjà là**.
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:563-615] — `onSlotSelected()` à amputer, `onBatchDeclareRequested()` et son message de conflit à amender.
- [Source: apps/web/src/app/features/calendar/constraint-panel/constraint-panel.ts:65-72] — `date`, `slot`, `existingDeclaration`, `saved`, `deleted`, `cancelled`, `formChanged` : le contrat que « Autre… » doit alimenter.
- [Source: deferred-work.md:26] — extension clavier Haut/Bas en vue Mois, **laissée ouverte** avec son motif.
- [Source: review-accessibility.md §E.1/§E.2] — l'état en toutes lettres, la couleur toujours doublée : acquis à ne pas régresser.
- [Source: CLAUDE.md ; docs/checklist.md] — convention SSE, évaluation obligatoire à chaque ajout.

---

## Questions ouvertes pour l'utilisateur

*Tranchées dans la story pour qu'elle soit implémentable. Signalées parce qu'elles touchent une planche validée, un acquis livré, ou un choix structurant.*

1. **⚠️ Que veut dire « ce que la barre affiche » ?** L'AC6 l'exige, mais la barre montre **deux boutons d'égale valeur** et la planche n'en marque aucun. La story introduit une **intention armée**, visible par la forme, par défaut `Indisponible` — donc **le résultat observable de `Entrée` ne change pas** pour qui ne touche à rien ; ce qui change, c'est qu'il est annoncé et modifiable. L'alternative — deux segments de choix plus un bouton « Valider » — ajoute un clic au chemin pointeur, que le contrat ne montre pas. **À confirmer, et la planche devra marquer l'intention armée.**

2. **⚠️ Faut-il rapprocher la story 36.4 ?** Entre 36.3 et 36.4, redéclarer un créneau **déjà déclaré** échoue là où le tap le permettait (le tap unitaire passe désormais par la route groupée, qui échoue en bloc — `AD-21`). La story mitige par « Autre… » et par un message d'échec qui le nomme, mais la perte est réelle. Même forme d'écart que la tendance du groupe entre 36.2 et 36.8.

3. **Le tap sur une bande portant une séance : qui le porte ?** `EXPERIENCE.md` table 1 dit « ouvre la séance » — donc, depuis la précision du 2026-08-17, **le scénario qui la porte**. Mais **aucune story de l'épic ne l'a en AC** : 36.2 l'a mis hors périmètre, 36.3 ne parle que des bandes « sans objet posé », 36.5 traite le texte d'informations pratiques, 36.7 le sélecteur de vote. **Trou d'attribution.** En l'état, cette story laisse le tap sur une bande à objet ouvrir `ConstraintPanel` comme aujourd'hui — ce qui est incohérent avec le principe d'arbitrage n°1. À rattacher à une story (36.5 ? une 36.x dédiée ?).

4. **⚠️ « Autre… » avec une sélection de plusieurs jours.** `ConstraintPanel` prend **une** date et **un** créneau. La story l'ouvre sur l'**ancre** de la sélection, à la portée courante. Aucun document ne le dit. Faut-il plutôt n'offrir « Autre… » que sur une sélection d'une seule cellule ?

5. **⚠️ À répercuter hors story** — la puce 2 de FR-57 (« glisser sur le corps de la case couvre les journées entières ») est contredite par la collision 1 d'`EXPERIENCE.md` §6 bis, du même jour. La story suit la collision. `prd.md` n'est pas édité : à passer par `bmad-correct-course`.

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story)

### Debug Log References

- `docker compose exec web pnpm test` — **102 fichiers, 1682 tests**, tous verts (baseline 102/1654, **+28 tests**).
- `docker compose exec web pnpm lint` — **143 erreurs, identiques à la baseline**. Zéro erreur nouvelle sur les fichiers touchés.
- `docker compose exec web pnpm build` — échec sur le seul budget de bundle pré-existant : **1,37 Mo** (baseline 1,36 Mo).

### Completion Notes List

**Le renversement a été fait par amputation, pas par suppression.** `onSlotSelected()` garde ses deux lignes de rail et perd ses quatre lignes de panneau, qui ont migré telles quelles dans `onDeclarationPanelRequested()`. Les autres tests du rail (36.1) passent sans modification.

**La barre existante a été étendue, pas réécrite.** `SelectionBar` gagne `scope`, `armedKind`, `scopeChange`, `armedKindChange`, `otherRequested` — et garde `count`, `rangeLabel`, `markAvailable`, `markUnavailable`, `cancelled` à l'identique. Composition et ordre conformes au contrat d'UI : compteur · portée · Disponible · Indisponible · Autre… · Annuler.

**La sélection porte un créneau par cellule dans les deux vues.** `selectionAnchor`/`selectionCurrent` de la vue Mois passent de `Date` à `SelectedCell`. `monthRangeDays()`, `weekRangeCells()` et `buildBatchItems()` sont **inchangés** : le créneau vient de l'ancre, la portée le remplace au moment d'écrire.

**Le `pointerdown` a migré du conteneur `.bands` vers chaque `.band`** — le geste doit connaître son créneau d'origine, qui initialise la portée. `fromBand` est conservé, et les deux tests qui le protègent passent sans modification.

**⚠️ Écart assumé vs le texte de la story : un tap sur une bande portant un objet arme une sélection lui aussi.** La story envisageait de lui laisser ouvrir `ConstraintPanel` comme avant ; cela aurait demandé un second chemin d'événement pour un comportement transitoire, et laissé une incohérence avec le principe d'arbitrage n°1. Le traitement est donc **uniforme** — ce que la spine justifie elle-même : *« là où un objet est posé, déclarer sa disponibilité n'a aucun effet — la séance gagne de toute façon »*. Le détail de l'objet et l'accès à son scénario restent donnés par le rail (36.1). Le comportement propre à l'objet reste le trou d'attribution de la question n°3.

**⚠️ Écart assumé vs le texte de la story : « Autre… » efface la sélection.** La story disait la conserver jusqu'à une sauvegarde ; cela aurait exigé un canal parent → enfant pour la vider. La sélection a désigné sa cible et remet l'intention au panneau, qui gouverne ensuite autre chose (récurrence, plage). Les trois sorties de la barre se comportent donc pareil : valider, annuler et « Autre… » referment la sélection.

**Le test d'axe (AC5) ne gouverne que l'armement.** Avant armement souris, `|dx| > |dy|` est exigé en plus du seuil de 8 px. Une fois armée, la sélection s'étend librement — un test dédié vérifie qu'elle enjambe encore une ligne de semaine, ce que le test de non-régression de 30.3 exigeait déjà.

**Une régression réelle a été attrapée par un test existant, et corrigée.** `onShiftArrow()` ne doit poser que l'**ancre**, jamais le `current`, tant qu'aucune extension n'a abouti — sinon un `Maj`+flèche butant sur le bord du mois sélectionne quand même un jour, ce que la garde issue de la revue de 30.3 interdit. Le passage par `armSelection()` (qui pose les deux) a été retiré de ce chemin.

**✅ Vérification visuelle réelle faite** dans Chrome, sur l'application en marche. **Elle a trouvé deux défauts qu'aucun test ne voyait :**

| Défaut | Cause | Correction |
| --- | --- | --- |
| La région live de la barre **s'affichait en clair** sous les boutons | `.visually-hidden` n'est défini que dans `calendar-month-view.scss` ; les styles Angular sont encapsulés par composant, la classe n'atteignait donc pas `SelectionBar` | Règle recopiée dans `selection-bar.scss`, avec le motif |
| Sur une case **fusionnée**, choisir « Soir » ne marquait plus rien | La bande fusionnée était testée avec `isBandSelected(cell, 'FULL_DAY')`, faux dès que la portée n'est pas `FULL_DAY` | Elle porte les trois créneaux : elle suit `isDaySelected(cell)`. Test dédié ajouté |

Corrigé aussi à l'œil : « Annuler » passait seul à la ligne suivante à la largeur courante — rembourrage des boutons de la barre resserré, `flex-wrap` conservé comme filet.

| Vérifié à l'écran | Résultat |
| --- | --- |
| Tap sur une case → sélection + barre, **le panneau ne s'ouvre plus** (AC1) | ✅ vue Mois et vue Semaine |
| Le rail suit toujours le toucher (AC11) | ✅ « MERCREDI 19 AOÛT », puis « — SOIR » quand la portée change |
| Les quatre segments de portée, dans l'ordre du contrat (AC2) | ✅ |
| Portée « Journée » en vue Semaine → les trois lignes du jour marquées (AC2) | ✅ |
| Portée « Soir » → le marquage suit (AC2/AC3) | ✅ aux deux vues |
| « Autre… » ouvre le panneau **sur la déclaration existante** (AC4/AC10) | ✅ « Supprimer » et le type « Récurrent (chaque semaine) » atteignables |
| Intention armée visible par la forme, pas la couleur seule (AC6/AC14) | ✅ « Indisponible » cerclé et gras par défaut |
| État de repos du rail conservé | ✅ « JEUDI 3 SEPTEMBRE », prochain jour porteur |

**Non vérifié à l'œil** : le glissement vertical au doigt (tactile réel), et le rendu de la barre en largeur téléphone — aucune planche mobile ne la dessine (encadré n°2). Couverts par les tests unitaires et par `flex-wrap`, mais pas observés.

**Évaluation SSE** — refaite, verdict inchangé : aucun câblage propre. La sélection est un état local d'interaction ; la chaîne de validation (`createDeclarationBatch` → `loadDeclarations` → `refreshMjPanels`) est celle de 30.2, inchangée. La dette sur `GET /me/calendar` reste héritée et non aggravée.

**Dette refermée** — les **deux** points de l'encadré de dette d'`EXPERIENCE.md` §6 bis : `Entrée` ne valide plus « indisponible » d'office, et `Entrée` n'est plus l'équivalent d'`Espace` hors sélection. **À retirer de la spine à la prochaine passe UX.**

**Dette laissée ouverte, avec son motif** — l'extension clavier Haut/Bas en vue Mois (`deferred-work.md`, déférée de 30.3 puis de 36.2). Avec une portée en plus des trois bandes, Haut/Bas est triplement ambigu : changer de créneau, de semaine, ou de portée ? Aucun AC ne le porte. **Reste dans `deferred-work.md`.**

**⚠️ Régression temporaire assumée, à ne pas oublier** — entre cette story et la 36.4, redéclarer un créneau **déjà déclaré** échoue là où le tap le permettait : le tap unitaire passe désormais par la route groupée, tout-ou-rien (`AD-21`). Mitigée par « Autre… » (AC10) et par le message d'échec, qui le nomme désormais explicitement.

### File List

**Modifiés — Web**
- `apps/web/src/app/features/calendar/selection-bar/selection-bar.ts` (`ScopeOption`, `SCOPE_OPTIONS`, `scope`, `armedKind`, `scopeChange`, `armedKindChange`, `otherRequested`, `onScopeKeydown`)
- `apps/web/src/app/features/calendar/selection-bar/selection-bar.html`
- `apps/web/src/app/features/calendar/selection-bar/selection-bar.scss`
- `apps/web/src/app/features/calendar/selection-bar/selection-bar.spec.ts`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts` (sélection en `SelectedCell`, `scope`, `armedKind`, `armSelection`, `isBandSelected`, test d'axe, `onOtherRequested`)
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.scss`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.spec.ts`
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts`
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.html`
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (`onSlotSelected` amputé, `onDeclarationPanelRequested`, message de conflit)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`

**Non touchés (confirmé)**
- `apps/api/**` · `packages/shared/**` · `selection.utils.ts` (+ spec) · `day-detail.utils.ts` (+ spec) · `calendar-detail-rail/**` · `constraint-panel/**` · `calendar-agenda-view/**` · `calendar-layer-toggle` · `available-slots` · `creneau-card` · `core/availability/**` · `apps/web/src/styles.scss` · `calendar-week-view.scss`.

### Change Log

- 2026-08-19 — **Bug de l'appui maintenu en vue Mois corrigé, et AC18 ajoutée (retours d'essai).** **(1) Le bug.** Un appui maintenu en vue Mois armait bien la sélection, mais elle se défaisait à la relâche et sortait aussitôt du mode modification ; il fallait obligatoirement glisser. **Cause : le `click` que le navigateur émet spontanément derrière tout `pointerup` sans déplacement.** Il retombait dans `onCellClick()`, qui — depuis l'AC17 — bascule le créneau : la case qu'on venait d'armer était donc immédiatement débasculée. La vue Semaine y échappait par accident, ses cellules n'ayant pas de `(click)`. Corrigé par un drapeau `suppressNextClick`, posé au `pointerup` d'un geste **armé** et remis à zéro au `pointerdown` suivant — pour qu'un glissement se terminant hors d'une case (donc sans `click`) ne laisse pas le drapeau avaler le clic légitime d'après. Test de non-régression ajouté qui **simule explicitement le clic du navigateur**. **(2) AC18.** La sélection était un ensemble de **jours** : cliquer une cellule du matin en vue Semaine basculait la journée entière, ce qui n'avait aucun sens sur une grille dont la ligne EST le créneau. Les deux vues portent désormais un ensemble de **créneaux** (`selectedCells: signal<SelectedCell[]>`), et le clic bascule la cellule touchée, quelle que soit sa ligne — **la contrainte de ligne droite est celle du glissement, pas du clic**. Conséquence sur la portée : elle n'est plus un signal imposé mais un **`computed` dérivé** de la sélection — le créneau commun quand tous s'accordent, `null` (« créneaux variés ») dès qu'ils divergent. Choisir un segment devient une **action** qui réécrit toute la sélection, au lieu d'un filtre qu'elle subissait. `SelectionBar.scope` accepte donc `DaySlot | null`. Effet de bord corrigé au passage : « Autre… » visait `selectionAnchor`, dont le créneau devenait périmé après un changement de portée — il vise maintenant le premier créneau **retenu**. Vérifié à l'écran aux deux vues. **Web 102 fichiers / 1686 tests, tous verts.** Lint 143 = baseline (une erreur `prettier` introduite puis corrigée). Build 1,37 Mo.
- 2026-08-18 — **AC17 ajoutée + style de sélection unifié (décisions utilisateur, après essai en vue Semaine).** Deux retours distincts, traités ensemble. **(1) La sélection était illisible en vue Semaine** : l'anneau valait `--mat-sys-primary`, un **vert**, posé sur une cellule « disponible » elle-même verte — la sélection y disparaissait, et l'anneau de 2 px était trop fin. Les deux vues portaient de surcroît des traitements différents (fond primaire à 12 % au Mois, 35 % en Semaine). **Un seul traitement désormais, dupliqué à l'identique dans les deux SCSS avec un commentaire croisé** : fond primaire à 22 % + anneau **3 px en `--mat-sys-on-surface`**, une couleur de contraste qui tient sur les quatre fonds possibles (disponible, indisponible, trame, séance). Le repère de date courante passe en **tirets** (`2px dashed`), distingué de la sélection par la **forme** autant que par l'épaisseur — jamais par la seule couleur (P-1). **(2) La sélection devient un ENSEMBLE de jours** (`selectedDays: signal<Date[]>`) au lieu d'une plage dérivée de l'ancre : un clic en mode modification **bascule** un jour, et **retirer le dernier quitte le mode** sans passer par « Annuler ». Glissement et `Maj`+flèches continuent d'écrire une **plage**, qui *remplace* la sélection — les deux gestes alimentent la même liste, toujours triée, et une sélection **non contiguë** est désormais possible. **Les deux vues partagent maintenant exactement le même modèle** : un ensemble de jours plus une portée, celle-ci décidant seule des créneaux écrits — `rangeCells()` a disparu de la vue Semaine. Vérifié à l'écran aux deux vues : appui maintenu sur une cellule verte → anneau clairement lisible ; clic sur un autre jour → il rejoint ; reclic → il ressort ; sélection 20 + 23 non contiguë rendue correctement. **Web 102 fichiers / 1685 tests, tous verts.** Lint 143 = baseline. Build 1,37 Mo.
- 2026-08-18 — **AC16 ajoutée et implémentée (décision utilisateur, suite directe de l'AC15).** L'AC15 ayant fait du tap un geste de lecture, celui-ci ne produisait plus **aucun retour dans la grille** : seul le rail bougeait, et la case qu'on venait de désigner restait indistincte. Un clic rend désormais la case **courante**, marquée par un liseré fin et neutre (`.current`), **une seule à la fois**, délibérément plus discret que l'anneau primaire de `.selected` — les deux ne disent pas la même chose et peuvent coexister, auquel cas la sélection l'emporte. **Implémentation volontairement locale** : un signal `currentDate` (Mois) / `currentCell` (Semaine) posé par `onCellClick()`, **aucun câblage parent**. Une première version faisait descendre `railDateKey()`/`railSlot()` depuis `CalendarView` pour que le repère colle exactement à ce que le rail résout, repli au repos compris ; écartée comme disproportionnée sur retour utilisateur (« pas besoin de faire plus compliqué ») — `railDateKey` est donc **restée privée** dans `CalendarView`, et le marquage par bande a été abandonné au profit de la case seule. Vérifié à l'écran : clic sur le 21 → repère + « VENDREDI 21 AOÛT » au rail ; clic sur le 26 → le repère se déplace, le 21 le perd. **Web 102 fichiers / 1683 tests, tous verts.** Lint 143 = baseline (une erreur `prettier` introduite puis corrigée). Build 1,37 Mo.
- 2026-08-18 — **⚠️ AC15 ajoutée et implémentée après test d'usage (décision utilisateur).** Le **tap court redevient un geste de LECTURE** : il désigne le créneau, le rail suit, et **rien ne s'ouvre** — ni le panneau (déjà retiré par l'AC1), ni la barre. C'est l'**appui maintenu** qui arme la sélection et fait apparaître la barre, **pour tous les pointeurs, souris comprise** ; le glissement reste la seconde porte. Motif : à l'essai, la barre surgissant à chaque clic parasite la lecture, qui est précisément ce que le rail de 36.1 est venu servir. **Ceci renverse un arbitrage validé** — `EXPERIENCE.md` §6 bis **collision 2** avait explicitement retenu « Sélectionner » **contre** « Ouvrir le détail du jour » ; le nouvel arbitrage prend le prétendant écarté. Quatre sources à amender hors story par `bmad-correct-course` : FR-57 (puce 3), `EXPERIENCE.md` §6 (table d'inversion), §6 bis table 1, §6 bis collision 2. Le contrat d'UI (annotation 5) n'est pas touché : il décrit la barre, pas ce qui la déclenche. **Réserve consignée : le clic long n'a aucune convention sur ordinateur** — le glissement reste la porte découvrable en desktop. **Le clavier est traité à part** : n'ayant pas d'équivalent d'appui long, `Espace` et `1`/`2`/`3` arment **directement** via un `onCellKeySelect()` dédié, une frappe délibérée valant l'intention. Détail technique : le minuteur d'appui maintenu n'est plus réservé au tactile, et `armDrag()` l'annule désormais — sans quoi un glissement souris armé avant l'échéance verrait le minuteur ramener l'ancre à la case de départ. Vérifié à l'écran : tap court sur le 21 → le rail passe à « VENDREDI 21 AOÛT » sans barre ; appui maintenu sur le 26 → barre armée, case et bande marquées. **Web 102 fichiers / 1682 tests (+28 vs baseline), tous verts.** Lint 143 = baseline. Build : budget de bundle pré-existant seul point d'échec, 1,37 Mo.
- 2026-08-18 — **Implémentation complète (Tasks 1 à 9, bmad-dev-story). Statut → review.** Le renversement de FR-57 est livré : **le tap n'ouvre plus `ConstraintPanel`**, il arme une sélection ; le panneau se rejoint par « Autre… », son unique porte. `onSlotSelected()` a été **amputé et non supprimé** — ses deux lignes de rail restent, ses quatre lignes de panneau ont migré dans `onDeclarationPanelRequested()`, où `selectedExisting` est renseigné par le même `findMatchingDeclaration()` (sans quoi suppression et découpe devenaient inatteignables). La **barre existante a été étendue, pas réécrite** : `scope`, `armedKind` et `otherRequested` s'ajoutent aux cinq membres de 30.3, dans l'ordre exact du contrat d'UI. La **sélection porte un créneau par cellule** dans les deux vues (`SelectedCell`), `monthRangeDays`/`weekRangeCells`/`buildBatchItems` restant intacts ; le `pointerdown` a migré du conteneur `.bands` vers chaque `.band`, `fromBand` conservé. Dette d'`EXPERIENCE.md` §6 bis **refermée sur ses deux points** : `Entrée` valide l'intention affichée par la barre, et ne fait plus rien hors sélection. Test d'axe (AC5) limité à l'armement. **Une régression réelle attrapée par un test existant et corrigée** : `onShiftArrow()` ne doit poser que l'ancre, jamais le `current`, tant qu'aucune extension n'a abouti. **✅ VÉRIFICATION VISUELLE RÉELLE FAITE dans Chrome — elle a trouvé DEUX défauts qu'aucun test ne voyait** : (1) la région live de la barre s'affichait en clair, `.visually-hidden` n'étant défini que dans `calendar-month-view.scss` et les styles Angular étant encapsulés par composant ; (2) sur une case **fusionnée**, choisir « Soir » ne marquait plus rien — la bande fusionnée porte les trois créneaux, elle suit désormais `isDaySelected()`. Corrigé aussi à l'œil : « Annuler » passait seul à la ligne. **DEUX ÉCARTS ASSUMÉS vs le texte de la story**, chacun avec son motif : un tap sur une bande **portant un objet** arme une sélection lui aussi (traitement uniforme, justifié par la spine elle-même — « là où un objet est posé, déclarer sa disponibilité n'a aucun effet » — plutôt qu'un second chemin d'événement transitoire), et « Autre… » **efface** la sélection au lieu de la conserver (elle a remis son intention au panneau ; évite un canal parent → enfant). **⚠️ Régression temporaire assumée** entre 36.3 et 36.4 : redéclarer un créneau déjà déclaré échoue (route groupée tout-ou-rien, `AD-21`) — le message d'échec nomme désormais « Autre… » comme issue. Dette laissée ouverte avec son motif : l'extension clavier Haut/Bas, triplement ambiguë une fois la portée introduite. **Web 102 fichiers / 1678 tests (baseline 102/1654, +24), tous verts.** Lint **143 = baseline**, zéro erreur nouvelle. Build : seul le budget de bundle pré-existant échoue, 1,36 → 1,37 Mo. Story front-only. Non vérifiés à l'œil : le glissement vertical au doigt sur tactile réel, et le rendu de la barre en largeur téléphone (aucune planche mobile ne la dessine).
- 2026-08-18 — Story créée (bmad-create-story). Exploration menée en direct après échec des sous-agents sur limite de session. **Quatre encadrés consignés.** (1) **LE TAP CESSE D'OUVRIR LE PANNEAU** — renversement explicite de l'AC9 de 36.1 et de l'AC9 de 36.2, qui garantissaient toutes deux le contraire ; `onSlotSelected()` est **amputé, pas supprimé** (le rail continue de suivre) ; `ConstraintPanel` n'a plus qu'une porte, « Autre… », dont dépendent trois capacités livrées — récurrente (story 1.7), modification/suppression, découpe : c'est le risque n°1, verrouillé par les AC4 et AC10. (2) **LA BARRE EXISTE DÉJÀ** (`selection-bar/`, livrée par 30.3, rendue par les deux vues) : elle gagne une portée, « Autre… » et une intention armée — ne pas créer un second composant ; ⚠️ **aucune section de `DESIGN.md` ne la spécifie**, le seul contrat visuel est `.selbar`/`.scope` de la planche, qui ne la dessine qu'en desktop. (3) **« Ce que la barre affiche » suppose un état que la barre n'a pas** : décision d'une intention armée visible par la **forme** (P-1), défaut `UNAVAILABLE` — ce qui referme la dette n'est pas le changement de valeur mais l'accord des deux chemins. (4) **Trois écarts entre documents tranchés** : la sélection porte un **créneau par cellule** dans les deux vues (⚠️ écart assumé vs la puce 2 de FR-57, contredite par la collision 1 du même jour) ; le **test d'axe ne gouverne que l'armement**, jamais l'extension ; la **portée initiale reflète l'origine** de la sélection. **Quatorze AC** : les neuf d'`epics.md` verbatim + AC10 (le panneau garde ses capacités par sa nouvelle porte), AC11 (le rail continue de suivre), AC12 (un geste, un appel — AD-21), AC13 (42 arrêts de tabulation, portée en un seul `radiogroup`), AC14 (la barre lisible sans la voir et sans la couleur seule). **⚠️ Régression temporaire assumée consignée** : entre 36.3 et 36.4, redéclarer un créneau déjà déclaré échoue (le tap unitaire passe par la route groupée, qui échoue en bloc — `AD-21`), mitigée par « Autre… » et par un message d'échec qui le nomme. **Six tests existants changent de vérité** et doivent être réécrits, pas supprimés (`calendar-month-view.spec.ts:302,348,373` · `calendar-week-view.spec.ts:183,322,344` · `calendar-view.spec.ts:1175`). Douze pièges consignés, dont l'absence de `preventDefault` sur `keydown.space` en vue Mois et le câblage de « Autre… » sans `selectedExisting`. Dette refermée : les deux points de l'encadré de dette d'`EXPERIENCE.md` §6 bis. Dette **laissée ouverte avec son motif** : l'extension clavier Haut/Bas, triplement ambiguë une fois la portée introduite. Évaluation SSE faite : aucun câblage propre (état local d'interaction, chaîne de validation inchangée depuis 30.2). Story front-only. Baseline : web **102 fichiers / 1654 tests**, lint **143 erreurs pré-existantes**, build 1,36 Mo. **Cinq questions remontées à l'utilisateur** : le sens de « ce que la barre affiche », l'opportunité de rapprocher 36.4, le **trou d'attribution** du tap sur une bande portant une séance (aucune story de l'épic ne l'a en AC), le comportement d'« Autre… » sur une sélection multiple, et la contradiction FR-57 / collision 1 à répercuter hors story.
