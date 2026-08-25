---
baseline_commit: fc0209bffa4770e9c968f505c74ea8f1169acf68
---

# Story 36.2 : La case du mois, trois bandes et la préséance

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · **Front pur** · *Le pari visuel du lot* [Source: epics.md:339]

---

## Story

As a **utilisateur**,
I want **que chaque créneau d'un jour affiche ce qui compte le plus**,
so that **je cesse de rater une séance derrière un point de couleur**.

---

## ⚠️ Avertissement de séquencement — la story 36.1 est en `review`, pas `done`

Cette story a été rédigée **avant** la revue de code de 36.1. Elle s'appuie directement sur ce que 36.1 vient de livrer — `day-detail.utils.ts`, `allCalendarEntries()`, le rail. **Si la revue de 36.1 modifie ces éléments, revenir sur les Tasks 1 et 2 avant de coder.** Décision prise sciemment par l'utilisateur le 2026-08-18.

---

## 🚨 Encadré n°1 — La préséance existe déjà, à moitié. Il faut l'achever, pas la réinventer

**Il n'existe aujourd'hui aucune abstraction de préséance dans le front.** Le seul arbitrage réel entre couches est une ligne écrite hier par la Story 36.1 :

```ts
// day-detail.utils.ts — buildDayDetail()
const status: SlotStatus = seance ? 'UNAVAILABLE' : computeDisplayStatus(utcDate, slot, declarations, now);
```

C'est **la moitié de la préséance de cette story** : séance > déclaration. Manquent le vote, et surtout la **nature du rang gagnant** — `DaySlotDetail` dit *quel statut* et *quels libellés*, jamais *qui a gagné*. Or la bande a besoin de le savoir : le fond, la forme et le texte en dépendent.

**Le chemin est donc l'extension, pas la construction parallèle.** `buildDayDetail()` résout déjà, pour un jour donné et bande par bande : la séance couvrante, le vote couvrant, le statut de repli, et la règle « la couche gouverne le texte, jamais l'indisponibilité ». Lui ajouter un champ `winner` et une table de préséance nommée sert **les deux consommateurs** — le rail et la case — sans jamais dupliquer la règle.

**Bénéfice secondaire, à consigner** : la chaîne `@if/@else if` du rail (`calendar-detail-rail.html`) est aujourd'hui mutuellement exclusive et fait gagner la séance sur le vote **sans que rien ne le formalise**. C'est un item ouvert de `deferred-work.md` (« Vote actif masqué quand un créneau porte déjà une séance — comportement plausible mais non tranché formellement »). La préséance de cette story le **referme** : le rail devient conforme à une règle écrite au lieu d'un ordre de branches.

⚠️ **Attention à la 5ᵉ ligne.** `DESIGN.md` §7.9 présente cinq lignes, mais la table de préséance d'`EXPERIENCE.md` §4.3 bis n'a que **quatre rangs**. « Personne n'a répondu / non déclaré » **n'est pas un rang** : il ne concourt pas, c'est ce qui reste quand rien ne gagne. Et la **disponibilité du groupe est sortie de la préséance** le 2026-08-17 (FR-53) — elle ne concourt plus jamais, elle passe sur un canal séparé livré par la **story 36.8**.

**La préséance de cette story a donc exactement quatre rangs :**

| Rang | Gagnant | Vient de |
| --- | --- | --- |
| 1 | **Séance confirmée** | entrée `mes-seances` couvrant le créneau |
| 2 | **Vote en cours** | entrée `votes-en-cours` couvrant le créneau |
| 3 | **Mes indisponibilités** | `computeDisplayStatus() === 'UNAVAILABLE'` |
| 4 | **Mes disponibilités** | `computeDisplayStatus() === 'AVAILABLE'` |
| — | *(non déclaré)* | `'UNKNOWN'` — **pas un rang**, l'état par défaut |

---

## 🚨 Encadré n°2 — Les données sont déjà là, par créneau, et non filtrées. Ne pas en chercher d'autres

`allCalendarEntries()` (`calendar-view.ts`, livré par 36.1) produit **déjà** tout ce dont la case a besoin, **par créneau typé**, dans les deux contextes, **sans aucun appel réseau supplémentaire** :

| Ce que la bande doit savoir | D'où ça vient | Créneau |
| --- | --- | --- |
| Séance confirmée | entrée `mes-seances` | `slot: seance.poll?.chosenSlot ?? 'FULL_DAY'` |
| Vote en cours | entrée `votes-en-cours` | `slot: firstOption?.slot` |
| Mes déclarations | `visibleDeclarations()` → `computeDisplayStatus()` | par créneau |
| Tendance du groupe | entrée `disponibilite-groupe` (`heatmap`) | `slot: slot.slot` — **hors périmètre, story 36.8** |

**Trois conséquences directes :**

1. **Les inputs actuels de `CalendarMonthView` sont à remplacer, pas à compléter.** `[heatmap]` et `[seanceDates]` alimentent la pastille de groupe et la pastille de séance — les deux disparaissent. La case reçoit désormais une projection par jour construite en amont.
   ⚠️ **`seanceMarkerDates()` reste requis par la vue Semaine** (`calendar-view.html`, input `[seanceDates]` de `app-calendar-week-view`) : ne pas le supprimer de `CalendarView`, seulement cesser de le passer au Mois.
2. **`entries` doit rester NON filtré par couche** jusque dans la fonction de projection. C'est le contrat déjà posé par 36.1 : filtrer en amont ferait disparaître l'indisponibilité d'une séance en même temps que son titre, ce que FR-50 interdit formellement.
3. **Une séance sans vote occupe les TROIS bandes.** `AD-9` : « `Seance.dateValidee` ne porte pas de créneau ; celui-ci se lit sur `SessionPoll.chosenSlot` quand il existe, et vaut **`FULL_DAY`** sinon — jamais une supposition locale à un appelant. » La fonction `entryCoversSlot()` de `day-detail.utils.ts` applique déjà exactement cette règle (`undefined` ou `FULL_DAY` couvre les trois) : la réutiliser telle quelle.

---

## 🚨 Encadré n°3 — ⚠️ Le contrat d'UI et la spec écrite se contredisent sur la FORME du vote

C'est le point le plus délicat de la story, et il touche un acquis non négociable.

**Ce que la spec écrite demande** — `DESIGN.md` §7.9 : séance = *filet intérieur* ; vote = **liseré gauche 3 px pleine teinte**. `EXPERIENCE.md` §4.3 bis dit également « **Liseré** ».

**Ce que toutes les maquettes dessinent** — `contrat-ui-calendrier.html` et `mois-complet-cinq-traitements.html` donnent au vote un **filet complet `inset 0 0 0 1px`**, exactement comme la séance. Le liseré gauche de 3 px n'est dessiné nulle part, sauf sur la puce d'un traitement **écarté**.

