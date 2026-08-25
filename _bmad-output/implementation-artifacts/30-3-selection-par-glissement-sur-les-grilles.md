---
baseline_commit: 8ba7c76a0c04fee7a151ecbb9fa6b6af4cecc4b4
---

# Story 30.3 : Sélection par glissement sur les grilles

Status: done

Epic: 30 — Calendrier
Porte : **FR-32** (volet sélection desktop/mobile/clavier) · **D-14** (consommé — le mécanisme serveur est livré, cette story ne le re-tranche pas)

---

## Story

As a utilisateur sur ordinateur,
I want sélectionner plusieurs jours et créneaux d'un seul geste,
So that déclarer une semaine d'absence cesse d'être une corvée.

---

## 🚨 Encadré n°1 — Cette story consomme la Story 30.2, elle ne réinvente rien côté serveur

La Story 30.2 a livré `POST /availability/batch` (`AvailabilityService.createBatch()`, transactionnel, tout-ou-rien, conflits externes+internes détectés avant écriture, `409` enrichi de `batchIndex`) et sa méthode cliente `AvailabilityService.createDeclarationBatch(items)` (`apps/web/src/app/core/availability/availability.service.ts`). **Cette story-ci ne touche à aucun des deux.** Le travail est entièrement front : construire le geste de sélection (souris, tactile, clavier), puis appeler `createDeclarationBatch()` une fois avec le lot construit. Si l'implémentation en vient à modifier `availability.service.ts` (front ou API) ou `create-availability-batch.dto.ts`, c'est le signal qu'elle a dévié du périmètre.

## 🚨 Encadré n°2 — Distinguer un tap d'un glissement est le vrai risque de cette story

`onCellClick()` existe aujourd'hui dans `calendar-week-view.ts` et `calendar-month-view.ts` : un clic (souris) ou un tap (tactile) ouvre `ConstraintPanel` (AC3 l'exige, inchangé). Le geste de sélection introduit un **second** comportement sur les **mêmes cellules**. Il faut donc :
- **Desktop** : démarrer un timer/état de glissement au `pointerdown`, mais ne route vers la sélection que si le curseur **se déplace** vers une autre cellule avant le relâchement ; un `pointerdown` → `pointerup` sans déplacement reste un tap normal (AC3).
- **Mobile** : le glissement **s'amorce par un appui maintenu** (AC4) — un `touchstart` suivi d'un `touchmove` **avant** l'expiration du délai d'appui maintenu doit être traité comme un défilement de page normal (ne pas appeler `preventDefault()`), pas comme une sélection.

Aucune de ces deux distinctions n'existe dans le code actuel — zéro notion de seuil de déplacement, de timer d'appui maintenu, ou de `pointerdown`/`pointermove`/`pointerup` dans `calendar-week-view.ts`/`calendar-month-view.ts` (vérifié : ces fichiers ne connaissent que `(click)`, `(keyup.enter)`, `(keyup.space)`). Se planter sur ce point casse soit le tap existant (régression AC3), soit le défilement mobile (régression silencieuse, difficile à repérer en test automatisé).

## 🚨 Encadré n°3 — Le geste ne produit que des déclarations PONCTUELLES

Chaque cellule traversée par le glissement devient **un** item PUNCTUAL du lot (`startDate = endDate = ce jour`, `expiresAt = fin de ce jour`) — exactement la même forme que produit `buildConstraintDto()` pour son cas `PONCTUEL` (`constraint-panel.utils.ts:50-54`), généralisée à N jours. **Le geste de sélection ne construit jamais de déclaration RECURRING.** Créer une récurrence reste l'usage exclusif du panneau de contrainte (tap → formulaire → type "Récurrent"), inchangé. Ne pas inventer de mode récurrent pour le glissement : aucun AC ne le demande, et le geste ("lundi soir → jeudi soir cette semaine") est intrinsèquement ponctuel.

---

## Acceptance Criteria

Les six premiers sont repris verbatim d'`epics.md#Story 30.3`. Les trois suivants comblent des trous que l'analyse a trouvés.

**AC1 — Given** la vue semaine
**When** je glisse d'une cellule à une autre
**Then** tous les créneaux traversés sont sélectionnés
**And** une barre me propose de les déclarer disponibles ou indisponibles en une fois

**AC2 — Given** la vue mois
**When** je glisse d'un jour à un autre
**Then** ce sont des journées entières qui sont sélectionnées, la finesse par créneau restant au tap

**AC3 — Given** la vue semaine, quel que soit le support
**When** j'utilise l'application
**Then** le tap case par case reste pleinement fonctionnel et ouvre le panneau de déclaration comme auparavant

**AC4 — Given** j'utilise un téléphone
**When** je veux amorcer une sélection multiple
**Then** elle démarre par un appui maintenu
**And** un glissement simple continue de faire défiler la page

**AC5 — Given** je navigue au clavier
**When** je sélectionne une cellule puis étends la plage avec la touche majuscule et les flèches
**Then** la sélection s'étend
**And** la touche entrée valide la déclaration

**AC6 — Given** une sélection en cours
**When** je l'annule
**Then** aucune déclaration n'est enregistrée