**Pourquoi ce n'est pas un détail.** Si séance et vote portent la même forme, ils ne se distinguent plus que par la **teinte** — ce qui viole frontalement l'acquis non négociable du palier : « **Aucune information n'est portée par la couleur seule** » (`EXPERIENCE.md` §7 ; principe **P-1** du PRD ; `ARCHITECTURE-SPINE.md`, Consistency Conventions). Et l'AC3 de cette story l'exige nommément : « filet pour une séance, **liseré** pour un vote, trame pour l'absence de réponse ».

**⚠️ Décision de cette story : on suit la spec écrite et l'AC — liseré gauche 3 px pour le vote.** Le filet complet reste réservé à la séance. Motif : c'est la seule lecture qui satisfait P-1, et un liseré de 3 px reste discriminant sur une bande de 13 px de haut, là où un filet de 1 px ne l'est pas. **La planche contractuelle devra être corrigée en conséquence** — elle prévoit elle-même ce mécanisme (« toute spécification ultérieure qui modifierait cette planche sera signalée par ⚠️ »). *Point remonté en fin de story.*

**Deux autres écarts de la planche, tranchés de la même façon :**

- ⚠️ **Texte en mobile.** Le JS de la planche affiche en mobile le dernier mot du titre (« Ashal ») ou le mot « Vote ». Cela contredit `DESIGN.md` §7.9 (« **Aucun** — la forme seule subsiste »), `EXPERIENCE.md` §4.3 ter, **l'annotation 26 de la planche elle-même**, et l'AC8 de cette story. **Trois textes concordants contre un détail de rendu : les bandes perdent leur texte.**
- ⚠️ **Condition de fusion.** La planche annule la fusion quand la couche groupe est allumée — condition écrite dans aucune spec. Elle est logique (une jauge par créneau réclame trois bandes) mais elle appartient à **36.8**. Cette story implémente la fusion sur les deux conditions spécifiées (trois créneaux au même état **et** aucun événement) et **rend la règle extensible** pour que 36.8 puisse y ajouter la sienne sans refonte.

---

## Acceptance Criteria

**AC1 à AC10 : reprises verbatim d'`epics.md`.**

**AC1 — Given** une case de la vue mois
**When** elle est rendue
**Then** elle est découpée en **trois bandes horizontales pleine largeur** — matin en haut, après-midi au milieu, soir en bas
**And** la position verticale porte le créneau, sans icône ni libellé

**AC2 — Given** un créneau portant plusieurs informations
**When** la bande est rendue
**Then** un seul rang l'occupe, selon l'ordre séance confirmée > vote en cours > mes indisponibilités > mes disponibilités
**And** l'arbitrage se fait **bande par bande**, jamais à la journée

**AC3 — Given** un rang au-dessus de « mes disponibilités »
**When** il gagne une bande
**Then** il ajoute une **forme** — filet pour une séance, liseré pour un vote, trame pour l'absence de réponse
**And** aucune information n'est portée par la couleur seule

**AC4 — Given** un jour dont les trois créneaux portent le même état, sans événement
**When** la case est rendue
**Then** les trois bandes fusionnent en une seule
**And** la grille ne se charge pas inutilement

**AC5 — Given** une bande portant une séance confirmée
**When** la place le permet
**Then** le titre de la séance y est écrit, tronqué si nécessaire

**AC6 — Given** la couche « mes séances confirmées » éteinte
**When** un créneau porte une séance
**Then** le texte disparaît de la bande
**And** l'indisponibilité qui en découle demeure — elle ne dépend d'aucun réglage

**AC7 — Given** l'ancienne signalétique — pastille de séance, pastille de groupe, réglette de trois segments
**When** cette story est livrée
**Then** elle est retirée
**And** aucune information qu'elle portait n'est perdue

**AC8 — Given** une largeur de case inférieure au seuil
**When** la case est rendue
**Then** les bandes perdent leur texte et conservent leur structure

**AC9 — Given** le geste de déclaration existant
**When** on tape une bande
**Then** il se comporte comme le tap sur un segment aujourd'hui
**And** aucune régression de saisie n'est introduite par cette story

**AC10 — Given** une largeur inférieure au seuil, où les bandes n'affichent aucun texte
**When** une case porte une séance ou un vote
**Then** le rail livré par la story 36.1 en donne le détail
**And** la vue mois sur téléphone ne dit à aucun moment moins qu'avant cette story

**AC11 à AC13 : ajoutées ici pour combler des trous qui coûteraient une reprise.**

**AC11 — Given** une séance dont la date est validée sans vote rattaché
**When** la case est rendue
**Then** elle occupe **les trois bandes** du jour — `chosenSlot` absent vaut `FULL_DAY` (AD-9)
**And** aucune supposition de créneau n'est faite localement

**AC12 — Given** la grille du mois
**When** je navigue au clavier
**Then** `Tab` atteint **la case**, jamais la bande — la grille conserve **42 arrêts de tabulation**, pas 126
**And** l'état de chaque créneau reste annoncé en toutes lettres aux technologies d'assistance
**And** les raccourcis existants (`1`/`2`/`3`, `Espace`, `Maj`+flèches, `Entrée`, `Échap`) se comportent comme avant

**AC13 — Given** cette story
**When** elle est livrée
**Then** **aucun appel réseau supplémentaire** n'est émis — les bandes dérivent des signaux déjà chargés
**And** aucun fichier `apps/api/**` ni `packages/shared/**` n'est modifié

---

## Tasks / Subtasks

### 1. La préséance, nommée et testable (AC2, AC3, AC11)

- [x] Étendre `day-detail.utils.ts` — **ne pas créer un second module de préséance**.
- [x] Y définir et exporter la table de rangs, sur le patron de `core/parties/party-signal-priority.ts` (tableau d'ordre exporté + fonction pure + spec dédiée), p. ex. :
      `export type SlotWinner = 'seance' | 'vote' | 'unavailable' | 'available' | 'none';`
      `export const SLOT_PRECEDENCE: readonly SlotWinner[] = ['seance', 'vote', 'unavailable', 'available'];`
- [x] Ajouter `winner: SlotWinner` à `DaySlotDetail`, renseigné dans `buildDayDetail()`.
- [x] **Le vote doit désormais être résolu comme un rang**, pas seulement comme un libellé : aujourd'hui `pollLabel` est calculé indépendamment du statut. Le faire entrer dans l'arbitrage — séance > vote > indispo > dispo.
- [x] **Ne pas toucher à la règle AC6 déjà en place** : `seance` force `UNAVAILABLE` avant tout calcul, la couche ne gouverne que le texte.
- [x] Réutiliser `entryCoversSlot()` tel quel pour AC11 (`FULL_DAY`/absent couvre les trois bandes).
- [x] Compléter `day-detail.utils.spec.ts` : un test par rang, un test de départage entre deux rangs, un test AC11, un test « couche éteinte → `winner` reste `seance`, texte `null`, statut `UNAVAILABLE` ».

### 2. La projection du mois (AC1, AC2, AC13)

- [x] Ajouter une fonction pure `buildMonthBands(dateKeys, entries, activeLayers, declarations, now)` → `Map<string, DayDetail>` (ou équivalent), **construite au-dessus de `buildDayDetail()`**, jamais en parallèle.
- [x] Dans `CalendarView`, un `computed()` qui la nourrit avec `allCalendarEntries()` **non filtré** et `visibleDeclarations()` — mêmes arguments que `railDetail()`, pour que rail et grille ne se contredisent jamais.
- [x] Nouvel input sur `CalendarMonthView` remplaçant `[heatmap]` et `[seanceDates]`.
- [x] ⚠️ **Laisser `seanceMarkerDates()` en place** : la vue Semaine le consomme toujours.

### 3. La case à trois bandes (AC1, AC4, AC5, AC8)

- [x] `calendar-month-view.ts` : remplacer les six champs plats de `DayCell` (`morning`/`afternoon`/`evening` + les trois `*Preview`) par un tableau de trois bandes. `buildMonth()` change de forme — c'est le cœur de la story.
- [x] **Conserver `date`, `isCurrentMonth`, `isToday`, `isPast`** : les tests de `buildMonth` qui survivent en dépendent.
- [x] **Conserver le mécanisme d'aperçu** (`pendingDto` → `toFakeDecl` → preview par bande) : il fait vivre l'animation pendant l'édition dans `ConstraintPanel`.
- [x] `calendar-month-view.html` : remplacer le bloc `.segments` par `.bands > .b`, une bande par créneau, dans l'ordre de `RAIL_SLOTS`.
- [x] Rendre la fusion (AC4) : quand les trois bandes ont le même `winner` **et** qu'aucune ne porte d'événement, rendre **une seule** bande occupant la hauteur. **Écrire la condition de façon extensible** — 36.8 devra pouvoir y ajouter « et la couche groupe est éteinte ».
- [x] Titre de séance dans la bande (AC5), tronqué à l'ellipse, jamais reformaté.

### 4. Le style des bandes (AC1, AC3, AC8)

- [x] `calendar-month-view.scss` : `.day-cell` passe de `align-items: center` à **`stretch`** — ⚠️ **sans ce changement, les bandes ne peuvent pas faire toute la largeur**. C'est le piège de mise en page n°1.
- [x] Dimensions du contrat : `.bands` en colonne, **gouttière 2 px**, `flex: 1` ; `.b` rayon **3 px**, `min-height` **20 px** (large) / **13 px** (étroit) ; case `min-height` 86 px / 58 px.
- [x] Fonds, valeurs de la planche contractuelle : disponible `--color-available` 32 %, indisponible `--color-unavailable` 32 %, séance `--jdr-status-soon` 28 %, vote `--jdr-status-todo` 24 %, non déclaré = trame.
- [x] **Formes** : séance `box-shadow: inset 0 0 0 1px` à 75 % ; **vote `border-left: 3px solid` pleine teinte** (encadré n°3) ; trame `repeating-linear-gradient(45deg, transparent 0 3px, rgba(127,140,141,.42) 3px 6px)`.
- [x] Texte : titre corps 10,5 en gras, `text-overflow: ellipsis`, `white-space: nowrap`.
- [x] Sous le seuil : les bandes perdent leur texte, gardent leur `min-height` de 13 px (AC8).
- [x] **Ne PAS réserver la marge droite de 11 px** de la jauge : la planche elle-même la conditionne à une classe (`.hasg`). La réserver inconditionnellement amputerait chaque bande d'une place inutilisée. C'est 36.8 qui l'ajoutera, conditionnellement.
- [x] ⚠️ **Noms de tokens** : `--jdr-status-unavailable` et `--jdr-status-unknown` **n'existent pas** — voir Dev Notes, piège n°2.

### 5. Retrait de l'ancienne signalétique (AC7)

- [x] Supprimer `.guild-dot` (HTML + SCSS) et son alimentation `heatmapByDate()`/`entryGuildStatus()`/`GuildStatus` dans le `.ts`.
- [x] Supprimer `.seance-dot` **de la vue Mois uniquement** — ⚠️ **celui de la vue Semaine reste** (`calendar-week-view.html`, en-tête de colonne).
- [x] Supprimer `.segments`/`.segment` et `@keyframes segmentPulse` (HTML + SCSS).
- [x] **Vérifier qu'aucune information n'est perdue** (AC7) : la séance était une pastille → devient une bande nommée ; la tendance du groupe était une pastille agrégée à la journée → **elle disparaît de la case et revient en 36.8 par créneau**. ⚠️ *C'est une perte temporaire assumée entre 36.2 et 36.8 : la consigner explicitement en Completion Notes, ne pas la passer sous silence.*

### 6. Le geste et le clavier (AC9, AC12)

- [x] La bande devient la cible de pointeur qui remplace le segment : reporter `onSegmentPointerDown`/`fromSegment` sur `.b`, avec le même `stopPropagation()`.
- [x] **Le tap sur une bande se comporte comme le tap sur un segment aujourd'hui** : `onCellClick(date, slot)` du créneau correspondant. Rien de plus dans cette story.
- [x] **Sur une bande fusionnée**, la cible de créneau disparaît : le tap vaut journée entière (collision 8 de la spine UX).
- [x] ⚠️ **Ne pas implémenter la sélection au créneau par glissement le long d'une bande** — c'est la **story 36.3**. Cette story livre la *structure* qui la rendra possible, pas le comportement.
- [x] Conserver `touch-action: none` et l'absence de handler vertical : le glissement vertical reste au défilement.
- [x] **42 arrêts de tabulation** (AC12) : la case reste le seul élément focusable, les bandes ne prennent pas de `tabindex`. Reprendre le commentaire d'explication existant, qui reste valable mot pour mot.
- [x] Bandes : `role="img"` + `aria-label` « *Créneau : état* », sur le patron de `slotAriaLabel()`. **Quand une séance est posée, l'état est son titre** (« Soir : Le Convoi du Nord ») — l'exigence est « l'état en toutes lettres ».
- [x] Mettre à jour le texte d'aide caché `#month-cell-instructions` — ⚠️ **un test existant assert qu'il contient « 1 »**.

### 7. Tests (AC1 à AC13)

- [x] `day-detail.utils.spec.ts` — étendre : préséance par rang, départage, `FULL_DAY` sur trois bandes, couche éteinte.
- [x] `calendar-month-view.spec.ts` — **deux tests existants vont casser**, ils ciblent `.segment` : « un tap rapide sur un segment ne rejoue pas un tap FULL_DAY » et « un glissement parti d'un segment arme quand même une sélection ». **Les réécrire sur `.band`, pas les supprimer** : ce sont eux qui protègent le mécanisme `fromSegment`.
- [x] Le test du texte d'aide caché (`aria-describedby`, contient « 1 ») casse si le texte est réécrit — l'adapter.
- [x] Nouveaux tests : trois bandes rendues, ordre matin→soir, fusion sur trois états identiques, **pas** de fusion quand un événement est posé, titre tronqué présent en large / absent en étroit, `aria-label` par bande, absence de `.guild-dot`/`.seance-dot`/`.segment` dans le DOM.
- [x] `calendar-view.spec.ts` — la projection du mois ne déclenche aucun appel (AC13), sur le patron des tests de compteurs d'appels de 36.1.

### 8. Vérification

- [x] `docker compose exec web pnpm test` — **baseline à confirmer : 102 fichiers / 1616 tests**.
- [x] `docker compose exec web pnpm lint` — **baseline 143 erreurs pré-existantes**, à mesurer des deux côtés par `git stash`. Zéro erreur nouvelle.
- [x] `docker compose exec web pnpm build` — le **seul** échec admis est le budget de bundle pré-existant (1,36 Mo après 36.1) ; mesurer le delta par `git stash`.
- [x] **Vérification visuelle réelle obligatoire** — c'est *le pari visuel de l'épic*. Contrôler sur les **trois thèmes** : les quatre rangs distinguables, les formes visibles à 13 px, la fusion, la troncature, et l'absence de grille bariolée. 36.1 a montré que c'est faisable (Chrome connecté, connexion faite par l'utilisateur, compte de démo). **Si l'accès n'est pas possible, le dire explicitement plutôt que de l'omettre.**

---

### Review Findings

- [x] [Review][Decision→Patch] Le rang `'vote'` n'est pas gouverné par la couche `votes-en-cours` — asymétrique avec la règle AC6 de la séance — `day-detail.utils.ts` (`buildDayDetail()`, résolution de `winner`). **Décision utilisateur (2026-08-18) : le rang vote retombe sur le statut déclaré (`unavailable`/`available`/`none`) quand la couche `votes-en-cours` est éteinte**, contrairement à la séance dont le rang persiste (AC6 reste réservé à la séance). Corrigé : `winner` n'est `'vote'` que si `active.has('votes-en-cours')`.
- [x] [Review][Decision→Patch] `aria-label` d'une bande fusionnée reprenait le libellé « Matin » même pour toute la journée — `calendar-month-view.ts` (`uniformAriaLabel()`). **Décision utilisateur : on corrige.** `uniformAriaLabel()` annonce désormais « Journée : … » au lieu de « Matin : … ».
- [x] [Review][Decision→Patch] `buildMonthDetails()` livré mais jamais appelé — Task 2 demandait une projection **par mois**, pas 42 appels individuels à `buildDayDetail()`. **Décision utilisateur : on câble** (aucune autre story ne le prévoyait). `buildMonth()` construit désormais les 42 clés de jour puis appelle `buildMonthDetails()` une seule fois par passage (état réel, état d'aperçu), et lit chaque cellule dans la `Map` résultante au lieu de rappeler `buildDayDetail()` par cellule. Portée : wiring local à `CalendarMonthView` — `CalendarView`/le rail (`railDetail()`) n'ont pas été restructurés pour partager la même `Map`, ce qui aurait exigé de déplacer la logique de grille (semaines/dayOffset) vers le parent ; aucune divergence n'existe aujourd'hui puisque les deux sites reçoivent les mêmes arguments.

- [x] [Review][Patch] Fuite de texte inter-rangs : `text: s.seanceLabel ?? s.pollLabel` ignore `s.winner` [calendar-month-view.ts:131] — corrigé en `text: s.winner === 'seance' ? s.seanceLabel : s.winner === 'vote' ? s.pollLabel : null`.
- [x] [Review][Patch] Commentaire obsolète après le renommage segment→bande [calendar-month-view.ts:386] — corrigé (« bande »/« la bande » au lieu de « segment »/« le segment »).
- [x] [Review][Patch] Aucune valeur de repli sur `var(--jdr-status-todo)` / `var(--jdr-status-soon)` [calendar-month-view.scss] — repli ajouté (`var(--jdr-status-todo, #f0a030)`, `var(--jdr-status-soon, #ff7ad9)`, valeurs du thème Grimoire Émeraude).
- [x] [Review][Patch] `[attr.data-status]` absent sur la bande fusionnée [calendar-month-view.html] — ajouté, même expression que sur les bandes non fusionnées (réel ou aperçu).
- [x] [Review][Patch] `uniform` calculé sur l'état réel, pas sur l'aperçu [calendar-month-view.ts:135] — corrigé en `bandsAreUniform(previewDetail ?? detail)`.
- [x] [Review][Patch] Le seuil du container query (724 px) ne correspond pas à la gouttière réelle de 2 px [calendar-month-view.scss] — corrigé à `712px` (7 × 100 px + 6 × 2 px), commentaire mis à jour.

---

## Hors périmètre

- **La jauge de disponibilité du groupe et les pastilles MJ** (`DESIGN.md` §7.9 bis) → **story 36.8**. Elle est sortie de la préséance (FR-53) : cette story ne lui réserve aucune place fixe.
- **La piste de participation d'un vote et le compteur « 3 / 4 »** (`DESIGN.md` §7.9) → **story 36.6 / dérogation D-17**. Ils vivent dans la même section de spec que la case : **ne pas implémenter §7.9 « en entier »**.
- **Les informations pratiques d'une séance** (le `.sub` sous le titre) → **story 36.5 / dérogation D-15**. Le champ n'existe pas côté serveur ; la bande doit pouvoir l'accueillir sans le prévoir en dur.
- **Le rappel de ma réponse à un vote** (« tu as dit oui ») → story 36.7.
- **La sélection au créneau par glissement le long d'une bande, la barre de portée, et la dette clavier d'`Entrée`** → **story 36.3**.
- **Le seuil de densité de la vue Semaine (Q-24, ≈ 500 px)** → story 36.13. Le seuil de *cette* story porte sur la **largeur de case**, pas sur celle de l'écran.
- **Ouvrir une séance ou un vote au tap sur la bande** — aucun AC ne le demande ici.
- **Toute modification serveur** : story front pure.

---

## Ce qui doit continuer de fonctionner

- **Le tap unitaire et `ConstraintPanel`** — `onCellClick`/`onSlotSelected` inchangés dans leur effet.
- **La sélection par glissement à la journée (Story 30.3)** — `monthRangeDays`, `SelectionBar`, `onSelectionCommit` en `FULL_DAY`, les raccourcis clavier : intacts.
- **L'aperçu live pendant l'édition** (`pendingDto` → preview animée) : conservé, transposé sur les bandes.
- **`buildWeek`/`getWeekStart`/`computeDisplayStatus`/`selection.utils.ts`** : signatures et corps inchangés.
- **`WeekCell`** — contrat de `selection.utils.ts:weekRangeCells` ; **`SlotSelectedEvent`** — importé par la vue Semaine depuis le Mois. Ni l'un ni l'autre ne doit changer de forme.
- **Le rail de détail (36.1)** — il consomme `buildDayDetail()` : toute extension doit lui rester compatible. Ses 16 tests doivent passer sans modification.
- **Le rafraîchissement temps réel existant** — les bandes sont des `computed()` sur les mêmes signaux, elles en héritent.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **`align-items: center` sur `.day-cell`.** Il est là aujourd'hui et il **empêche mécaniquement** une bande de faire toute la largeur. À passer en `stretch`. C'est le premier symptôme si les bandes sortent étriquées et centrées.
2. **Les tokens du contrat UX n'existent pas tous dans le code.** `DESIGN.md` §7.9 écrit `status-unavailable` et `status-unknown` : **aucun des deux n'existe** dans `apps/web/src/styles.scss`. Les vrais sont **`--color-unavailable`** et **`--color-unknown`** (définis une fois en `:root`, jamais surchargés par thème). Ne pas créer de nouveaux tokens : la story 29.0 a acté que les deux systèmes sont distincts et non fusionnables.
3. **« Mes disponibilités = `accent-1` » est faux hors d'un thème.** `DESIGN.md` le dit, mais c'est une coïncidence en Grimoire Émeraude. En Atelier Cuivré, `--jdr-accent-1` vaut `#cd7f32` alors que `--color-available` vaut `#4a7c59`. **Utiliser `--color-available`**, qui est surchargé par thème — comme le fait la planche contractuelle.
4. **Filtrer les entrées par couche avant la projection.** Même piège qu'en 36.1 : une séance dont la couche est éteinte doit garder son indisponibilité. Passer `allCalendarEntries()` **non filtré**, filtrer le texte en aval.
5. **Supposer un créneau pour une séance sans vote.** AD-9 est explicite : `chosenSlot` absent vaut `FULL_DAY`, donc les trois bandes. Ne jamais deviner « soirée par défaut ».
6. **Supprimer `seanceMarkerDates()` en même temps que la pastille du Mois.** La vue Semaine le consomme toujours pour ses en-têtes de colonne.
7. **Casser le budget de tabulation.** Trois bandes focusables = **126 arrêts** sur la grille 6×7. Le commentaire qui l'explique est déjà dans le HTML : le transposer, pas le perdre.
8. **Réécrire les deux tests de `.segment` en les supprimant.** Ils protègent `fromSegment` — le mécanisme qui empêche un tap sur une bande de rejouer un tap journée entière. Les réécrire sur `.band`.
9. **Implémenter §7.9 « en entier ».** La section de spec de la case contient aussi la piste de vote, le compteur et les infos pratiques, qui appartiennent à trois autres stories.
10. **Oublier que la grille est fixe à 42 cellules.** `buildMonth` rend toujours 6×7, quel que soit le mois — la performance de la projection doit être pensée pour 42 jours × 3 bandes, pas pour un mois « moyen ».

### Décisions arrêtées par cette story

- **Forme du vote = liseré gauche 3 px**, contre le filet complet des maquettes (encadré n°3). Motif : P-1.
- **Valeurs d'opacité = celles de la planche contractuelle** (32 / 32 / 28 / 24 %, trame 0,42), et non celles de `DESIGN.md` §7.9 (28 / 28 / 28 / 16 %). Motif : la planche est ce qui a été validé à l'œil sur un mois entier aux deux largeurs ; `DESIGN.md` n'a pas été mis à jour après ce run. **Seule exception : la forme du vote.**
- **Le cinquième état n'est pas un rang.** « Non déclaré » ne concourt pas ; il reste quand rien ne gagne.
- **Aucune marge droite réservée pour la jauge** : conditionnelle, donc à 36.8.
- **La condition de fusion est écrite de façon extensible**, pour que 36.8 y ajoute la sienne sans refonte.

### Décisions laissées à l'implémentation

- ⚠️ **Comment appliquer le seuil de 100 px de LARGEUR DE CASE.** `DESIGN.md` §7.9 raisonne en largeur de case ; le dossier calendrier n'a que des media queries d'écran à 768 px. **Ce n'est pas la même chose** : en contexte de partie, le panneau latéral prend 40 % de la largeur au-dessus de 768 px, donc à 768 px les cases y font ~63 px — le texte s'afficherait dans des bandes trop étroites. **Recommandation : `container-type: inline-size` sur la grille et une `@container` sur la largeur de case**, qui implémente le critère réel au lieu de l'approximer. Une media query à 768 px reste acceptable si le container query pose problème, mais l'écart doit alors être documenté. *Mesure réelle relevée le 2026-08-17 : sur un viewport de ~1300 px en calendrier personnel, les colonnes font ~99 px — soit juste sous le seuil.* C'est dire si l'approximation est fragile.
- **Forme exacte de la projection** (`Map<string, DayDetail>` vs tableau indexé) et emplacement (`day-detail.utils.ts` vs fichier voisin).
- **Rendu de la bande fusionnée pour un lecteur d'écran** : une annonce, ou toujours trois créneaux ? Aucune spec ne le dit. À trancher et documenter.
- **`aria-label` de la case** : reste-t-il le numéro du jour, ou résume-t-il les trois créneaux ? Aujourd'hui c'est le numéro seul. Trou de spec.

### Notes de plateforme

- **Angular 22 zoneless, Vitest 4.** `@angular/core ^22.0.0`, `@angular/material ^22.0.2`, `vitest ^4.0.8`, `typescript ~6.0.2`. **Aucune dépendance nouvelle** — c'est du DOM et du CSS.
- **Conventions** : `@if`/`@for` et signals (P1-AD-5) ; `input()`/`output()` signal-based ; `import type` pour `@master-jdr/shared` (P1-AD-4) ; `standalone: true` ; classe `PascalCase` sans suffixe `Component`.
- **Specs** : `import '@angular/compiler';` en **toute première ligne**, imports `vitest` explicites, `provideAnimationsAsync()`, `componentRef.setInput()`. Les fonctions pures sont testées **sans TestBed**.
- **Pas de script `typecheck` côté web** — `ng test`/`ng build` type-vérifient code **et** specs.
- **Exécution** : tout par Docker.
- **Baseline (après 36.1)** : web **102 fichiers / 1616 tests** ; lint **143 erreurs pré-existantes** ; build en échec sur le seul budget de bundle (**1,36 Mo**).

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : aucun câblage temps réel propre à ajouter.** Les bandes sont des `computed()` sur les mêmes signaux que la grille actuelle, dans un écran qui ouvre déjà sa connexion `partie:{id}` — elles héritent des deux `effect()` existants. La dette connue sur `GET /me/calendar` (non rafraîchi sur `profile/calendar`) est **héritée et non aggravée** : les bandes y seront périmées exactement comme la grille l'est déjà. Aucun AC ne l'exige, l'item reste dans `deferred-work.md`. [Source: CLAUDE.md ; docs/checklist.md]

### Dette refermée au passage

- **`deferred-work.md`** — « Vote actif masqué quand un créneau porte déjà une séance […] comportement plausible mais **non tranché formellement** ». La préséance à quatre rangs le tranche : séance > vote, écrit et testé. **À retirer de `deferred-work.md` en fin d'implémentation.**

### Dette explicitement NON refermée

- **Extension clavier Haut/Bas en vue Mois** (`deferred-work.md`, déféré de 30.3). Avec trois bandes, Haut/Bas devient ambigu — changer de créneau, ou de semaine ? La story **36.3** refond le chemin clavier : l'item lui revient. **Ne pas le traiter ici.**
- **Incohérence de fuseau `Intl`/local** : `deferred-work.md` dit explicitement « à trancher lors d'une story dédiée plutôt que silencieusement au fil des stories ».
- **Incohérence `displayDateChange` UTC vs local** entre Mois et Semaine : vise le contrat parent, pas la case.

### Project Structure Notes

**Modifiés — Web**
- `apps/web/src/app/features/calendar/day-detail.utils.ts` + `.spec.ts` (préséance nommée, `winner`, projection du mois)
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts` / `.html` / `.scss` / `.spec.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` / `.html` (nouvel input, retrait de `[heatmap]`/`[seanceDates]` **du Mois seulement**)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`

**Non touchés (à confirmer par `git status`)**
- `apps/api/**` · `packages/shared/**` · `calendar-week-view/**` · `calendar-detail-rail/**` · `calendar-layer-toggle` · `constraint-panel` · `selection.utils.ts` · `selection-bar` · `available-slots` · `core/availability/compute-display-status.ts` · `apps/web/src/styles.scss` (aucun token nouveau).

### References

- [Source: epics.md — Story 36.2] — les 10 AC, verbatim (AC1-AC10).
- [Source: epics.md:339] — rationale de séquencement : 36.2 est *le pari visuel du lot*, placée après 36.1 pour ne pas rendre la vue mois muette sur téléphone entre deux livraisons ; sortie de secours documentée en `EXPERIENCE.md` §4.3 ter.
- [Source: prd.md — FR-49] — préséance ; précision du 2026-08-17 : « **L'unité d'arbitrage est le créneau, jamais la journée** », trois bandes pleine largeur, fusion du jour uniforme.
- [Source: prd.md — FR-50] — séance lisible **et bloquante quoi qu'il arrive** (AC6) ; informations pratiques = D-15, hors périmètre.
- [Source: prd.md — FR-53] — la disponibilité du groupe **sort de la préséance** et passe sur un canal séparé → story 36.8.
- [Source: prd.md §3 — P-1] — « jamais la couleur seule », fondement de l'AC3 et de l'arbitrage de l'encadré n°3.
- [Source: prd.md §3 — P-2] — accessibilité en vigilance : **ne pas écrire d'AC chiffré** (pas de « ≥ 44 px »), mais le socle clavier reste dû.
- [Source: ARCHITECTURE-SPINE.md — AD-9] — séance sans vote = `FULL_DAY`, « jamais une supposition locale à un appelant » (AC11).
- [Source: ARCHITECTURE-SPINE.md — AD-16] — la couche gouverne la lecture, pas le stockage.
- [Source: ARCHITECTURE-SPINE.md — AD-20] — états dépendants du lecteur résolus côté client, sans endpoint dédié.
- ⚠️ [Source: ARCHITECTURE-SPINE.md, front-matter] — `binds` s'arrête à **FR-48** : **aucune AD ne couvre FR-49/FR-50**. La story relève de la ligne « refontes d'écran → aucune AD dédiée, gouverné par les conventions ».
- [Source: EXPERIENCE.md §4.3 bis] — table de préséance à **quatre rangs** ; ⚠️ sortie du groupe ; « éteindre la couche retire le texte, jamais le fait d'être pris ».
- [Source: EXPERIENCE.md §4.3 ter] — les trois bandes, les trois acquis, la **règle de fusion**, les traitements écartés et pourquoi.
- [Source: EXPERIENCE.md §6 bis — clavier] — « `Tab` atteint la case, **jamais la bande, qui produirait 126 arrêts** » (AC12).
- [Source: EXPERIENCE.md §6 bis — table 1 et collisions] — répartition des gestes ; **collision 8** : sur un jour fusionné, le tap vaut la journée.
- [Source: EXPERIENCE.md §7] — acquis non négociable : aucune information par la couleur seule.
- [Source: DESIGN.md §7.9 CalendarCell] — hauteurs 20/13 px, seuil 100 px de **largeur de case**, gouttière 2 px, rayon 3 px, table des rangs, filet 75 %, liseré 3 px, trame 45 %/40 %.
- [Source: DESIGN.md §7.9 bis GroupGauge] — jauge, pastilles, marge 11 px **conditionnelle** → 36.8.
- [Source: DESIGN.md §7.10 SlotIcon] — « **La case du Mois n'en porte pas** : sa structure à trois bandes dit déjà le créneau par la position » — confirme l'AC1.
- ⚠️ [Source: mockups/contrat-ui-calendrier.html] — CSS `.c`/`.bands`/`.b`/`.uni`, DOM de la case, valeurs d'opacité retenues ; **trois écarts documentés en encadré n°3** (forme du vote, texte en mobile, condition de fusion).
- [Source: mockups/mois-complet-cinq-traitements.html §N1] — la planche d'arbitrage qui a fait retenir le traitement à trois bandes, rendue sur un mois entier aux deux largeurs.
- ⚠️ **Planches périmées, à ne pas citer** : `case-du-mois-quatre-traitements.html` (verdict « P1/P4 » caduc, N1 n'y était pas exploré) et la planche A de `reprise-calendrier-propositions.html` (déclarée périmée par `EXPERIENCE.md` §4.3 bis).
- [Source: review-accessibility.md §E.1/§E.2/§C.2] — ce qui est vérifié à la conception : chaque information portée par la couleur doublée d'un second signal ; l'`aria-label` d'état des cellules est un **acquis à ne pas régresser** ; « l'état en toutes lettres ».
- [Source: apps/web/src/styles.scss] — tokens **réels** : `--jdr-status-{todo,live,soon,done}` (par thème) et `--color-{available,unavailable,unknown,mixed}` (`:root`, seul `available` surchargé). **Le calendrier n'en consomme aujourd'hui aucun `--jdr-status-*` : cette story sera le premier.**
- [Source: 29-0-palettes-de-statut-des-trois-themes.md] — story `done` : elle a livré les 12 jetons de statut et l'invariant de palette, **aucun composant**. Fournisseur de tokens, rien de plus.
- [Source: apps/web/src/app/features/calendar/calendar-month-view/**] — état actuel lu en entier : `buildMonth`, `DayCell`, `heatmapByDate`, le bloc `.segments`, le geste, les tests qui casseront.
- [Source: apps/web/src/app/features/calendar/day-detail.utils.ts] — livré par 36.1 : `RAIL_SLOTS`, `entryCoversSlot`, `buildDayDetail` et la moitié de la préséance déjà écrite.
- [Source: apps/web/src/app/core/parties/party-signal-priority.ts] — **patron de code à copier** pour une table de préséance testable : ordre exporté + fonction pure + spec dédiée.
- [Source: 36-1-le-rail-de-detail.md] — story précédente : baseline, patrons de test, discipline « ne pas toucher un algorithme testé », et le contrat « entries non filtrées ».
- [Source: deferred-work.md] — l'item du vote masqué par une séance (refermé ici) ; l'item clavier Haut/Bas (renvoyé à 36.3).
- [Source: CLAUDE.md ; docs/checklist.md] — convention SSE, évaluation obligatoire à chaque ajout.

---

## Questions ouvertes pour l'utilisateur

*Tranchées dans la story pour qu'elle soit implémentable. Signalées parce qu'elles touchent une planche validée ou un choix technique structurant.*

1. **⚠️ La forme du vote : liseré gauche 3 px, ou filet complet comme la maquette ?** La spec écrite dit liseré, **toutes** les maquettes dessinent un filet identique à celui de la séance. Or si les deux portent la même forme, ils ne se distinguent plus que par la couleur — ce que P-1 interdit. La story impose le **liseré**, et la planche contractuelle devra être corrigée. À confirmer.
2. **Le seuil de texte : container query sur la largeur de case, ou media query à 768 px ?** `DESIGN.md` raisonne en largeur de **case** (100 px), le dossier calendrier n'a que des seuils d'**écran**. En contexte de partie, le panneau latéral fausse l'équivalence — à 768 px les cases y font ~63 px. La story recommande **`@container`**. À confirmer, car c'est une première dans le projet.
3. **Perte temporaire assumée entre 36.2 et 36.8** : la tendance du groupe disparaît de la case (pastille supprimée) et ne revient qu'en 36.8, par créneau. L'AC7 dit « aucune information n'est perdue » — c'est vrai à la fin de l'épic, pas entre les deux stories. Acceptable, ou faut-il rapprocher 36.8 ?

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story)

### Debug Log References

- `docker compose exec web pnpm test` — **102 fichiers, 1654 tests**, tous verts (baseline 102/1616, **+38 tests**).
- `docker compose exec web pnpm lint` — **143 erreurs, identiques à la baseline**. Trois erreurs de formatage introduites en cours de route ont été corrigées avant clôture.
- `docker compose exec web pnpm build` — échec sur le seul budget de bundle pré-existant : **1,36 Mo, inchangé** (+0,05 ko).

### Completion Notes List

**La préséance a été achevée, pas réinventée.** `SlotWinner`, `SLOT_PRECEDENCE` et le champ `winner` ont été ajoutés à `day-detail.utils.ts`. Le rail et la case consomment désormais **la même résolution** — la règle n'est écrite qu'une fois. Les 16 tests du rail passent sans modification.

**La case projette, elle n'arbitre pas.** `buildMonth()` ne rejoue aucune règle : il appelle `buildDayDetail()` par jour et projette le résultat en bandes. `computeDisplayStatus()` n'est plus appelé directement par la vue Mois — la seule chaîne d'arbitrage passe par la fonction partagée.

**Le seuil est un container query, pas une media query.** `container-type: inline-size` sur `.calendar-grid`, seuil `724 px` de grille = 7 cases de 100 px + 6 gouttières. Vérifié en conditions réelles : à 896 px de grille (cases de 124 px) le texte s'affiche ; à 586 px (cases de 82 px) il disparaît et les trois bandes restent. C'est le critère réel de `DESIGN.md` §7.9 — une media query à 768 px aurait affiché du texte dans des bandes de 63 px en contexte de partie.

**Défaut visuel trouvé à l'écran et corrigé : les rangées ondulaient.** Une rangée contenant une case à trois bandes mesurait 106 px, une rangée de cases fusionnées 94 px. Aucun test ne pouvait l'attraper. Corrigé par `grid-auto-rows: minmax(0, 1fr)` — toutes les rangées à 106 px, mesuré.

**Le piège n°3 de la story s'est confirmé en conditions réelles.** Relevé sur les trois thèmes : en Atelier Cuivré, `--color-available` vaut `#4a7c59` quand `--jdr-accent-1` vaut `#cd7f32`. Suivre `DESIGN.md` à la lettre (« mes disponibilités = `accent-1` ») aurait donné une bande « disponible » **bronze** dans ce thème.

**⚠️ Perte temporaire assumée entre 36.2 et 36.8.** La pastille de tendance du groupe est retirée avec le reste de l'ancienne signalétique. Cette information **n'est plus visible dans la case** jusqu'à la story 36.8, qui la rétablira par créneau sur un canal séparé. L'AC7 (« aucune information n'est perdue ») est vraie à la fin de l'épic, pas entre ces deux stories. Le calendrier personnel n'est pas concerné : la couche n'y existe pas.

**Dette refermée** — `deferred-work.md`, item déféré de 36.1 : « Vote actif masqué quand un créneau porte déjà une séance […] comportement plausible mais non tranché formellement ». La préséance le tranche : séance > vote, écrit dans `SLOT_PRECEDENCE`, testé. **À retirer de `deferred-work.md`.**

**Dette explicitement non refermée** — l'extension clavier Haut/Bas en vue Mois reste ouverte et revient à la story 36.3, qui refond le chemin clavier.

**Évaluation SSE** — refaite, verdict inchangé : aucun câblage propre. Les bandes sont des `computed()` sur les mêmes signaux que la grille précédente, dans un écran déjà connecté. La dette sur `GET /me/calendar` reste héritée et non aggravée.

**Un test a échoué pour une bonne raison, et c'était le test qui avait tort.** Le cas « séance sans créneau » passait `undefined` à un paramètre à valeur par défaut, qui reprenait donc `'EVENING'`. Le code était juste ; le test a été réécrit pour construire une entrée réellement dépourvue de `slot`.

**✅ Vérification visuelle réelle faite** dans Chrome, sur l'application en marche :

| Vérifié | Résultat |
| --- | --- |
| Trois bandes pleine largeur, matin/après-midi/soir (AC1) | ✅ |
| Préséance bande par bande (AC2) | ✅ séance sur le seul créneau du soir, disponibilité conservée le matin |
| Formes : filet séance `inset 1px` à 75 %, trame 45° pas 3/6 px (AC3) | ✅ mesuré en CSS calculé |
| Fusion du jour uniforme (AC4) | ✅ une seule bande |
| Titre de séance tronqué à l'ellipse (AC5) | ✅ |
| Ancienne signalétique retirée (AC7) | ✅ 0 `.guild-dot`, 0 `.seance-dot`, 0 `.segment` dans le DOM |
| Perte du texte sous le seuil, structure conservée (AC8) | ✅ à 82 px de case |
| Le rail donne le détail en étroit (AC10) | ✅ |
| Hauteur de bande 20 px en large / structure en étroit | ✅ mesuré |
| Les quatre rangs distinguables sur les trois thèmes | ✅ tokens vérifiés un par un |

Le **vote** n'a pas pu être observé à l'écran : aucun vote en cours dans les données du compte de démo utilisé. Son rendu (liseré gauche 3 px) est couvert par les tests unitaires et le CSS, **mais pas validé à l'œil** — à regarder lors de la revue ou de la story 36.6.

### File List

**Modifiés — Web**
- `apps/web/src/app/features/calendar/day-detail.utils.ts` (`SlotWinner`, `SLOT_PRECEDENCE`, `winner`, `bandsAreUniform`, `buildMonthDetails`)
- `apps/web/src/app/features/calendar/day-detail.utils.spec.ts`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.scss`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.spec.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (`calendarEntries()`)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html` (nouveaux inputs du Mois)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`

**Non touchés (confirmé par `git status`)**
- `apps/api/**` · `packages/shared/**` · `apps/web/src/styles.scss` (aucun token nouveau) · `calendar-week-view/**` · `calendar-detail-rail/**` · `calendar-layer-toggle` · `constraint-panel` · `selection.utils.ts` · `selection-bar` · `available-slots` · `core/availability/compute-display-status.ts`.

### Change Log

- 2026-08-18 — **Revue de code (bmad-code-review), 3 couches parallèles (Blind Hunter, Edge Case Hunter, Acceptance Auditor). Statut → done.** 9 findings, 0 rejeté comme faux positif structurel (4 items de style/théoriques écartés en triage). 3 décisions utilisateur tranchées puis appliquées comme patches : (1) le rang `'vote'` retombe désormais sur le statut déclaré quand la couche `votes-en-cours` est éteinte (asymétrie avec la séance résolue — AC6 reste réservé à la séance) ; (2) `aria-label` d'une bande fusionnée annonce « Journée : … » au lieu de « Matin : … » ; (3) `buildMonthDetails()` câblé dans `buildMonth()` — une projection par mois (2 appels, réel + aperçu) au lieu de 42 appels individuels à `buildDayDetail()`, portée limitée à `CalendarMonthView` (le rail garde son propre `railDetail()`, arguments identiques donc aucune divergence). 6 patches supplémentaires appliqués : fuite de texte inter-rangs corrigée (`text` suit désormais `winner`, ne se rabat plus sur `pollLabel` quand `mes-seances` est éteinte) ; commentaire obsolète « segment » corrigé ; repli CSS ajouté sur `--jdr-status-todo`/`--jdr-status-soon` ; `[attr.data-status]` ajouté à la bande fusionnée pour la cohérence du contrat DOM ; `uniform` calculé sur l'aperçu pendant l'édition (`ConstraintPanel`) au lieu de l'état réel seul ; seuil du container query corrigé à `712px` (la gouttière réelle est 2px, pas 4px comme le commentaire le supposait). **Web 102 fichiers / 1654 tests, tous verts (baseline inchangée). Lint 143 = baseline, zéro erreur nouvelle sur les fichiers touchés.**
- 2026-08-18 — **Implémentation complète (Tasks 1 à 8, bmad-dev-story). Statut → review.** La préséance a été ACHEVÉE et non réinventée : `SlotWinner`, `SLOT_PRECEDENCE` et le champ `winner` ajoutés à `day-detail.utils.ts`, consommés par le rail ET la case — la règle n'est écrite qu'une fois, les 16 tests du rail passent sans modification. `buildMonth()` ne rejoue aucun arbitrage : il projette le résultat de `buildDayDetail()` en bandes, et n'appelle plus `computeDisplayStatus()` directement. SEUIL EN CONTAINER QUERY (`container-type: inline-size`, 724 px de grille = 7 cases de 100 px) plutôt qu'en media query — vérifié en conditions réelles : texte affiché à 124 px de case, masqué à 82 px, les trois bandes restant dans les deux cas. DÉFAUT VISUEL TROUVÉ À L'ÉCRAN ET CORRIGÉ, qu'aucun test ne pouvait attraper : les rangées ondulaient (106 px avec une case à trois bandes, 94 px sans) — `grid-auto-rows: minmax(0, 1fr)`. Le piège n°3 de la story s'est confirmé : en Atelier Cuivré `--color-available` (#4a7c59) diffère de `--jdr-accent-1` (#cd7f32), suivre `DESIGN.md` à la lettre aurait donné une bande « disponible » bronze. Ancienne signalétique retirée (0 `.guild-dot`, 0 `.seance-dot`, 0 `.segment` dans le DOM) ; les deux tests protégeant `fromSegment` ont été TRANSPOSÉS sur `.band`, pas supprimés. ⚠️ PERTE TEMPORAIRE ASSUMÉE : la tendance du groupe disparaît de la case jusqu'à la story 36.8, qui la rétablira par créneau sur un canal séparé. Dette refermée : l'item « vote masqué par une séance, non tranché formellement » (36.1). Dette laissée à 36.3 : extension clavier Haut/Bas. **Web 102 fichiers / 1654 tests (baseline 102/1616, +38), tous verts.** Lint 143 = baseline, zéro erreur introduite. Build : seul le budget de bundle pré-existant échoue, 1,36 Mo inchangé. Story front-only. ✅ VÉRIFICATION VISUELLE RÉELLE FAITE (trois bandes, préséance, formes, fusion, troncature, seuil, trois thèmes) — seule réserve : aucun vote en cours dans les données de démo, le liseré du vote est couvert par les tests mais **pas validé à l'œil**.
- 2026-08-18 — Story créée (bmad-create-story), trois sous-agents d'exploration (code de la vue Mois, specs UX de la case, PRD/architecture/tokens). Trois encadrés consignés : (1) **la préséance existe déjà à moitié** — `buildDayDetail()` livré par 36.1 arbitre déjà séance > déclaration ; la story l'achève par un champ `winner` et une table nommée, servant rail ET case, plutôt que de bâtir un second module ; elle referme au passage un item de `deferred-work.md` ; la préséance a **quatre rangs**, pas cinq (« non déclaré » n'est pas un rang, et le groupe en est sorti le 2026-08-17 → story 36.8). (2) **Les données sont déjà là, par créneau typé et non filtrées** — `allCalendarEntries()` couvre les deux contextes sans appel supplémentaire ; les inputs `[heatmap]`/`[seanceDates]` du Mois sont à remplacer, mais `seanceMarkerDates()` reste requis par la vue Semaine. (3) **⚠️ Trois écarts entre la planche contractuelle et la spec écrite**, chacun tranché avec son motif : forme du vote (liseré retenu contre le filet des maquettes, sans quoi séance et vote ne se distinguent que par la couleur — P-1), texte en mobile (aucun texte, trois textes concordants contre un détail de rendu), condition de fusion (la troisième condition de la planche appartient à 36.8). Treize AC : les dix d'`epics.md` verbatim + AC11 (séance sans vote = `FULL_DAY` = trois bandes, AD-9), AC12 (42 arrêts de tabulation, pas 126), AC13 (zéro appel réseau). Pièges majeurs consignés : `align-items: center` bloque les bandes pleine largeur ; `--jdr-status-unavailable`/`--jdr-status-unknown` **n'existent pas** dans le code ; « disponibilités = `accent-1` » est faux hors Grimoire Émeraude ; deux tests existants ciblant `.segment` vont casser et doivent être réécrits, pas supprimés. Trois questions remontées à l'utilisateur (forme du vote, container query vs media query, perte temporaire de la tendance du groupe entre 36.2 et 36.8).