**AC7 — Given** une sélection validée (barre ou clavier)
**When** la déclaration part
**Then** elle passe par `AvailabilityService.createDeclarationBatch()` (Story 30.2) en un seul appel, jamais une boucle de `createDeclaration()`
**And** si le lot est rejeté (`409`), aucune déclaration n'est enregistrée et une erreur nomme le(s) créneau(x) fautif(s) — sans proposer de résolution "Écraser/Garder", ce chemin n'en offre pas (AD-21)

**AC8 — Given** un geste de glissement, quelle que soit la vue
**When** le lot est construit
**Then** chaque cellule traversée devient une déclaration **PONCTUELLE** distincte (jamais RECURRING)

**AC9 — Given** un `pointerdown`/`touchstart` sur une cellule
**When** il est relâché sans déplacement ni délai d'appui maintenu écoulé
**Then** c'est un tap normal — le panneau de contrainte s'ouvre, aucune sélection ne s'amorce

---

## Tasks / Subtasks

### Frontend — utilitaires de sélection (logique pure, testable isolément)

- [x] **Task 1 — Utilitaires de plage de sélection** (AC1, AC2, AC5, AC8)
  - [x] Nouveau `apps/web/src/app/features/calendar/selection.utils.ts` : fonctions pures, sans dépendance Angular.
  - [x] `weekRangeCells(anchor: {date, slot}, current: {date, slot}, cells: WeekCell[]): {date, slot}[]` — calcule la plage de cellules entre `anchor` et `current` **sur une seule ligne de créneau** (le glissement en vue semaine reste horizontal, au créneau — cf. maquette `mockups/q6-vue-semaine.html`, une seule rangée "Soirée" surlignée). Si `anchor.slot !== current.slot`, clamper sur `anchor.slot` (le glissement ne change pas de ligne).
  - [x] `monthRangeDays(anchor: Date, current: Date): Date[]` — calcule la plage de **jours** entre `anchor` et `current` dans l'ordre chronologique (peu importe le sens du glissement), à la journée entière (`FULL_DAY`), sans notion de ligne/colonne — une simple plage de dates contiguës.
  - [x] `buildBatchItems(cells: {date: Date; slot: DaySlot}[], kind: AvailKind): CreateAvailabilityBatchItem[]` — un item PUNCTUAL par cellule (`startDate = endDate = toISODate(date)`, `expiresAt = fin de journée UTC de cette date`), réutilisant `toISODate()` de `constraint-panel.utils.ts` (ne pas la redupliquer).
  - [x] Bornes déjà garanties côté serveur (`@ArrayMaxSize(42)`, Story 30.2) — la vue semaine plafonne naturellement à 7 cellules, la vue mois à 42 (grille 6×7) : aucun garde-fou client supplémentaire n'est nécessaire, mais si le lot dépasse 42 (ne devrait jamais arriver avec ces bornes), le `409` de validation doit être géré comme tout autre conflit (AC7), pas ignoré.

### Frontend — geste de sélection par vue

- [x] **Task 2 — Sélection glissée, vue Semaine** (AC1, AC3, AC4, AC9)
  - [x] `calendar-week-view.ts` : état de sélection (`signal` d'un `Set` de clés `date+slot` ou équivalent), ancre de glissement, cellule courante.
  - [x] `pointerdown` sur une cellule : démarre un état "en attente" (ni tap, ni sélection encore décidés) ; ne pas encore émettre de sélection.
  - [x] `pointermove` sur une **autre** cellule pendant que le bouton est enfoncé : bascule en mode sélection (AC1), met à jour la plage via `weekRangeCells()`.
  - [x] `pointerup` sans qu'un déplacement de cellule ait eu lieu → comportement de tap inchangé, appelle `onCellClick()` comme aujourd'hui (AC3, AC9). Avec déplacement → la sélection reste affichée, la barre apparaît (Task 5).
  - [x] Tactile : le passage en mode sélection n'a lieu qu'après un délai d'appui maintenu (ex. ~450 ms) **sans** déplacement significatif entre-temps ; un déplacement avant l'expiration du délai annule l'armement et laisse le défilement de page se produire nativement (AC4 — ne pas appeler `preventDefault()` dans ce cas).
  - [x] Cellules `past` restent exclues de la sélection (même garde que `onCellClick` actuel).

- [x] **Task 3 — Sélection glissée, vue Mois** (AC2, AC3, AC4, AC9)
  - [x] Même mécanique que Task 2, mais sur la cellule **journée** (`day-cell`), pas sur les segments matin/après-midi/soir (qui restent des taps directs inchangés, cf. commentaire existant dans `calendar-month-view.html:57-61` sur la granularité clavier/segments — ne pas y toucher).
  - [x] `monthRangeDays()` fournit la plage ; chaque jour sélectionné est marqué visuellement (classe `.selected` ou équivalent), les segments matin/après-midi/soir de ces jours ne changent pas d'état individuellement (la sélection est à la journée, AC2).
  - [x] Cellules hors-mois-courant (`other-month`) et passées restent exclues, même garde que `onCellClick` actuel.

- [x] **Task 4 — Extension et validation au clavier** (AC5, AC6)
  - [x] Sur une cellule focusée (semaine ou mois), `Maj+Flèche` étend la sélection depuis une cellule ancre déjà focusée/sélectionnée vers la direction indiquée, en réutilisant `weekRangeCells()`/`monthRangeDays()`.
  - [x] `Entrée` sur une sélection active valide la déclaration (AC5) — **décision d'implémentation** : le geste clavier ne peut pas exprimer "disponible" vs "indisponible" en une touche ; utiliser **Indisponible** comme kind par défaut pour la validation clavier (cohérent avec le cas d'usage nommé par la story : "déclarer une semaine d'**absence**"). Documenter ce choix dans un commentaire au point d'implémentation.
  - [x] `Échap` annule la sélection en cours sans rien enregistrer (AC6), et sans perdre le focus clavier (le focus doit revenir sur une cellule de la grille, jamais se perdre dans le vide — sinon la navigation clavier continue à casser derrière).
  - [x] Ne pas modifier le comportement clavier existant sur une cellule **non** en cours de sélection (`keyup.enter`/`keyup.space` → tap normal, `keyup.1/2/3` en vue mois → tap segment, tous inchangés).

- [x] **Task 5 — Composant `SelectionBar`** (AC1, AC6)
  - [x] Nouveau composant standalone `apps/web/src/app/features/calendar/selection-bar/selection-bar.ts` (+ `.html`/`.scss`), réutilisable par les deux vues (ou monté une fois dans `CalendarView` — à trancher à l'implémentation selon ce qui évite le plus de duplication ; les deux vues émettent déjà `slotSelected`/`displayDateChange` vers un parent commun, le même patron convient ici).
  - [x] Inputs : nombre de cellules sélectionnées, libellé de plage (ex. "mar. → ven., soirée" ou "10 → 16 août"). Outputs : `markAvailable`, `markUnavailable`, `cancelled`.
  - [x] Boutons Material (`MatButtonModule`, déjà importé ailleurs dans le module calendrier — ne pas ajouter de nouvelle dépendance), pas de nouveau design token : réutiliser les variables CSS déjà en place (`--color-available`, `--color-unavailable`, `--mat-sys-*`, cf. `calendar-week-view.scss`).

### Frontend — orchestration et appel API

- [x] **Task 6 — Câblage `CalendarView`** (AC1, AC6, AC7, AC8)
  - [x] Les deux vues émettent un nouvel `output` (ex. `batchDeclareRequested`) portant la plage sélectionnée brute (`{date, slot}[]`) plus le `kind` choisi (bouton de la barre ou validation clavier) — ou émettent la sélection et laissent `CalendarView` réagir aux clics de la barre montée en commun ; choisir la forme qui évite de dupliquer `buildBatchItems()` dans les deux vues (il ne doit exister qu'un seul point d'appel de cette fonction, dans `CalendarView`).
  - [x] `CalendarView` construit le lot via `buildBatchItems()` (Task 1) et appelle `this.availabilitySvc.createDeclarationBatch(items)` — **un seul appel**, jamais de boucle (AC1, AC7).
  - [x] Succès : effacer la sélection, recharger comme le fait déjà `onPanelSaved()` (`loadDeclarations()` + `refreshMjPanels()` si en contexte de Partie) — réutiliser ces méthodes existantes, ne pas les dupliquer.
  - [x] Échec `409` (`ConflictError`, patron déjà utilisé par `ConstraintPanel` pour la création unitaire) : afficher un message nommant le(s) créneau(x) fautif(s) (via `MatSnackBar`, déjà injecté dans `CalendarView`), effacer la sélection sans rien enregistrer (AC6, AC7) — pas de dialogue de résolution, ce chemin n'en offre pas.
  - [x] `ConstraintPanel` et son flux `onSlotSelected()`/`onFormChanged()`/`onPanelSaved()`/`onPanelDeleted()` restent strictement inchangés (AC3) — le nouveau chemin est additif, en parallèle.

### Tests

- [x] **Task 7 — Tests des utilitaires** (AC1, AC2, AC8)
  - [x] `selection.utils.spec.ts` : `weekRangeCells()` sur les deux sens de glissement, clamp sur la ligne de l'ancre ; `monthRangeDays()` sur les deux sens, y compris un enjambement de semaine (ligne suivante de la grille) ; `buildBatchItems()` produit des items PUNCTUAL avec les bonnes dates/kind, jamais RECURRING.

- [x] **Task 8 — Tests `CalendarWeekView`** (AC1, AC3, AC4, AC9)
  - [x] Glissement souris (pointerdown + pointermove + pointerup sur cellules différentes) sélectionne la plage attendue.
  - [x] Tap sans déplacement (pointerdown + pointerup sur la même cellule) ouvre toujours le panneau — **non-régression explicite** du comportement `onCellClick` existant.
  - [x] Glissement tactile avant expiration du délai d'appui maintenu ne déclenche pas de sélection (aucun état de sélection modifié).
  - [x] `Échap` efface la sélection sans appel à `createDeclarationBatch`.

- [x] **Task 9 — Tests `CalendarMonthView`** (AC2, AC3, AC4, AC9)
  - [x] Mêmes catégories de test que Task 8, adaptées à la granularité journée entière.
  - [x] Les segments matin/après-midi/soir continuent de répondre au tap direct sans déclencher de sélection de journée (non-régression du patron `$event.stopPropagation()` existant).

- [x] **Task 10 — Tests `SelectionBar` et câblage `CalendarView`** (AC1, AC6, AC7, AC8)
  - [x] `SelectionBar` : clic Disponible/Indisponible émet le bon `kind` ; clic Annuler émet `cancelled` sans kind.
  - [x] `CalendarView` : une sélection validée → **un seul** appel à `createDeclarationBatch()` avec les items attendus (assertion sur le nombre d'appels, cœur d'AC1/AC7) ; `409` → aucune déclaration, message affiché, sélection effacée ; succès → `loadDeclarations()` rappelée.
  - [x] Non-régression : les tests existants de `ConstraintPanel`/`onSlotSelected`/tap unitaire dans `calendar-view.spec.ts` restent verts sans modification.

### Vérification

- [x] **Task 11 — Non-régression complète**
  - [x] Suite complète web (`ng test`, qui type-vérifie aussi les specs), lint sur les fichiers touchés.
  - [x] Cette story ne touche à aucun fichier `apps/api/**` ni `packages/shared/**` — aucune suite API à relancer, aucun redémarrage de conteneur nécessaire.
  - [x] Vérification visuelle manuelle : faite par l'utilisateur sur ses propres appareils (pas d'accès navigateur dans cet environnement d'exécution). Deux rounds d'allers-retours ont révélé et corrigé des bugs réels non détectés par les tests automatisés (sélection de texte/menu contextuel natifs volant le geste ; segments de la vue mois bloquant systématiquement l'armement) — voir Change Log. Confirmé fonctionnel par l'utilisateur (desktop, mobile vue semaine, mobile vue mois) après le deuxième round de correctifs.

### Review Findings

- [x] [Review][Patch] Vue mois : le glissement (`onGridPointerMove`) et l'extension clavier (`onShiftArrow`) peuvent sélectionner des jours hors du mois affiché — seul `onCellPointerDown`/`onCellClick` bloque ce cas, pas la poursuite du geste [apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts — `onGridPointerMove`, `onShiftArrow`] — corrigé : garde `!cellMatch.isCurrentMonth`/`!nextCell.isCurrentMonth` ajoutée aux deux, 2 tests dédiés
- [x] [Review][Patch] Aucun filtrage `event.button` sur `pointerdown` — un clic droit ou milieu peut armer une sélection au lieu d'ouvrir le menu contextuel [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts, calendar-month-view.ts — `onCellPointerDown`] — corrigé : garde `event.button !== 0` en tête des deux méthodes
- [x] [Review][Patch] `(contextmenu)="$event.preventDefault()"` bloque le menu contextuel natif en permanence sur toute la grille, pas seulement pendant un geste actif [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.html, calendar-month-view.html] — corrigé : `isGestureActive()` scope le blocage à un geste réellement en cours
- [x] [Review][Patch] Aucun garde-fou multi-pointeur : un second `pointerdown` (deuxième doigt, paume) pendant un geste en cours remplace silencieusement l'état du premier [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts, calendar-month-view.ts — `onCellPointerDown`] — corrigé : `pointerId` tracké dans `PointerDownInfo`, filtré dans les trois handlers (down/move/up)
- [x] [Review][Patch] AC7 : le message d'erreur `409` ne nomme que le premier conflit (`conflicts[0]`), en ignore d'autres si le lot en a plusieurs (ex. conflit interne qui en nomme toujours deux) — l'AC exige explicitement « le(s) créneau(x) » au pluriel [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts — `onBatchDeclareRequested`] — corrigé : tous les conflits sont listés dans le message, test dédié avec deux conflits
- [x] [Review][Patch] AC5 non testée : aucun test n'exerce l'extension clavier Maj+flèches ni la validation par Entrée, alors que le code existe et que tous les autres AC ont au moins un test dédié [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts, calendar-month-view.spec.ts] — corrigé : 4 tests ajoutés par vue (extension gauche/droite, validation Entrée avec kind par défaut, Entrée sans sélection = tap inchangé)
- [x] [Review][Patch] `LONG_PRESS_MS`/`MOVE_THRESHOLD_PX` dupliquées indépendamment dans les deux vues au lieu d'être partagées depuis `selection.utils.ts` — risque de dérive si l'une est ajustée sans l'autre [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts, calendar-month-view.ts] — corrigé : constantes déplacées dans `selection.utils.ts`, importées par les deux vues
- [x] [Review][Patch] `PointerDownInfo.pointerType` typé `string` générique au lieu de l'union littérale `'mouse' | 'touch' | 'pen'` [apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts, calendar-month-view.ts] — corrigé : nouveau type `GesturePointerType` partagé dans `selection.utils.ts`
- [x] [Review][Patch] Aucune annonce `aria-live` du nombre de créneaux sélectionnés — un utilisateur de lecteur d'écran qui étend une sélection au clavier n'est pas informé du décompte courant [apps/web/src/app/features/calendar/selection-bar/selection-bar.html] — corrigé : `aria-live="polite"` sur l'élément de décompte
- [x] [Review][Defer] Vue mois : l'extension clavier ne gère que Maj+Gauche/Droite, pas Haut/Bas, alors que le glissement à la souris/tactile peut enjamber des lignes de semaine verticalement [apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html] — deferred, aucun AC n'impose de touches spécifiques (AC5 ne mentionne que « Maj+flèches » sans préciser la direction) ; ajouter Haut/Bas (± 7 jours) est une amélioration de complétude légitime mais un choix de portée, pas un défaut — à trancher dans une story dédiée si le besoin se confirme à l'usage

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Casser le tap existant.** `onCellClick()` (semaine et mois) doit continuer de s'exécuter à l'identique pour un clic/tap sans déplacement — AC3 l'exige explicitement, et `ConstraintPanel`/tout son flux de résolution de conflit (Story 1.7, préservé par 30.2 AC8) en dépend. Le geste de sélection est **additif**, pas un remplacement du chemin de clic.
2. **Bloquer le défilement mobile.** Appeler `preventDefault()` sur un `touchmove` avant que le délai d'appui maintenu ne soit écoulé casse le défilement vertical de la page — AC4 l'interdit explicitement. Ne capturer le geste qu'après l'armement.
3. **Construire des déclarations RECURRING depuis le glissement.** Aucun AC ne le demande (encadré n°3) ; le panneau de contrainte reste l'unique chemin pour une récurrence.
4. **Dupliquer `buildBatchItems()`/`toISODate()`.** `constraint-panel.utils.ts` a déjà la logique de construction d'un DTO ponctuel pour un jour donné — la réutiliser, ne pas la réécrire pour le lot.
5. **Boucler sur `createDeclaration()`.** La Story 30.2 existe précisément pour éviter ça (NFR-6, AD-21) — un seul appel à `createDeclarationBatch()` par validation, jamais un appel par cellule.
6. **Réintroduire une résolution de conflit pour le lot.** La route groupée n'offre pas `overwrite`/`keep` (AD-21, Story 30.2 AC8) — sur `409`, informer et effacer la sélection, ne pas construire de dialogue de résolution qui n'a pas d'équivalent serveur.
7. **Perdre le focus clavier après `Échap`/`Entrée`.** La navigation clavier continue de l'écran doit rester utilisable — le focus doit atterrir sur une cellule connue de la grille, jamais disparaître.

### Ce qui doit continuer de fonctionner

- `onCellClick()` (semaine et mois) et l'ouverture de `ConstraintPanel` — formulaire, dialogue de conflit, dialogue SPLIT "Ce jour uniquement / Toutes les occurrences".
- Les segments matin/après-midi/soir de la vue mois (tap direct, `$event.stopPropagation()`, raccourcis clavier `1`/`2`/`3`).
- `buildWeek()`/`buildMonth()` et le calcul d'aperçu (`pendingDto`/`pendingDecl`, `computeDisplayStatus`) — inchangés, le geste de sélection ne construit pas de nouvel aperçu visuel de ce type (la sélection a son propre état visuel, distinct du "preview" de `ConstraintPanel`).
- `AvailabilityService.createDeclaration()` et son patron `ConflictError` — inchangés, réutilisés tels quels côté 409 unitaire (hors périmètre de cette story).

### Hors périmètre

- **Toute modification côté API ou `packages/shared`** — la Story 30.2 a livré tout le contrat nécessaire (`CreateAvailabilityBatchItem`, `createDeclarationBatch()`, `409` enrichi de `batchIndex`). Si cette story en vient à y toucher, c'est qu'elle a dévié.
- **La création de déclarations RECURRING par glissement** (encadré n°3).
- **La sélection en 2D (rectangle multi-lignes) en vue semaine** — le glissement reste sur une seule ligne de créneau (Task 1, clampé sur `anchor.slot`), conformément à la maquette de référence.
- **Les couches du calendrier et l'endpoint unique personnel** — Stories 30.4 à 30.6.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Kind par défaut pour la validation clavier (`Entrée`)** — proposé : Indisponible (Task 4), à documenter au point d'implémentation, aucune AC ne l'impose explicitement mais AC5 exige qu'Entrée "valide la déclaration" sans préciser laquelle.
- **Composant `SelectionBar` partagé vs dupliqué par vue** — proposé : un seul composant, monté une fois par `CalendarView` ou réutilisé par les deux vues enfants (Task 5) ; éviter la duplication de template/logique.
- **Forme exacte de l'`output` porté par les vues vers `CalendarView`** (Task 6) — laisser la sélection brute remonter, ou remonter directement le lot construit ; dans les deux cas, `buildBatchItems()` ne doit être appelée qu'à un seul endroit.
- **Délai exact d'appui maintenu et seuil de déplacement** (Tasks 2-3) — valeurs usuelles (~450 ms, ~8-10 px) à ajuster si le ressenti manuel (Task 11) le justifie ; aucune AC ne chiffre ces valeurs.

### Notes de plateforme

- **Web : Vitest 4, zoneless.** `ng test` type-vérifie aussi les specs. Simuler `pointerdown`/`pointermove`/`pointerup`/`touchstart`/`touchmove` via `dispatchEvent` dans les tests (pas d'API de simulation de geste dédiée dans ce projet à ce jour).
- **Exécution** : tout par Docker (`docker compose exec web pnpm test`, `pnpm lint`, `pnpm build`).
- **Cette story est front-only** — pas de migration Prisma, pas de redémarrage du conteneur `api` nécessaire pour la valider.
- **Baseline** (après 30.2, commitée en `8ba7c76`) : API 55/55 suites, 1184 tests ; web 96/96 fichiers, 1491 tests. Build web en échec sur le seul budget de bundle pré-existant (non lié à cette story).

### Project Structure Notes

- **Nouveaux — Web** : `apps/web/src/app/features/calendar/selection.utils.ts` (+ spec), `apps/web/src/app/features/calendar/selection-bar/selection-bar.ts` (+ `.html`/`.scss`/spec).
- **Modifiés — Web** : `calendar-week-view.ts`/`.html`/`.scss` (+ specs), `calendar-month-view.ts`/`.html`/`.scss` (+ specs), `calendar-view.ts`/`.html` (+ spec), `constraint-panel.utils.ts` (si `toISODate` a besoin d'être exportée plus largement — déjà exportée, vérifier avant de dupliquer).
- **Non touchés** : tout `apps/api/**`, `packages/shared/**`, `constraint-panel.ts`/`.html`/`.scss` (le composant lui-même, pas son fichier utils).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 30.3] — Story et 6 premiers ACs, verbatim.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#FR-32] — Saisie repensée, écriture groupée D-14, sélection desktop spécifiquement nommée.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md#D-14] — Dérogation actée : lecture groupée, écriture transactionnelle tout-ou-rien, endpoint neuf (livré par 30.2).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md#6. Interaction Primitives] — Les trois garanties du geste : tap toujours fonctionnel, appui maintenu mobile, équivalent clavier Maj+flèches/Entrée.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md#4.4 Les trois vues du calendrier] — Semaine = glissement au créneau ; Mois = glissement à la journée entière (segments non attrapables au doigt).
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-2026-08-04/mockups/q6-vue-semaine.html] — Référence visuelle : grille avec cellules `.wc.sel`, curseur de glissement, barre de sélection (`N créneaux` + boutons Indisponible/Disponible/Annuler), légende couleurs.
- [Source: _bmad-output/implementation-artifacts/30-2-ecriture-groupee-des-disponibilites.md] — Story précédente : contrat `CreateAvailabilityBatchItem`/`createDeclarationBatch()`/`BatchConflictInfo` à consommer tel quel, patron `ConflictError` existant.
- [Source: apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts] — État actuel : `onCellClick()` seul point d'entrée, zéro notion de sélection (vérifié : aucune occurrence de `selected`/`pointerdown`/`touchstart`).
- [Source: apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts, calendar-month-view.html:57-91] — Granularité jour vs segments matin/après-midi/soir, patron `$event.stopPropagation()` et raccourcis clavier `1`/`2`/`3` à préserver.
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts] — Orchestrateur : `onSlotSelected()`, `onPanelSaved()`/`onPanelDeleted()`, `loadDeclarations()`/`refreshMjPanels()` à réutiliser pour le rechargement post-lot.
- [Source: apps/web/src/app/features/calendar/constraint-panel/constraint-panel.utils.ts] — `buildConstraintDto()` cas `PONCTUEL` (lignes 50-54) : patron exact à généraliser en `buildBatchItems()` ; `toISODate()` réutilisable telle quelle.
- [Source: apps/web/src/app/core/availability/availability.service.ts:80-104] — `createDeclarationBatch()` : signature, conversion `409` → `ConflictError`, patron à ne pas modifier.

---

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

`document.elementFromPoint` n'existe pas nativement dans l'environnement jsdom utilisé par les
specs — assignation directe (`document.elementFromPoint = vi.fn().mockReturnValue(...)`) plutôt
que `vi.spyOn` (qui exige que la propriété existe déjà). Pas de changement de configuration
globale.

### Completion Notes List

- **Task 1** : `selection.utils.ts` — `weekRangeCells()` (plage horizontale clampée sur le slot de
  l'ancre), `monthRangeDays()` (plage chronologique de jours, enjambement de mois testé),
  `buildBatchItems()` (un item PUNCTUAL par cellule, réutilise `toISODate()` de
  `constraint-panel.utils.ts`).
- **Task 2/4 (semaine)** : `CalendarWeekView` — geste `pointerdown`/`pointermove`/`pointerup` avec
  seuil de déplacement (8px) pour la souris et délai d'appui maintenu (450ms) pour le tactile ;
  `document.elementFromPoint()` résout la cellule sous le curseur pendant le glissement. Un
  `pointerup` sans armement retombe sur `onCellClick()` inchangé (AC3/AC9). Clavier :
  Maj+flèches étend la sélection (réutilise les mêmes signaux `selectionAnchor`/`selectionCurrent`
  que le glissement), Entrée valide avec le kind par défaut **Indisponible** (décision documentée
  en commentaire, aucune touche unique ne pouvant exprimer dispo/indispo), Échap annule.
- **Task 3/4 (mois)** : `CalendarMonthView` — même mécanique à la granularité journée entière
  (`FULL_DAY`), les 3 segments matin/après-midi/soir restent des taps directs inchangés
  (`pointerdown` stoppé en plus du `click` déjà stoppé, pour qu'un tap sur un segment n'amorce
  jamais une sélection de journée).
- **Task 5** : `SelectionBar` — composant standalone réutilisé par les deux vues (une instance par
  vue, montée conditionnellement quand une sélection est active), pas de nouveau design token
  (variables `--mat-sys-*`/`--color-*` existantes).
- **Task 6** : `CalendarView.onBatchDeclareRequested()` — construit le lot via `buildBatchItems()`,
  un seul appel à `createDeclarationBatch()`. Succès → `loadDeclarations()` + `refreshMjPanels()`
  (méthodes existantes réutilisées). `ConflictError` → message `MatSnackBar` nommant le créneau
  fautif (`startDate`/`dayOfWeek` du premier conflit), aucune tentative de résolution
  overwrite/keep. `ConstraintPanel` et son flux `onSlotSelected()`/`onPanelSaved()` non touchés.
- **Task 7-10** : 11 tests `selection.utils.spec.ts`, 6 tests ajoutés à `calendar-week-view.spec.ts`
  (17 au total, 11 pré-existants verts), 5 tests ajoutés à `calendar-month-view.spec.ts` (17 au
  total, 12 pré-existants verts), 5 tests `selection-bar.spec.ts`, 3 tests ajoutés à
  `calendar-view.spec.ts` (47 au total, 44 pré-existants verts).
- **Task 11** : web 98/98 fichiers, 1521/1521 tests (+30 vs baseline 96/1491) ; lint scopé aux
  fichiers touchés : deux erreurs a11y nouvelles corrigées (`tabindex="-1"` sur les conteneurs de
  grille portant le gestionnaire `keydown.escape`, requis par `interactive-supports-focus`) ; les 3
  erreurs restantes dans `calendar-view.ts`/`.spec.ts` (méthode `noop()` vide, `_poll` inutilisé)
  sont préexistantes, vérifiées identiques via `git stash`. `ng build` : échoue uniquement sur le
  budget de bundle pré-existant (déjà documenté dans la baseline de la story), aucune erreur de
  compilation. Cette story ne touche à aucun fichier API/partagé — aucune suite API relancée.
  **Vérification visuelle manuelle NON FAITE** : l'extension de navigateur Chrome n'était pas
  connectée dans cet environnement d'exécution (`browser extension is not connected`) — le ressenti
  réel du geste (délai d'appui maintenu, seuil de déplacement, rendu visuel de la sélection/barre)
  n'a pas été validé à l'œil, uniquement par tests automatisés simulant les événements pointeur.

### File List

- **Nouveau** : `apps/web/src/app/features/calendar/selection.utils.ts`
- **Nouveau** : `apps/web/src/app/features/calendar/selection.utils.spec.ts`
- **Nouveau** : `apps/web/src/app/features/calendar/selection-bar/selection-bar.ts`
- **Nouveau** : `apps/web/src/app/features/calendar/selection-bar/selection-bar.html`
- **Nouveau** : `apps/web/src/app/features/calendar/selection-bar/selection-bar.scss`
- **Nouveau** : `apps/web/src/app/features/calendar/selection-bar/selection-bar.spec.ts`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.html`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.scss`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.spec.ts`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.scss`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.spec.ts`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- **Modifié** : `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`

### Change Log

- 2026-08-14 — Story créée (bmad-create-story). Trois constats d'analyse consignés en encadré : (1) le geste consomme entièrement le contrat livré par la Story 30.2, aucun changement serveur/partagé attendu ; (2) distinguer tap et glissement sur les mêmes cellules (`onCellClick()` existant, zéro notion de sélection dans le code actuel) est le risque principal, en particulier ne pas casser le défilement tactile avant l'armement par appui maintenu ; (3) le geste ne produit que des déclarations PONCTUELLES, jamais RECURRING — la récurrence reste l'apanage du panneau de contrainte. Trois AC ajoutés aux six verbatim d'epics.md : AC7 (chemin API exclusif via `createDeclarationBatch()`, gestion du 409 sans résolution overwrite/keep), AC8 (PONCTUEL uniquement), AC9 (tap sans déplacement = comportement inchangé). Décisions explicitement laissées à l'implémentation : kind par défaut pour la validation clavier, forme du composant `SelectionBar`, délais/seuils du geste tactile.
- 2026-08-14 — Implémentation complète (bmad-dev-story), TDD tâche par tâche. Geste de sélection par glissement (souris avec seuil de déplacement, tactile avec appui maintenu 450ms) sur les deux vues, extension clavier Maj+flèches + validation Entrée (kind par défaut Indisponible, documenté) + annulation Échap, composant `SelectionBar` réutilisé par les deux vues, câblage `CalendarView.onBatchDeclareRequested()` (un seul appel `createDeclarationBatch()`, gestion `ConflictError` sans résolution). Aucune régression : web 1521/1521 tests (+30), lint propre sur les fichiers touchés (2 erreurs a11y nouvelles corrigées, `tabindex="-1"` sur les conteneurs de grille). Vérification visuelle manuelle non faite (navigateur indisponible dans cet environnement) — signalé explicitement, RENDU NON VALIDÉ À L'ŒIL.
- 2026-08-14 — **Bug corrigé après retour utilisateur en conditions réelles** : le geste de glissement ne fonctionnait pas — sur desktop, la sélection de texte native du navigateur volait le geste dès le premier déplacement (aucun `pointermove` supplémentaire délivré à l'app, `dragArmed` ne passait jamais à `true`) ; sur mobile, l'appui long déclenchait le menu contextuel/callout natif (copier-coller iOS, menu Android) qui envoyait un `pointercancel` juste après l'armement, figeant la sélection à une seule case. Cause commune : aucun CSS n'empêchait le navigateur de gérer nativement ces gestes concurrents (oubli à l'implémentation, patron standard des UI de sélection par glissement). Correctif : `user-select: none` / `-webkit-user-select: none` / `-webkit-touch-callout: none` sur `.week-grid`/`.calendar-grid`, plus `(contextmenu)="$event.preventDefault()"` en défense en profondeur pour les WebView Android qui ignorent le CSS. 34/34 tests concernés toujours verts (changement CSS/template pur, aucune logique touchée), lint propre. **Toujours non validé visuellement** (navigateur indisponible dans cet environnement) — l'utilisateur devra confirmer que le correctif résout bien les deux symptômes observés.
- 2026-08-14 — **Deuxième round de corrections après nouveau retour utilisateur en conditions réelles.** (1) **Bug confirmé et corrigé, vue mois** : les 3 segments matin/après-midi/soir interceptaient (`stopPropagation`) le `pointerdown` avant qu'il n'atteigne la case elle-même — un doigt touchant cette bande (large sur mobile) empêchait *systématiquement* l'armement de la sélection de journée, expliquant l'échec total rapporté ("jamais réussi, même sur une seule case"). Correctif : les segments démarrent maintenant le même geste que la case (marqué `fromSegment`), qui peut s'armer normalement par glissement/appui maintenu ; seul le tap rapide (relâchement sans armement) est toujours court-circuité pour ne pas rejouer un FULL_DAY en double par-dessus le `(click)` propre du segment. Test de non-régression précédent corrigé (il enfonçait par erreur le comportement bogué comme voulu) + nouveau test couvrant le cas glissement-depuis-segment. (2) **Amélioration de fiabilité tactile, vue semaine** : `touch-action: pan-y` sur `.slot-cell` — laisse le navigateur gérer le défilement vertical nativement sans arbitrage concurrent avec le minuteur d'appui maintenu (l'axe de glissement de la vue semaine est toujours horizontal, une seule ligne de créneau, donc aucun conflit d'axe). Vue mois : `touch-action: none` sur `.day-cell` à la place (le glissement peut y être vertical, enjambant les semaines, donc aucun axe ne peut être laissé au natif) — compromis assumé et documenté : le défilement de page amorcé pile sur une case du mois ne fonctionne plus nativement, mais reste disponible depuis les en-têtes/la navigation. (3) **Desktop : cause encore non confirmée.** Mon hypothèse initiale (la sélection de texte native bloquerait les événements `pointermove`) était probablement fausse — la sélection de texte est un effet cosmétique, elle n'empêche pas la livraison des événements pointeur au JS ; `user-select: none` n'avait donc probablement rien à corriger côté fonctionnel. Cause réelle non identifiée faute d'accès navigateur — informations demandées à l'utilisateur (la case réagit-elle visuellement au clic ? erreurs console F12 ? navigateur/OS exact ?) avant de tenter un nouveau correctif à l'aveugle. 98/98 fichiers web, 1522/1522 tests (+1 nouveau test), lint propre.
- 2026-08-14 — **Confirmé fonctionnel par l'utilisateur** (desktop, mobile vue semaine, mobile vue mois) après le round précédent — la cause exacte du souci desktop n'a jamais été confirmée, mais le comportement observé est désormais correct sur les trois configurations testées.
- 2026-08-14 — **Revue de code appliquée** (bmad-code-review, 3 couches adversariales : Blind Hunter, Edge Case Hunter, Acceptance Auditor). 9 patches appliqués : (1) vue mois — glissement et clavier pouvaient sélectionner des jours hors du mois affiché, garde `isCurrentMonth` ajoutée aux deux ; (2) aucun filtrage `event.button`, un clic droit/milieu pouvait armer une sélection ; (3) `contextmenu` bloqué en permanence au lieu d'être scopé à un geste actif (`isGestureActive()`) ; (4) aucun garde-fou multi-pointeur, `pointerId` désormais tracké et filtré dans les trois handlers ; (5) AC7 — le message `409` ne nommait que le premier conflit, liste désormais tous les conflits du lot ; (6) AC5 non testée malgré le code existant — 4 tests clavier ajoutés par vue (extension gauche/droite, validation Entrée, Entrée sans sélection) ; (7) constantes de timing dupliquées entre les deux vues, déplacées dans `selection.utils.ts` ; (8) `pointerType` typé trop large, nouveau type `GesturePointerType` partagé ; (9) aucune annonce `aria-live` du décompte de sélection, ajoutée. 1 item différé vers `deferred-work.md` (extension clavier Haut/Bas en vue mois — choix de portée, aucun AC ne l'impose). 98/98 fichiers web, 1532/1532 tests (+10 tests de revue), lint propre, `ng build` : échoue uniquement sur le budget de bundle pré-existant.
