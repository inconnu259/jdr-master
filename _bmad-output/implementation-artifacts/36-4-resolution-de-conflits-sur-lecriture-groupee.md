---
baseline_commit: 74e438ce881127774b81a9b1840f80b89ade890f
---

# Story 36.4 : Résolution de conflits sur l'écriture groupée

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · **Serveur (D-18) + front** · *La story la plus lourde de l'épic* · **`/security-review` NON OPTIONNEL** [Source: epics.md — Séquence et portée + notes d'implémentation de l'épic 36]

---

## Story

As a **utilisateur**,
I want **choisir ce qu'il advient des créneaux déjà déclarés que ma sélection recouvre**,
so that **un conflit cesse de faire échouer tout mon geste**.

---

## 🚨 Encadré n°1 — Cette story lève une garde qui a été écrite exprès. Elle n'annule pas le reste

`AD-21` et la story 30.2 ont tranché que la route groupée **échoue en bloc**, et 30.2 porte une **garde formelle (son AC8)** interdisant d'y faire passer `ConstraintPanel`, faute d'écrasement et de découpe. `D-18` renverse cela. **Mais deux AC seulement de 30.2 sont renversées — les sept autres restent des invariants à ne pas casser.**

| AC de 30.2 | Sort dans cette story |
| --- | --- |
| **AC2** — un conflit fait échouer tout le lot, l'erreur nomme le créneau fautif | ⚠️ **RENVERSÉE** pour les conflits avec des déclarations **persistées** |
| **AC8** — la garde : `ConstraintPanel` reste sur la route unitaire | ⚠️ **LEVÉE** — mais voir l'encadré n°4 : **lever ≠ migrer** |
| AC1 — un seul appel, aucune boucle côté client | ✅ **invariant** |
| AC3 — écriture transactionnelle, jamais une semaine à moitié déclarée | ✅ **invariant** |
| AC4 — la détection existante s'applique à chaque créneau avant toute écriture | ✅ **invariant** |
| **AC5** — deux créneaux **du même lot** qui se contredisent → refus avant écriture | ✅ **invariant, NON renversé** (voir encadré n°3) |
| AC6 — pas N lectures, logique de conflit jamais réécrite en double | ✅ **invariant** |
| AC7 — une seule notification temps réel | ✅ **invariant** |
| AC9/AC10 — lot vide, plafond 42, `expiresAt` passé | ✅ **invariants** |

⚠️ **Point de gouvernance à traiter hors story.** `ARCHITECTURE-SPINE.md` déclare `binds: [FR-1 … FR-48]` : **aucune AD ne couvre l'épic 36**, et `AD-21` — seule AD applicable, statut `[ADOPTED]` — dit littéralement l'inverse de ce que cette story implémente (« Un conflit sur un seul créneau fait échouer l'ensemble … l'utilisateur corrige et rejoue son geste »). `sprint-change-proposal-2026-08-17.md:206` le note déjà : *« les quatre dérogations serveur D-15 à D-18 n'ont aucune AD ; à traiter avant les stories 36.4, 36.5, 36.6 et 36.10 »*. **Cela n'empêche pas d'implémenter** — `D-18` est actée dans le PRD et l'AC d'`epics.md` fait foi — mais `AD-21` doit être amendée (ou doublée d'une AD-22) par `bmad-correct-course` / `bmad-architecture`. Voir question n°1.

**Ce que cette story referme aussi** : la ⚠️ **régression temporaire assumée par la story 36.3**. Depuis 36.3, le tap unitaire passe par la route groupée ; redéclarer un créneau **déjà déclaré** échoue donc aujourd'hui là où le tap le permettait avant. C'est l'AC12.

---

## 🚨 Encadré n°2 — Le serveur ne renvoie aujourd'hui QUE LE PREMIER conflit. Le dialogue en exige la liste complète

C'est le trou le plus concret de la story, et il n'est écrit nulle part ailleurs. `createBatch()` tronque **deux fois** (`availability.service.ts:265-275`) :

```ts
for (let index = 0; index < items.length; index++) {
  const externalConflict = active.find((existing) =>      // ← 1er conflit de CET item seulement
    this.conflictPredicate(existing, items[index]),
  );
  if (externalConflict) {
    throw new ConflictException({                          // ← throw dès le 1er item fautif
      conflicts: [{ ...this.toConflictInfo(externalConflict), batchIndex: index }],
    });
  }
}
```

Or l'AC2 d'`epics.md` exige que le dialogue **nomme** les créneaux — au pluriel — et la planche contractuelle écrit noir sur blanc « **3 créneaux sont déjà déclarés** … Mar 4 · Ven 7 · Dim 9 ». **Un `409` à une seule entrée ne permet ni le titre, ni les trois libellés, ni le décompte « les 4 autres jours ».**

➡️ **Le `409` doit énumérer TOUS les conflits externes du lot** (AC9). C'est un changement de comportement du serveur, pas seulement d'ajout : la boucle doit **collecter** au lieu de `throw`, et `find` devient `filter`.

Bonne nouvelle : **le transport existe déjà.** `BatchConflictInfo extends ConflictInfo { batchIndex: number }` (`packages/shared/src/index.ts:544-547`) est livré depuis 30.2, et le client le reçoit — mais `calendar-view.ts:621` **le jette** en réduisant tout à une chaîne de dates. `batchIndex` est précisément ce qui permet de rattacher un conflit à **la cellule sélectionnée** et donc de la nommer.

---

## 🚨 Encadré n°3 — « Remplacer ne touche que mes propres déclarations » est déjà vrai, gratuitement. Ce n'est pas du code à écrire, c'est un affichage à faire

L'AC4 d'`epics.md`, FR-57 et `EXPERIENCE.md` insistent tous : une indisponibilité **dérivée d'une séance** résiste à « Remplacer », et revient d'elle-même si la séance est annulée. **Vérifié dans le code : c'est structurel et il n'y a rien à implémenter côté écriture.**

- `getSeanceDerivedUnavailability()` (`availability.service.ts:660-729`) construit des objets `DeclarationLike` **en mémoire**, sans `id`, jamais persistés — aucun `create`/`upsert` sur ce chemin.
- La détection de conflits du lot lit `prisma.availabilityDeclaration.findMany(...)` (`:261`) : **une indisponibilité dérivée ne peut donc structurellement JAMAIS apparaître dans `conflicts`**, ni être ciblée par une expiration.

➡️ **Le travail est d'AFFICHER la ligne d'exception, pas de la coder.** La planche la dessine comme une 4ᵉ ligne rose (`✦`), **distincte des trois choix** : *« Samedi 8 n'est pas dans la liste — Tu y as une séance. Aucun de ces choix n'y touche. Si elle est annulée, tu redeviens disponible. »*

⚠️ **Écart tranché entre les deux planches.** La planche E (`reprise-calendrier-propositions.html:474-486`) **nomme la séance** (« Le Convoi du Nord ») ; le contrat d'UI (`contrat-ui-calendrier.html:614-624`), **qui fait foi**, dit seulement « Tu y as une séance ». **On suit le contrat.** Motif technique, pas seulement d'autorité : l'indisponibilité dérivée **ne porte aucune identité** (l'entrée n'a ni `id`, ni titre, ni `partieId` — `availability.service.ts:711-719`). Nommer la séance exigerait un second chemin de données.

➡️ **Et la ligne doit être bâtie côté client, sans aucun appel supplémentaire.** `allCalendarEntries()` (livré par 36.1/36.2) dérive déjà les séances pour **les deux contextes** — personnel via la couche `mes-seances` de `GET /me/calendar` (qui, elle, porte `partieName`/`scenarioTitle`), partie via les signaux déjà chargés. La cellule sélectionnée qui porte une séance **et** n'apparaît pas dans `conflicts` est exactement la ligne rose. **Zéro appel réseau.**

---

## 🚨 Encadré n°4 — La garde est levée. La migration de `ConstraintPanel` n'est PAS demandée

Lever l'AC8 de 30.2 signifie que la route groupée **a le droit** d'absorber écrasement et découpe. Cela ne veut **pas** dire que `ConstraintPanel` doit être rebranché dessus, et **aucun AC ne le demande**.

**Décision : `ConstraintPanel` reste sur la route unitaire `POST /availability`, strictement inchangé.** Motifs :

1. Il est le **seul chemin de la contrainte récurrente** (FR-57, `EXPERIENCE.md:505-509`) et de la découpe d'occurrence (`POST /availability/:id/split`) — capacités livrées par la story 1.7.
2. Il porte **quatre dialogues inline** (conflit, modify, delete) et **aucun test de composant** : `constraint-panel.spec.ts` fait **75 lignes** et ne teste que `buildConstraintDto`, une fonction pure. **Le composant n'est jamais monté.** Y toucher, c'est refactorer sans filet.
3. Le migrer serait du périmètre inventé, exactement ce que 30.2 rangeait en « Hors périmètre ».

⚠️ **Divergence lexicale assumée et consignée.** Le bloc inline existant dit **« Écraser » / « Garder l'existant »** (`constraint-panel.html:123-131`) ; le contrat d'UI et FR-57 disent **« Remplacer » / « Conserver »**. Le **nouveau** dialogue emploie le vocabulaire du contrat. Les deux libellés coexisteront donc dans l'application à la fin de cette story. *Question n°3 remontée à l'utilisateur.*

---

## 🚨 Encadré n°5 — « Au cas par cas » n'est spécifié nulle part. Il est tranché ici

Recherche exhaustive faite : `EXPERIENCE.md:519` dit **une phrase** (« Les conflits défilent un par un »), l'AC d'`epics.md` en dit une autre (« chaque décision ne porte que sur son créneau »), **`DESIGN.md` n'a aucune section sur le dialogue de conflit** (son catalogue §7.1→§7.11 n'a pas d'entrée), et **aucun mockup ne dessine l'écran** — seulement le bouton qui y mène. C'est le plus gros trou de la story.

**Décision, avec son motif : « Au cas par cas » est un parcours ENTIÈREMENT CÔTÉ CLIENT qui compose des décisions par créneau, puis soumet UN SEUL appel.**

| | Ce qui est retenu | Ce qui est écarté, et pourquoi |
| --- | --- | --- |
| Nombre d'appels | **Un**, à la fin | Un appel par décision — reproduirait le fan-out que tout le palier combat (`AD-3`, NFR-6), et c'est **le seul endroit de la story où le limiteur de débit redeviendrait un vrai sujet** (`ttl: 60_000, limit: 300`, `app.module.ts:36`) |
| Écriture | **Rien n'est écrit avant la validation finale** | Écrire au fil du défilé — casserait l'AC8 (transactionnalité) et laisserait un lot à moitié appliqué si l'utilisateur abandonne |
| Abandon en cours | **`Échap` / Annuler → aucune écriture** | Un abandon partiellement appliqué |
| Forme | Le dialogue **reste ouvert** et change de contenu : un conflit à la fois, « Remplacer » / « Conserver » pour celui-ci, un compteur « 2 / 3 » | Une seconde soumission au serveur par étape |

➡️ **Conséquence sur le contrat serveur : la résolution est PAR ITEM, pas globale au lot.** « Remplacer » et « Conserver » ne sont alors que des raccourcis qui posent la même valeur sur tous les items en conflit. **Un seul contrat couvre les trois issues** — pas trois modes.

---

## Acceptance Criteria

**Les huit premières sont reprises verbatim d'`epics.md` (Story 36.4).** AC9 à AC16 comblent des trous identifiés à l'analyse ; chacune porte son motif.

**AC1** — **Given** un lot recouvrant des créneaux déjà déclarés · **When** il est soumis · **Then** l'application propose **Remplacer**, **Conserver** ou **Au cas par cas** · **And** elle ne refuse plus le lot

**AC2** — **Given** le dialogue de conflit · **When** il s'affiche · **Then** il **nomme** les créneaux concernés, il ne se contente pas de les compter

**AC3** — **Given** je choisis « Au cas par cas » · **When** la résolution démarre · **Then** les conflits défilent un par un · **And** chaque décision ne porte que sur son créneau

**AC4** — **Given** je choisis « Remplacer » · **When** l'écriture s'exécute · **Then** seules **mes propres déclarations** sont remplacées · **And** une indisponibilité dérivée d'une séance demeure

**AC5** — **Given** une séance ultérieurement annulée · **When** le créneau est relu · **Then** la disponibilité revient d'elle-même, sans écriture

**AC6** — **Given** le mécanisme de découpe de la story 1.7 · **When** un lot recouvre partiellement une déclaration existante · **Then** la découpe s'applique dans le lot comme elle s'appliquait au chemin unitaire

**AC7** — **Given** la détection de conflits existante · **When** le lot est traité · **Then** son prédicat est réutilisé, jamais dupliqué · **And** les déclarations actives sont lues une seule fois pour tout le lot

**AC8** — **Given** un lot résolu · **When** il est enregistré · **Then** l'écriture reste transactionnelle · **And** une seule émission temps réel est produite

---

**AC9 — Le `409` énumère TOUS les conflits du lot.** *(Motif : encadré n°2 — sans cela l'AC2 est inatteignable.)*
**Given** un lot dont plusieurs créneaux entrent en conflit avec plusieurs déclarations persistées · **When** le lot est soumis sans résolution · **Then** le corps du `409` porte **une entrée par couple (créneau du lot, déclaration en conflit)**, chacune avec son `batchIndex` · **And** aucun conflit n'est omis, ni par item ni par déclaration

**AC10 — Un geste, un appel — « Au cas par cas » compris.** *(Motif : `AD-21` phrase 1, `AD-3`, NFR-6.)*
**Given** le parcours « Au cas par cas » · **When** je prends mes décisions une par une · **Then** **aucun appel réseau n'est émis pendant le défilé** · **And** l'écriture part en **un seul appel** à la validation finale · **And** abandonner le parcours n'écrit rien

**AC11 — La ligne d'exception « séance » est affichée, et n'est jamais une option.** *(Motif : encadré n°3 ; FR-57 ; `EXPERIENCE.md` « c'est une exception qu'on subit, pas une option qu'on prend ».)*
**Given** ma sélection recouvre un créneau rendu indisponible par une séance · **When** le dialogue s'affiche · **Then** ce créneau est signalé **sur une ligne distincte des trois choix**, qui dit qu'aucun choix ne le touche et que la disponibilité reviendra si la séance est annulée · **And** cette ligne n'est **pas** actionnable · **And** elle est construite sans aucun appel réseau supplémentaire

**AC12 — La régression temporaire de la story 36.3 est refermée.** *(Motif : elle est consignée noir sur blanc dans 36.3 comme étant à la charge de cette story.)*
**Given** un créneau **déjà déclaré** · **When** je le redéclare par le tap ou par une sélection · **Then** le geste aboutit après résolution · **And** il n'échoue plus en bloc comme entre 36.3 et cette story

**AC13 — Les invariants non renversés de la story 30.2 tiennent.** *(Motif : encadré n°1.)*
**Given** un lot vide, un lot au-delà du plafond de **42**, ou un item dont `expiresAt` est déjà passé · **When** il est soumis · **Then** il est rejeté par la validation exactement comme avant · **And** les messages distinguant les deux cas de taille sont inchangés

**AC14 — Un conflit INTERNE au lot continue d'échouer en bloc.** *(Motif : deux items du même lot ne sont ni l'un ni l'autre « l'existant » — « Remplacer » n'y a aucun sens. L'AC5 de 30.2 n'est **pas** renversée.)*
**Given** deux créneaux du **même lot** qui se contredisent entre eux · **When** le lot est soumis · **Then** il est refusé avant toute écriture, avec les deux créneaux nommés · **And** aucun dialogue de résolution ne s'ouvre pour ce cas

**AC15 — Le dialogue est utilisable sans voir, et sans la couleur seule.** *(Motif : P-1, P-2 ; le bloc inline existant n'a ni rôle, ni piège de focus, ni région live — ne pas reproduire ce défaut.)*
**Given** le dialogue de conflit · **When** il s'ouvre · **Then** il expose un rôle de dialogue, prend le focus et le rend à sa fermeture · **And** chaque choix est distingué par son **libellé**, jamais par la seule couleur · **And** l'avancement du parcours « Au cas par cas » est annoncé en toutes lettres

**AC16 — Une résolution n'atteint jamais la déclaration d'autrui.** *(Motif : `docs/security.md` — autorisation vérifiée à chaque accès ; « Remplacer » est destructif ; `/security-review` non optionnel sur cette story.)*
**Given** une résolution « Remplacer » · **When** elle s'exécute · **Then** l'identité de l'appelant vient de la **session**, jamais du corps de la requête · **And** aucune déclaration n'appartenant pas à l'appelant n'est expirée ni modifiée, même si son identifiant est fourni · **And** la valeur de résolution est validée contre une **union fermée**, jamais une chaîne libre

---

## Tasks / Subtasks

### 1. Le contrat partagé rouvre la résolution, **par item** (AC1, AC3, AC9, encadré n°5)

- [x] Dans `packages/shared/src/index.ts`, ajouter à `CreateAvailabilityBatchItem` un champ **optionnel** `conflictResolution?: 'overwrite' | 'keep'`.
  ⚠️ **Le commentaire `:524-527` fige explicitement l'invariant inverse** (« le lot échoue en tout-ou-rien, il n'offre aucune résolution de conflit »). **Le réécrire**, en citant `D-18` et cette story — ne pas laisser un commentaire qui contredit le code.
- [x] **Ne PAS ajouter `replacingId`** à l'item : il n'a toujours aucun sens dans un lot (il sert à exclure du contrôle la déclaration qu'on est en train de remplacer depuis le panneau).
- [x] `BatchConflictInfo` est **déjà** livré et suffisant (`:544-547`) — ne pas le redéfinir.
- [x] Vérifier qu'aucun type n'est importé autrement qu'en `import type`.

### 2. Le `409` énumère tout (AC9, AC2)

- [x] Dans `createBatch()` (`availability.service.ts:244`), remplacer la boucle qui `throw` au premier conflit par une **collecte complète** : pour chaque item **sans** `conflictResolution`, `active.filter(...)` (et non `.find(...)`), chaque conflit produisant une entrée `{ ...toConflictInfo(existing), batchIndex: index }`.
- [x] `throw` **une seule fois**, après la boucle, si la collecte n'est pas vide.
- [x] **Préserver l'ordre** des entrées (par `batchIndex` croissant) : le client s'en sert pour nommer les cellules dans l'ordre de la sélection.
- [x] Conflits **internes** : conserver `findInternalConflict()` **tel quel** et son `throw` séparé (AC14).

### 3. La découpe et l'écrasement entrent dans le lot (AC6, AC8) — **le point technique le plus dur**

- [x] 🚨 **`createWithHoles()` ouvre SA PROPRE `$transaction`** (`:361` branche RECURRING, `:431` branche PUNCTUAL). L'appeler depuis la `$transaction` de `createBatch()` (`:289`) produirait une **transaction imbriquée**. Le refactorer pour accepter un **client Prisma injecté** (`Prisma.TransactionClient`), ou séparer *calcul des pièces* (pur) et *écriture*. **Le chemin unitaire doit continuer de fonctionner à l'identique** — il lui passera `this.prisma`.
- [x] `overwrite` : **regrouper l'expiration en UN SEUL `updateMany`** pour tous les conflits `overwrite` du lot, à l'intérieur de la transaction — jamais un `updateMany` par item.
  ⚠️ **Ne pas copier `create()` comme modèle d'atomicité** : sa branche `overwrite` enchaîne `updateMany()` (`:115`) puis `doCreate()` (`:133`) **hors transaction**. Le code le dit lui-même (`:242-243`) et la story 30.2 le démontre dans son encadré n°2.
- [x] `keep` : produire les pièces « à trous » par item via la logique de `createWithHoles`, dans la **même** transaction.
- [x] Ordre imposé dans la transaction : **expirations d'abord, créations ensuite**.
- [x] Conserver **une seule** `$transaction` et **un seul** `emitForUser()` après commit (AC8) — les tests `:681`, `:697`, `:848` l'asserteront encore.
- [x] ⚠️ **Surveiller le budget de la transaction** : `$transaction` interactif de Prisma 7 a un **`timeout` par défaut de 5 s** (`maxWait` 2 s). La découpe **multiplie les écritures par item** (jusqu'à R1 + Rmod + R2), sur un lot plafonné à 42, dans une boucle déjà séquentielle. Si le budget devient serré, passer un `timeout` explicite **et le commenter** ; `createManyAndReturn` est l'optimisation évoquée par `deferred-work.md`. **Ne pas sur-concevoir sans mesure**, mais ne pas ignorer le point.

### 4. Le DTO valide la résolution (AC16, AC13)

- [x] Dans `create-availability-batch.dto.ts`, ajouter sur `CreateAvailabilityBatchItemDto` un `@IsOptional() @IsIn(['overwrite', 'keep'])` — **union fermée**, jamais un `@IsString()`.
- [x] Réécrire le commentaire d'en-tête de la classe, qui dit aujourd'hui que ces champs sont « absents de dessein — Story 30.2, AD-21 ».
- [x] Ne toucher ni `@ArrayMinSize(1)` ni `@ArrayMaxSize(42)` ni leurs messages (AC13).
- [x] Vérifier qu'aucun champ d'identité utilisateur n'est accepté dans le corps : le contrôleur passe déjà `user.id` depuis `@CurrentUser()` (`availability.controller.ts:32-38`) — **ne pas dévier de ce patron**.

### 5. Le dialogue de conflit (AC1, AC2, AC11, AC15)

- [x] Créer un composant de dialogue **dans `features/calendar/`** — aucun dialogue Material n'y existe encore.
  **Patron à suivre** : `ConfirmDialog` (`features/parties/confirm-dialog/confirm-dialog.ts`) pour la structure `mat-dialog-title` / `mat-dialog-content` / `mat-dialog-actions`, et `LevelUpWizard` (`features/characters/character-sheet/level-up-wizard/`) pour un dialogue **à état** : `MatDialogRef` typé sur le résultat, `MAT_DIALOG_DATA` avec interface exportée, erreurs, a11y.
- [x] Composition **conforme au contrat d'UI** (`contrat-ui-calendrier.html:614-624`) : un titre qui **compte** (« 3 créneaux sont déjà déclarés »), un sous-titre qui **rappelle l'intention** (« Tu déclares disponible du 3 au 9 août, le soir »), puis **trois lignes de choix**, chacune avec son libellé **et sa conséquence nommée** :
  - *Remplacer* → « Les 3 deviennent disponibles » + **la liste des créneaux** (« Mar 4 · Ven 7 · Dim 9 »)
  - *Conserver* → « Ces 3 restent comme ils sont » + « Les 4 autres jours passent en disponible »
  - *Au cas par cas* → « On les passe en revue un par un » + « 3 décisions à prendre »
- [x] **Ligne d'exception `✦`** (AC11), **quatrième et distincte**, non actionnable.
- [x] a11y (AC15) : rôle de dialogue et gestion du focus assurés par `MatDialog` — **le vérifier**, pas le supposer ; chaque choix lisible par son libellé seul ; le compteur du défilé annoncé (`aria-live="polite"`, patron déjà en place — `selection-bar.html:105-108`).
- [x] ⚠️ **Ne pas réutiliser le bloc inline de `constraint-panel.html:118-134`** : il n'a **ni rôle de dialogue, ni piège de focus, ni région live**. C'est le défaut à ne pas propager, pas le modèle.

### 6. Le parcours « Au cas par cas » (AC3, AC10)

- [x] État interne au dialogue : index courant, décisions accumulées (`Map<batchIndex, 'overwrite' | 'keep'>`), compteur « 2 / 3 ».
- [x] **Aucun appel réseau pendant le défilé** — le dialogue ne connaît aucun service HTTP ; il **renvoie** un résultat à son appelant.
- [x] Fermeture sans choix / `Échap` → résultat `null` → **aucune écriture** (AC10).
- [x] Le résultat rendu est **la même forme** pour les trois issues : une décision par `batchIndex` en conflit. « Remplacer » et « Conserver » posent simplement la même valeur partout.

### 7. `CalendarView` orchestre, et **retient la sélection** (AC1, AC10, AC12)

- [x] 🚨 **Disaster n°1 — les deux vues effacent la sélection AVANT la réponse** : `calendar-month-view.ts:636` et `calendar-week-view.ts:581` appellent `onSelectionCancelled()` juste après avoir émis `batchDeclareRequested`. Le dialogue n'aurait donc plus rien sous les yeux, et **rejouer le lot serait impossible**. `CalendarView.onBatchDeclareRequested()` doit **conserver `event.cells`** (et le `kind`) pour la durée de la résolution. *Ne pas « corriger » les vues en y déplaçant l'effacement : la sélection est leur état local, et le flux d'émission est protégé par des tests des deux côtés.*
- [x] Dans `onBatchDeclareRequested()` (`calendar-view.ts:608-638`), remplacer la branche `ConflictError` (`:625-636`, aujourd'hui un simple `snack.open`) par : ouverture du dialogue → si résultat non nul, **re-soumission d'UN SEUL `createDeclarationBatch()`** avec les items porteurs de leur `conflictResolution`.
  ⚠️ Le commentaire `:623-624` annonce déjà cette story (« jusqu'à ce que la **story 36.4** apporte la résolution de conflits (D-18) ») : **le mettre à jour**.
- [x] Nommer les créneaux en croisant `batchIndex` ↔ `cells` retenues (encadré n°2) — **c'est la seule source qui donne la date lisible**.
- [x] Construire la ligne d'exception à partir d'`allCalendarEntries()` : cellules sélectionnées **portant une séance** et **absentes** de `conflicts` (encadré n°3). **Zéro appel réseau** (AC11).
- [x] Succès → `loadDeclarations()` + `refreshMjPanels()`, chaîne existante inchangée.
- [x] Garde anti-double-ouverture du dialogue, patron `dialogPending()` de `poll-status.ts:97-113`.

### 8. Tests — API (AC4, AC5, AC6, AC7, AC8, AC9, AC13, AC14, AC16)

- [x] 🚨 **Deux tests existants changent de vérité et doivent être RÉÉCRITS, jamais supprimés** — ils protègent des mécanismes réels :
  - `availability.service.spec.ts:708` « conflit externe → 409, aucune création » → devient : **409 énumérant tous les conflits**, toujours aucune création **quand aucune résolution n'est fournie**.
  - `availability.service.spec.ts:730` « conflit interne → 409, aucune création » → **à CONSERVER tel quel** (AC14) ; seule sa formulation peut préciser qu'il n'est pas résoluble.
- [x] Tests à **préserver intacts** : `:681` (une seule `$transaction`), `:697` (une seule lecture `findMany` — AC7), `:747` (`expiresAt` passé), `:758` (lot vide), `:766` (ids synthétiques internes), `:848` (une seule émission SSE — AC8).
- [x] Nouveaux : lot à **plusieurs** conflits externes → toutes les entrées présentes avec le bon `batchIndex` (AC9) ; `overwrite` par item → conflits expirés **et** items créés, **dans une seule transaction** (AC4/AC8) ; `keep` par item → pièces « à trous », découpe identique au chemin unitaire (AC6) ; résolutions **mixtes** dans un même lot (AC3) ; une déclaration **d'un autre utilisateur** n'est jamais expirée (AC16) ; le prédicat n'est appelé qu'à partir de l'unique lecture (AC7).
- [x] `create-availability-batch.dto.spec.ts` : `conflictResolution` valide / invalide / absent — **s'étoffe, ne se réécrit pas**.

### 9. Tests — Web (AC1, AC2, AC3, AC10, AC11, AC12, AC15)

- [x] 🚨 **Deux tests existants changent de vérité et doivent être RÉÉCRITS** :
  - `calendar-view.spec.ts:854` « 409 → message affiché » → devient : **le dialogue s'ouvre**, aucune snackbar d'échec en bloc.
  - `calendar-view.spec.ts:878` « le message nomme les deux créneaux » → devient : **le dialogue** nomme les deux créneaux.
- [x] À **préserver** : `:831` (un seul appel, jamais une boucle), `:846` (succès → recharge), `availability.service.spec.ts:77` et `:103` (un seul POST ; 409 → `ConflictError`).
- [x] Nouveaux — dialogue monté **directement** avec `MatDialogRef`/`MAT_DIALOG_DATA` mockés (patron `level-up-wizard.spec.ts:33-51`, jamais via `MatDialog.open`) : les trois choix rendus ; les créneaux **nommés** et non comptés (AC2) ; le défilé un par un avec compteur et décisions indépendantes (AC3) ; fermeture sans choix → `null` ; ligne d'exception rendue et non actionnable (AC11) ; libellés distinguables sans la couleur (AC15).
- [x] `CalendarView` : 409 → dialogue → **exactement deux** appels à `createDeclarationBatch` au total pour le geste (le premier et la re-soumission), **aucun pendant le défilé** (AC10) ; annulation → **un seul** appel et rien d'écrit ; la sélection est **retenue** entre les deux (AC12) ; zéro appel réseau supplémentaire pour la ligne d'exception (AC11).
- [x] **Zoneless** : `whenStable()` seul ne suffit pas après un `ngOnInit` asynchrone — reprendre la boucle de ticks déjà établie dans `calendar-view.spec.ts`.

### 10. Vérification

- [x] `docker compose exec api pnpm test` · `docker compose exec api pnpm typecheck` (⚠️ `ts-jest` ne type-vérifie pas en cross-file : le typecheck est **obligatoire** après un changement de signature, et cette story en fait plusieurs).
- [x] `docker compose exec web pnpm test` · `docker compose exec web pnpm lint` (attendu : **143 erreurs pré-existantes**, zéro nouvelle sur les fichiers touchés).
- [x] `docker compose exec api pnpm prisma migrate dev` — **normalement AUCUNE migration** : la story n'ajoute ni champ ni table (comme la story 1.7, AC7). Si une migration apparaît, c'est un signal d'erreur de conception.
- [x] **Vérification visuelle réelle** dans le navigateur, sur l'application en marche — les stories 36.1 à 36.3 ont chacune trouvé par ce moyen des défauts qu'aucun test ne voyait.
- [x] **`/security-review` — NON OPTIONNEL** sur cette story (`epics.md:335`).

---

### Review Findings

**Décisions requises** — toutes résolues par l'utilisateur, converties en correctifs ci-dessous.

**Correctifs**

- [x] [Review][Patch] (Décision : *overwrite prime*) Conflit partagé entre un item `overwrite` et un item `keep` dans le même lot — l'item `keep` creuse un trou autour d'une déclaration que l'autre item est en train d'expirer, alors qu'elle n'existera plus au commit. Fix retenu : exclure de `conflicts` (avant `buildHolePieces`) toute déclaration déjà présente dans `toExpire` au moment de traiter les items `keep`. [`apps/api/src/availability/availability.service.ts:296-345`]
- [x] [Review][Patch] (Décision : *champ booléen explicite*) Le client distingue un conflit résoluble d'un conflit interne via un préfixe de chaîne magique sur l'`id` (`'batch-item-'`). Fix retenu : ajouter `internal?: boolean` à `ConflictInfo`/`BatchConflictInfo` (`packages/shared/src/index.ts`), posé par le serveur (`toConflictInfo`/`batchItemToConflictInfo`), et faire filtrer le client sur ce champ au lieu de `id.startsWith('batch-item-')`. [`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:668-670`, `packages/shared/src/index.ts`]
- [x] [Review][Patch] (Décision : *test d'intégration réel*) AC15 (rôle de dialogue / gestion du focus) cochée comme vérifiée, mais `conflict-dialog.spec.ts` mocke `MatDialogRef`/`MAT_DIALOG_DATA` directement, contournant le CDK. Fix retenu : ajouter un test montant le dialogue via un vrai `MatDialog.open()` (patron à établir si aucun n'existe encore dans le projet) vérifiant `role="dialog"` et le piège de focus effectivement posés. [`apps/web/src/app/features/calendar/conflict-dialog/conflict-dialog.spec.ts`]
- [x] [Review][Patch] `created` retourné par `createBatch()` perd toute correspondance positionnelle avec `items` quand une résolution `keep` éclate en 0..N pièces (découpe), alors que les autres items produisent toujours exactement une pièce — changement de contrat non documenté. [`apps/api/src/availability/availability.service.ts:371-379`, `packages/shared/src/index.ts:524-547`]
- [x] [Review][Patch] La resoumission après résolution (deuxième appel `createDeclarationBatch`) qui échoue à nouveau (conflit interne découvert seulement après résolution externe, ou nouvelle collision de course) est avalée par un `catch` générique — le message spécifique est perdu et le dialogue ne se rouvre pas. [`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:711-717`]
- [x] [Review][Patch] `freeCount` ne soustrait pas les cellules d'exception séance (`seanceExceptions`) — une cellule comptée à la fois dans « Les N autres passent en disponible » et dans la ligne d'exception produit un message contradictoire (AC2, AC11). [`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:697-698`]
- [x] [Review][Patch] La garde anti-double-ouverture du dialogue de conflit abandonne silencieusement un second geste concurrent, sans aucune notification — contraste avec les deux autres branches d'échec qui ouvrent une snackbar. [`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:685-686`]
- [x] [Review][Patch] Type `ConflictEntry` dupliqué avec deux formes incompatibles dans `core/availability/availability.service.ts` et `features/calendar/conflict-dialog/conflict-dialog.ts` — risque de mauvais auto-import. [`apps/web/src/app/core/availability/availability.service.ts`, `apps/web/src/app/features/calendar/conflict-dialog/conflict-dialog.ts`]
- [x] [Review][Patch] Accord singulier/pluriel manquant sur la ligne « Conserver » du dialogue : « Les 1 autres passent en disponible » quand `freeCount === 1`, alors que la ligne « Remplacer » gère déjà ce cas. [`apps/web/src/app/features/calendar/conflict-dialog/conflict-dialog.html`]
- [x] [Review][Patch] `seanceCoveredCells()` réimplémente en ligne la même condition que `entryCoversSlot()` (`day-detail.utils.ts`, non exportée) au lieu de la réutiliser. [`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:728-734`]

**Différés**

- [x] [Review][Defer] L'étiquetage des conflits (`describeCell(cells[c.batchIndex])`) suppose une correspondance 1:1 et ordonnée non vérifiée entre `cells`, les `items` soumis (via `buildBatchItems`, hors diff) et le `batchIndex` renvoyé par le serveur. [`apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:693-695`] — deferred, pre-existing (dépend d'un module non touché par cette story ; `buildBatchItems` daterait de 36.3)
- [x] [Review][Defer] TOCTOU élargi par l'ajout d'un `updateMany` destructeur (`overwrite`) basé sur une lecture `findMany` antérieure à la transaction, sans re-vérification. [`apps/api/src/availability/availability.service.ts:290-292`] — deferred, pre-existing (déjà consigné comme dette non refermée par la story elle-même, `deferred-work.md`)

---

## Hors périmètre

- **Migrer `ConstraintPanel` vers la route groupée** — la garde est levée, la migration n'est pas demandée (encadré n°4).
- **Réaligner les libellés du bloc inline existant** (« Écraser »/« Garder l'existant » → « Remplacer »/« Conserver ») — divergence consignée, *question n°3*.
- **La suppression groupée** — hors périmètre depuis 30.2, ne pas l'inventer.
- **Le TOCTOU** de `createBatch()` (lecture hors transaction, sans re-vérification) — reste dans `deferred-work.md`. **L'AC7 impose une lecture unique** : ajouter une relecture dans la transaction la contredirait. À trancher dans une story dédiée au verrouillage/isolation.
- **`createManyAndReturn`, doublons stricts dans le lot, `startDate`/`endDate` inversés, `emitForUser()` levant après commit** — les quatre autres items différés de 30.2 restent ouverts.
- **Amender `AD-21`** — travail de spine, à passer par `bmad-correct-course` (*question n°1*).
- **« Autre… » sur une sélection de plusieurs jours** — question ouverte héritée de 36.3, `ConstraintPanel` ne prenant qu'une date et un créneau. Aucun AC ici (*question n°4*).
- **L'extension clavier Haut/Bas en vue Mois** — reste dans `deferred-work.md` avec son motif.

---

## Ce qui doit continuer de fonctionner

- **`POST /availability` unitaire**, son `409`, ses résolutions `overwrite`/`keep`, `replacingId` — **strictement inchangés**.
- **`ConstraintPanel` dans son intégralité** : contrainte récurrente, modification, suppression, découpe (`POST /availability/:id/split`), aperçu live (`pendingDto` → `preview`), et ses quatre dialogues inline.
- **`splitOccurrence()`** et les douze cas de test de la story 1.7 — la story ne touche pas cette méthode.
- **`findConflictsForCreate()`** — signature et comportement identiques ; **`conflictPredicate()` est réutilisé, jamais dupliqué** (AC7).
- **`getActiveDeclarations()` / `getActiveDeclarationsWithSeances()` / `computeSlotStatus()`** — consommés par `PartiesService.getAvailableSlots()` et `getHeatmap()`.
- **La sélection livrée par 36.3** : `selectedCells`, la portée `computed`, l'intention armée, « Autre… », l'appui maintenu, `suppressNextClick`, `selection.utils.ts` (`buildBatchItems` **inchangé**).
- **Le rail (36.1)** et **les trois bandes (36.2)** — `day-detail.utils.ts`, `SLOT_PRECEDENCE`, `allCalendarEntries()` : **lus, jamais modifiés**.
- **Le plafond de 42** et les messages de validation de taille.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Laisser le `409` s'arrêter au premier conflit.** L'AC2 devient alors inatteignable et le dialogue ment sur le nombre. C'est le trou n°1 (encadré n°2).
2. **Appeler `createWithHoles()` depuis la transaction du lot sans la refactorer.** Transaction imbriquée. Elle ouvre la sienne en `:361` et `:431`.
3. **Prendre `create()` pour modèle d'atomicité.** Il ne l'est pas : `updateMany` puis `create`, hors transaction (`:115`, `:133`). Le code et la story 30.2 le disent tous les deux.
4. **Laisser les vues effacer la sélection avant la réponse.** `calendar-month-view.ts:636` / `calendar-week-view.ts:581`. Sans les cellules retenues, on ne peut ni nommer les créneaux, ni rejouer. **Disaster n°1.**
5. **Jeter `batchIndex`.** `calendar-view.ts:621` le fait aujourd'hui. C'est la seule clé qui relie un conflit à une cellule nommable.
6. **Faire un appel par décision dans « Au cas par cas ».** Reproduit le fan-out combattu par tout le palier, et rouvre le seul risque réel de limiteur.
7. **Attendre du serveur qu'il nomme la séance** de la ligne rose. L'indisponibilité dérivée n'a **ni `id`, ni titre** (`:711-719`). Le contrat d'UI ne la nomme pas non plus.
8. **Croire qu'il faut coder « Remplacer ne touche que mes déclarations ».** C'est structurel : la lecture ne porte que sur `AvailabilityDeclaration` (`:261`). Le travail est un **affichage** et un **test de non-régression**, pas une garde.
9. **Rendre les conflits internes résolubles.** Aucun des deux items n'est « l'existant ». L'AC5 de 30.2 tient (AC14). *À noter : depuis le geste actuel, `buildBatchItems(cells, kind)` produit un seul `kind` pour tout le lot — un conflit interne est donc **structurellement inatteignable depuis la grille**. La garde reste, mais ne pas lui construire d'interface.*
10. **Réutiliser le bloc inline du panneau comme dialogue.** Ni rôle, ni focus, ni région live (`constraint-panel.html:118-134`).
11. **Supprimer les quatre tests qui changent de vérité.** Deux côté API (`:708`, `:730`), deux côté web (`:854`, `:878`). **Les réécrire** — les stories 36.2 et 36.3 ont documenté exactement ce piège.
12. **Ajouter `replacingId` à l'item du lot.** Il n'a toujours aucun sens hors du panneau.
13. **Oublier `pnpm typecheck` côté API.** `ts-jest` ne type-vérifie pas en cross-file (`isolatedModules`) et cette story change plusieurs signatures.
14. **Ignorer le budget de la transaction.** `timeout` par défaut **5 s** ; la découpe multiplie les écritures sur un lot de 42, dans une boucle déjà séquentielle.

### Décisions arrêtées par cette story

- **La résolution est PAR ITEM** (`conflictResolution` sur `CreateAvailabilityBatchItem`), pas globale au lot. Un seul contrat couvre les trois issues.
- **« Au cas par cas » est un parcours client** qui n'émet **aucun** appel avant sa validation finale.
- **`ConstraintPanel` n'est pas migré** : la garde est levée, pas la migration demandée.
- **Le nouveau dialogue emploie le vocabulaire du contrat** (Remplacer / Conserver / Au cas par cas) ; le bloc inline existant garde le sien.
- **La ligne d'exception suit le contrat d'UI, pas la planche E** : elle ne nomme pas la séance.
- **Les conflits internes au lot restent non résolubles** (AC14).
- **Aucune migration Prisma** : ni champ, ni table (comme la story 1.7).

### Décisions laissées à l'implémentation

- **Où vit l'état du défilé** : dans le composant de dialogue (recommandé — il se teste monté seul) ou dans `CalendarView`.
- **Forme exacte du résultat rendu par le dialogue** : `Map<number, 'overwrite'|'keep'>`, tableau parallèle, ou items déjà décorés. *Recommandation : rendre les décisions indexées par `batchIndex`, et laisser `CalendarView` recomposer les items — le dialogue reste ignorant du DTO.*
- **`timeout` explicite sur la `$transaction`** : à décider **sur mesure**, et à commenter si posé.
- **Regroupement des créations** (`createManyAndReturn` vs boucle) : optimisation possible, non exigée ; si elle est prise, ne pas casser l'assertion « une seule `$transaction` ».
- **Rendu étroit du dialogue** : aucune planche mobile ne le dessine (même situation que la barre de sélection en 36.3).

### Notes de plateforme

- **API** : NestJS 11, Prisma 7.8 (générateur `prisma-client-js` legacy), Jest 30 + `ts-jest`. `$transaction` interactif : `timeout` 5 s, `maxWait` 2 s, `isolationLevel` par défaut de la base.
- **Web** : Angular 22 **zoneless**, Material 22.0.2, Vitest 4, TypeScript 6.0.2. `@if`/`@for` et signals ; `input()`/`output()` signal-based ; `standalone: true` ; classe `PascalCase` sans suffixe `Component` ; `import type` pour `@master-jdr/shared`.
- **Specs web** : `import '@angular/compiler';` en **toute première ligne**, imports `vitest` explicites, `componentRef.setInput()`, fonctions pures testées **sans TestBed**.
- **Aucune dépendance nouvelle** — `MatDialogModule` est déjà utilisé dans l'application.
- Depuis la story 29.14, `@master-jdr/shared` est importable **au runtime** depuis les specs API — aucun `jest.mock` à ajouter.
- **Exécution : tout par Docker.**
- **Baseline (commit `74e438c`)** : web **102 fichiers / 1686 tests**, lint **143 erreurs pré-existantes**, build en échec sur le seul budget de bundle (**1,37 Mo**). Baseline API **à confirmer au démarrage** (`docker compose exec api pnpm test`) — dernier chiffre consigné : 55 suites / 1184 tests à la story 30.2, plusieurs stories l'ont dépassé depuis.

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : aucun câblage temps réel nouveau.** Le dialogue est un état d'interaction **local et éphémère** ; il ne lit aucune donnée partagée qu'un autre membre pourrait changer pendant son affichage. L'émission existe déjà et reste **unique** (`emitForUser()` après commit, AC8), et la chaîne de rafraîchissement (`createDeclarationBatch` → `loadDeclarations` → `refreshMjPanels`) est celle de 30.2, inchangée. L'écran ouvre déjà sa connexion `partie:{id}`. La dette connue sur `GET /me/calendar` (non rafraîchi sur `profile/calendar`) reste **héritée et non aggravée**. [Source: CLAUDE.md ; docs/checklist.md]

### Sécurité — `/security-review` non optionnel

- **Autorisation** : `userId` vient de `@CurrentUser()` (`availability.controller.ts:32-38`), **jamais du corps**. « Remplacer » est une écriture **destructive** : toute expiration doit être bornée par `userId` de la session. *Vérifier que le `updateMany` groupé porte bien `where: { id: { in: [...] }, userId }` et pas seulement les identifiants.*
- **Validation** : `conflictResolution` en **union fermée** (`@IsIn`), jamais `@IsString()`. La configuration globale applique déjà `whitelist`/`forbidNonWhitelisted`.
- **Limiteur** : `ttl: 60_000, limit: 300` (`app.module.ts:36`). ⚠️ **Ne pas reprendre l'argument du limiteur tel qu'il figure dans `AD-21` et le PRD** : 21 appels ne le déclenchent pas, la story 30.2 l'a vérifié. Les vraies raisons de l'appel unique sont l'**atomicité** et la **latence**. Le seul endroit où le limiteur redeviendrait un vrai sujet est un « Au cas par cas » mal conçu — écarté par l'AC10.
- **Fuite d'internes** : le `409` enrichi ne doit porter que des `ConflictInfo` (`id`, `kind`, `slot`, `recurKind`, dates, `dayOfWeek`) — aucune trace ni détail Prisma.

### Dette refermée par cette story

- ⚠️ **La régression temporaire assumée entre 36.3 et 36.4** — redéclarer un créneau déjà déclaré (AC12). C'est le mandat explicite laissé par 36.3.
- Le message d'échec en bloc de `calendar-view.ts:625-636` et son commentaire d'attente `:623-624` disparaissent.

### Dette explicitement NON refermée

- **TOCTOU** sur `createBatch()`, **boucle séquentielle** dans la transaction, **doublons stricts** dans le lot, **`startDate`/`endDate` inversés**, **`emitForUser()` levant après commit** — les cinq items différés de 30.2 restent dans `deferred-work.md`. ⚠️ La découpe **aggrave** le deuxième : le noter à la relecture de `deferred-work.md`.
- **Extension clavier Haut/Bas en vue Mois**, **incohérences de fuseau `Intl`/local** — inchangées.
- **`ConstraintPanel` sans test de composant** — sa spec fait 75 lignes et ne monte jamais le composant. Cette story ne le touche pas, donc ne le couvre pas ; **à consigner dans `deferred-work.md`** si ce n'est pas déjà fait.

### Project Structure Notes

**Modifiés — API**
- `apps/api/src/availability/availability.service.ts` (`createBatch` : collecte complète des conflits, résolution par item, découpe dans la transaction ; `createWithHoles` : accepte un client transactionnel)
- `apps/api/src/availability/availability.service.spec.ts`
- `apps/api/src/availability/dto/create-availability-batch.dto.ts` + `.spec.ts`

**Modifiés — Shared**
- `packages/shared/src/index.ts` (`CreateAvailabilityBatchItem.conflictResolution` + réécriture du commentaire `:524-527`)

**Nouveaux — Web**
- `apps/web/src/app/features/calendar/conflict-dialog/` (`.ts` / `.html` / `.scss` / `.spec.ts`) — nom exact laissé à l'implémentation

**Modifiés — Web**
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` + `.spec.ts` (rétention de la sélection, ouverture du dialogue, re-soumission unique, ligne d'exception)

**Non touchés (à confirmer par `git status`)**
- `apps/api/prisma/**` (**aucune migration**) · `availability.controller.ts` · `splitOccurrence()` · `constraint-panel/**` · `selection-bar/**` · `selection.utils.ts` · `day-detail.utils.ts` · `calendar-detail-rail/**` · `calendar-month-view/**` · `calendar-week-view/**` · `calendar-agenda-view/**` · `apps/web/src/styles.scss`

### References

- [Source: epics.md — Story 36.4] — les huit AC, verbatim (AC1-AC8), et le ⚠️ « Renverse une décision de l'épic 30 ».
- [Source: epics.md:335 — notes d'implémentation de l'épic 36] — « **`D-18` renverse `AD-21`** et la garde formelle de la story 30.2 … C'est la story la plus lourde de l'épic, et avec 36.10 la raison pour laquelle `/security-review` n'est pas optionnel. »
- [Source: epics.md — Convention de lecture du contrat d'UI] — le contrat décrit **l'état d'arrivée de l'épic** ; le ⚠️ signale un écart à la cible ou la modification d'un acquis.
- [Source: epics.md:110 — NFR-6] — aucun appel réseau proportionnel ; « deux incidents de production ».
- [Source: prd.md:364-372 — FR-57] — les trois issues, « Remplacer ne touche que mes propres déclarations », et la garantie **structurelle et gratuite**.
- [Source: prd.md:272-275 — FR-32, amendé le 2026-08-17] — « Le « tout-ou-rien » reste vrai de l'**écriture** ; il cesse d'être la réponse au **conflit**. » **C'est la formule exacte du périmètre de cette story.**
- [Source: prd.md:434 — D-18] — « Élevée — renverse une décision de l'épic 30 … Elle doit désormais absorber les deux ✅ actée ».
- [Source: addendum.md §5.4 et §5.5] — pourquoi la règle d'écrasement est gratuite ; « La garde n'est pas violée par inadvertance, elle est levée sciemment. »
- [Source: prd.md §3 — P-1, P-2] — jamais la couleur seule ; accessibilité en vigilance (AC15).
- ⚠️ [Source: ARCHITECTURE-SPINE.md:215-219 — AD-21] — **dit encore l'inverse**, statut `[ADOPTED]`. Phrases 1 et 2 conservées, phrase 3 renversée. À amender hors story.
- ⚠️ [Source: ARCHITECTURE-SPINE.md, front-matter] — `binds: [FR-1 … FR-48]` : **aucune AD ne couvre l'épic 36**.
- [Source: ARCHITECTURE-SPINE.md:119-126 — AD-9] — l'indisponibilité dérivée **n'est jamais persistée** ; créneau lu sur `SessionPoll.chosenSlot`, `FULL_DAY` à défaut.
- [Source: ARCHITECTURE-SPINE.md — AD-3, AD-18, invariants transverses] — un appel, pas N ; toute valeur recalculable est dérivée à la lecture ; lectures groupées.
- [Source: sprint-change-proposal-2026-08-17.md:206] — « les quatre dérogations serveur D-15 à D-18 n'ont aucune AD ; à traiter avant les stories 36.4, 36.5, 36.6 et 36.10 ».
- [Source: EXPERIENCE.md:511-527 — « Le conflit cesse d'être un mur »] — la table des trois issues, « le dialogue **nomme** les créneaux », et l'exception « qu'on subit, pas une option qu'on prend ».
- [Source: EXPERIENCE.md:505-509, 568] — le panneau reste le **seul chemin** de la récurrente ; la table action → déclencheur.
- ⚠️ [Source: DESIGN.md] — **aucune section ne spécifie le dialogue de conflit** ; le catalogue §7.1→§7.11 n'a pas d'entrée. Ne pas chercher une spec absente. Le plus proche, §7.8 `DetailSurface`, renvoie au patron `ConstraintPanel` existant.
- [Source: mockups/contrat-ui-calendrier.html:614-624] — **le contrat visuel qui fait foi** : titre qui compte, sous-titre d'intention, trois lignes de choix nommant les créneaux, ligne d'exception `✦`. Table de couverture `:715` : « Dialogue de conflit | Neuf | FR-57 · D-18 ».
- ⚠️ [Source: mockups/reprise-calendrier-propositions.html:474-486 — planche E] — version longue qui **nomme la séance** ; écart tranché en faveur du contrat (encadré n°3).
- [Source: 1-7-split-contrainte-recurrente.md — AC3, AC4, AC7, AC9, AC11] — le modèle SPLIT (R1 / Rmod / R2, bords, occurrence unique), « All DB writes in a single Prisma transaction », « No new fields, no new tables, no migration », et la correspondance de vocabulaire : `overwrite` = **Remplacer**, `keep`/`createWithHoles()` = **Conserver**.
- [Source: 30-2-ecriture-groupee-des-disponibilites.md] — les dix AC (AC2 et AC8 renversées, les autres invariantes), l'encadré n°2 (**`create()` n'est pas transactionnel**), les six pièges, et les cinq items différés.
- [Source: 36-3-la-selection-devient-le-geste-de-declaration.md] — la ⚠️ **régression temporaire assumée** dont cette story est la fermeture ; `selectedCells` et la portée `computed` (AC18 du Change Log) ; la question « faut-il rapprocher 36.4 ? ».
- [Source: apps/api/src/availability/availability.service.ts:244-316] — `createBatch()` : la boucle qui `throw` au premier conflit (**à remplacer**), l'unique `findMany` `:261`, l'unique `$transaction` `:289`, l'unique `emitForUser()` `:314`.
- [Source: apps/api/src/availability/availability.service.ts:171-186, 190-237] — `conflictPredicate()` **déjà extrait** (à réutiliser, AC7), `batchItemAsExisting()`, `batchItemToConflictInfo()`, `findInternalConflict()`.
- [Source: apps/api/src/availability/availability.service.ts:321-451] — `createWithHoles()` et **ses deux `$transaction` propres** (`:361`, `:431`).
- [Source: apps/api/src/availability/availability.service.ts:660-729] — `getSeanceDerivedUnavailability()` : objets en mémoire, **sans `id` ni identité**, jamais persistés.
- [Source: apps/api/src/availability/availability.service.ts:1064-1175] — `splitOccurrence()`, **non touché** par cette story.
- [Source: packages/shared/src/index.ts:494-552] — `CreateAvailabilityDto` (`conflictResolution: 'overwrite' | 'keep'`), `ConflictInfo`, `CreateAvailabilityBatchItem` et **le commentaire `:524-527` à réécrire**, `BatchConflictInfo` **déjà livré**.
- [Source: apps/web/src/app/core/availability/availability.service.ts:87-106] — `createDeclarationBatch()` ; le `409` **conserve déjà** les conflits en `ConflictError` — c'est le consommateur qui les réduit.
- [Source: apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:608-638] — `onBatchDeclareRequested()`, la branche `ConflictError` à remplacer et le commentaire `:623-624` qui annonce cette story.
- [Source: apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts:636 ; calendar-week-view.ts:581] — **l'effacement de la sélection avant la réponse** (disaster n°1).
- [Source: apps/web/src/app/features/parties/confirm-dialog/confirm-dialog.ts] — patron de dialogue minimal (structure, `MAT_DIALOG_DATA`, `[mat-dialog-close]`).
- [Source: apps/web/src/app/features/characters/character-sheet/level-up-wizard/] — patron de dialogue **à état** : `MatDialogRef` typé, a11y, et **le patron de test** (`level-up-wizard.spec.ts:33-51`, monté directement).
- [Source: apps/web/src/app/features/parties/poll-status.ts:97-113] — garde `dialogPending()` anti-double-ouverture.
- [Source: apps/web/src/app/features/calendar/constraint-panel/constraint-panel.html:118-134] — le bloc inline « Écraser / Garder l'existant » : **référence lexicale et contre-exemple d'a11y**, pas un modèle.
- [Source: deferred-work.md:30-34] — les cinq items différés de 30.2, dont le TOCTOU et la boucle séquentielle **qu'aggrave la découpe**.
- [Source: docs/security.md l.25, l.33, l.35, l.69] — validation stricte, autorisation à chaque accès, limiteur, `/security-review` sur toute tâche touchant données/autorisation.
- [Source: apps/api/src/app.module.ts:36] — `ThrottlerModule.forRoot([{ ttl: 60_000, limit: 300 }])` — le chiffre réel.
- [Source: CLAUDE.md ; docs/checklist.md] — convention SSE, évaluation obligatoire à chaque ajout ; tout par Docker.
- [Source: Context7 — Prisma, transactions] — `$transaction` interactif : `timeout` **5 s** par défaut, `maxWait` 2 s, `isolationLevel` optionnel.

---

## Questions ouvertes pour l'utilisateur

*Tranchées dans la story pour qu'elle soit implémentable. Signalées parce qu'elles touchent une AD adoptée, une planche validée, ou un acquis livré.*

1. ⚠️ **`AD-21` dit encore le contraire de ce que cette story implémente**, et aucune AD ne couvre l'épic 36 (`binds` s'arrête à FR-48). Le sprint-change du 2026-08-17 demandait de traiter ce trou **avant** 36.4. Veux-tu amender `AD-21` (ou ouvrir une AD-22) par `bmad-correct-course` / `bmad-architecture` avant de coder, ou après ?
2. **Le parcours « Au cas par cas » n'est spécifié nulle part** (une phrase dans `EXPERIENCE.md`, aucun écran, aucun mockup). Il est tranché ici comme un **parcours client sans appel réseau, validé en un seul envoi**. Confirmes-tu, ou veux-tu passer par `bmad-ux` pour une planche avant implémentation ?
3. **Divergence lexicale** : le panneau existant dit « Écraser » / « Garder l'existant », le nouveau dialogue dira « Remplacer » / « Conserver ». Les deux coexisteront. Veux-tu réaligner le panneau au passage (2 libellés, hors AC, sur un composant **sans test de composant**), ou laisser la divergence ?
4. **Héritée de 36.3, non refermée ici** : que fait « Autre… » sur une sélection de **plusieurs** jours, `ConstraintPanel` ne prenant qu'une date et un créneau ? Aucun AC de l'épic ne le porte.
5. **À répercuter hors story** : la planche E nomme la séance de la ligne d'exception (« Le Convoi du Nord »), ce que la donnée dérivée ne permet pas. Le contrat d'UI, lui, est correct. Faut-il corriger la planche E par `bmad-ux` ?
6. **Rappel de checklist projet** — cette story étant serveur, destructive et touchant l'autorisation : `/security-review` **non optionnel**, et `/code-review` recommandé avant de clore.

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story)

### Debug Log References

- `docker compose exec api pnpm test` — **58 suites, 1245 tests**, tous verts (baseline 58/1232, **+13**).
- `docker compose exec api pnpm typecheck` — **exit 0**.
- `docker compose exec api pnpm exec eslint src/availability` — **22 erreurs, identiques à la baseline** (26 constatées en cours de route, dont 4 introduites par mes tests puis corrigées).
- `docker compose exec web pnpm test` — **103 fichiers, 1711 tests**, tous verts (baseline 102/1686, **+1 fichier, +25 tests**).
- `docker compose exec web pnpm lint` — **143 erreurs, identiques à la baseline**. Zéro erreur nouvelle sur les fichiers touchés.
- `docker compose exec web pnpm build` — échec sur le seul budget de bundle pré-existant : **1,38 Mo** (baseline 1,37 Mo).
- **Aucune migration Prisma** : `git diff apps/api/prisma/` est vide, comme la story 1.7 l'avait posé en principe.

### Completion Notes List

**Le renversement a été fait en collectant, pas en ajoutant un mode.** `createBatch()` faisait `find` puis `throw` au premier item fautif ; il fait désormais un `filter` par item à partir de l'unique lecture, accumule les couples (créneau, déclaration) dans `unresolved`, et ne lève qu'une fois — le `409` énumère donc **tous** les conflits, ce sans quoi l'AC2 (« le dialogue NOMME les créneaux ») était mécaniquement inatteignable. C'était le trou principal de la story, et il n'était écrit dans aucun document.

**La découpe est entrée dans le lot par extraction, pas par duplication.** `createWithHoles()` ouvrait sa propre `$transaction` : l'appeler depuis celle du lot aurait produit une transaction imbriquée. Le **calcul** des pièces est extrait dans `buildHolePieces()`, pure, qui rend des `data` prêts à écrire ; `createWithHoles()` n'est plus que « `buildHolePieces` + ma transaction », et le lot écrit les mêmes pièces dans la sienne. **Le chemin unitaire est inchangé** — ses tests `keep` et les douze cas de `splitOccurrence` passent sans modification.

**La transaction du lot fait deux choses, dans cet ordre, et une seule fois chacune.** Tout est calculé **avant** de l'ouvrir (`toExpire`, `toCreate`), puis un **seul** `updateMany` groupé expire tous les conflits « Remplacer » du lot, puis les créations. La fenêtre de verrouillage reste donc aussi courte que possible — le `timeout` par défaut de `$transaction` est de 5 s et la découpe multiplie les écritures par item. Aucun `timeout` explicite n'a été posé : il aurait été un chiffre sans mesure.

**⚠️ `create()` n'a pas été pris pour modèle, et c'était le bon choix.** Sa branche `overwrite` enchaîne `updateMany` puis `create` **hors transaction** ; le lot, lui, expire à l'intérieur. L'écart est assumé et commenté dans le code.

**« Remplacer ne touche que mes propres déclarations » n'a demandé aucune ligne de code.** Vérifié en lisant `getSeanceDerivedUnavailability()` : les entrées dérivées sont construites en mémoire, sans `id`, et la détection ne lit que `AvailabilityDeclaration`. Une indisponibilité de séance ne peut structurellement ni apparaître dans `conflicts`, ni être expirée. Le travail a été de l'**afficher** (ligne d'exception) et de le **verrouiller par des tests**.

**⚠️ Un fichier a dû être touché en dehors de la liste « non touchés » de la story : `core/availability/availability.service.ts`.** Motif : le front devait lire `batchIndex`, or `ConflictError.conflicts` était typé `ConflictInfo[]`, qui ne le porte pas. Un type `ConflictEntry = ConflictInfo & { batchIndex?: number }` a été introduit. **Il n'y avait pas d'alternative** : les dates portées par `ConflictInfo` sont celles de la déclaration *existante* (nulles pour une récurrente), jamais celles du créneau soumis — `batchIndex` est la seule clé qui relie un conflit à une cellule nommable. Le chemin unitaire garde son cast d'origine.

**Le dialogue ne connaît aucun service HTTP, délibérément.** « Au cas par cas » compose des décisions en mémoire et les rend à `CalendarView`, qui n'émet qu'un seul appel à la fin. Un geste résolu produit donc **exactement deux** appels (le refusé, puis le résolu), et **zéro** pendant le défilé — ce qui referme le seul endroit où le limiteur de débit aurait pu redevenir un sujet.

**Le piège n°4 de la story (disaster n°1) était réel.** Les deux vues effacent leur sélection avant la réponse ; `event.cells` est retenu par `CalendarView` pour toute la durée de la résolution. Sans cela, ni le nommage des créneaux ni la re-soumission n'étaient possibles. **Les vues n'ont pas été touchées** — leur flux d'émission est protégé par des tests des deux côtés.

**Un même créneau en conflit avec deux déclarations ne demande qu'UNE décision.** Le serveur renvoie deux entrées de même `batchIndex` (c'est correct : deux couples distincts) ; le dialogue les regroupe pour le défilé, « chaque décision ne portant que sur son créneau ». Un test dédié le verrouille des deux côtés.

**⚠️ Décision maintenue : `ConstraintPanel` n'a pas été migré.** La garde de 30.2 est levée, la migration n'était pas demandée, et le composant n'a **aucun test de composant**. Ses quatre dialogues inline et son vocabulaire (« Écraser » / « Garder l'existant ») sont intacts ; le nouveau dialogue emploie celui du contrat (« Remplacer » / « Conserver »). **Les deux vocabulaires coexistent donc dans l'application** — c'est la question n°3, non tranchée.

**Un conflit interne au lot reste irrésoluble, et le front le distingue à la source.** Le serveur signe ces conflits par des id synthétiques `batch-item-N` ; `CalendarView` les reconnaît et conserve un message d'échec en bloc, sans ouvrir de dialogue. Le message a été reformulé (« Ces créneaux se contredisent entre eux ») : l'ancien renvoyait vers « Autre… », issue qui n'a plus lieu d'être puisque le vrai conflit, lui, se résout maintenant.

**Détail de plateforme rencontré** : le client transactionnel mocké des specs API n'exposait que `create` et `update` — l'expiration groupée se faisant désormais **dans** la transaction, `updateMany` a dû y être ajouté.

**✅ VÉRIFICATION VISUELLE RÉELLE FAITE** dans Chrome, sur l'application en marche, sur des données réelles. **Elle a trouvé quatre défauts qu'aucun test ne voyait** — comme pour les stories 36.1, 36.2 et 36.3.

| Défaut | Cause | Correction |
| --- | --- | --- |
| « Les 4 deviennent **disponible** » | L'adjectif qualifie le sujet et devait s'accorder ; le gabarit concaténait `kindLabel` tel quel | Accord ajouté au pluriel. ⚠️ Volontairement **pas** sur « Les 4 autres passent en disponible », que le contrat d'UI laisse invariable |
| « jeu. 20 août **· Journée ·** ven. 21 août · Journée · … » — liste illisible | Le **même séparateur** ` · ` séparait la date du créneau **et** deux créneaux entre eux : on ne distinguait plus les items | Le créneau est **omis quand il vaut la journée entière** — ce que fait déjà le contrat (« Mar 4 · Ven 7 · Dim 9 »). Il reste nommé dès qu'il porte une information. 2 tests ajoutés |
| Libellé et conséquence **empilés et centrés**, alors que le SCSS les voulait côte à côte et alignés à gauche | Material impose son propre alignement au contenu du bouton ; `display: flex` en ligne ne prenait pas | L'empilement est **assumé** plutôt que combattu, mais rendu délibéré et aligné à gauche |
| **Barre de défilement parasite** en mode défilé, sur un contenu pourtant court | La marge basse de `.step__label` traversait la boîte et débordait `mat-dialog-content` | Passée en `padding` sur le conteneur |

| Vérifié à l'écran | Résultat |
| --- | --- |
| 4 créneaux indisponibles redéclarés disponibles → **le dialogue s'ouvre**, le lot n'est pas refusé (AC1) | ✅ |
| Titre « 4 créneaux sont déjà déclarés » + intention « du lun. 24 août au jeu. 27 août » (AC2) | ✅ |
| Les trois issues, chacune **nommant** ses créneaux et sa conséquence (AC2) | ✅ |
| « Au cas par cas » : défilé « 1 / 4 », un créneau à la fois (AC3) | ✅ |
| **Décisions MIXTES** Remplacer / Conserver / Remplacer / Conserver sur les 20-23 | ✅ **20 vert, 21 rouge, 22 vert, 23 rouge** — chaque décision n'a porté que sur son créneau |
| L'état survit au rechargement de la page (écriture réellement persistée) | ✅ |
| **Annuler en cours de défilé**, après une décision déjà prise → rien n'est écrit (AC10) | ✅ les 24-27 restent inchangés |

**Non vérifié à l'œil** : le rendu du dialogue en largeur téléphone (aucune planche ne le dessine — même situation que la barre de sélection en 36.3), et le cas où un créneau sélectionné est couvert par une **séance** (ligne d'exception `✦`), faute d'une séance tombant sur la plage d'essai. Les deux sont couverts par des tests unitaires.

**❌ NON FAIT — `/security-review`.** Non optionnel sur cette story, et déclenché par l'utilisateur.

**Hors story** : `apps/api/src/users/to-auth-user.util.spec.ts` apparaît modifié — reformatage `prettier` seul, sans rapport avec la story, non provoqué volontairement.

**Évaluation SSE** — refaite, verdict inchangé : aucun câblage nouveau. Le dialogue est un état d'interaction local et éphémère ; l'émission reste unique après commit, et la chaîne `createDeclarationBatch → loadDeclarations → refreshMjPanels` est celle de 30.2. La dette sur `GET /me/calendar` reste héritée et non aggravée.

**Dette laissée ouverte, avec son motif** — les cinq items différés de 30.2. Le **TOCTOU** ne pouvait pas être corrigé ici : l'AC7 impose une lecture unique, une relecture dans la transaction la contredirait. La **boucle séquentielle** est **aggravée** par la découpe (un item « Conserver » produit plusieurs créations) : à consigner dans `deferred-work.md`. S'y ajoute **`ConstraintPanel` sans test de composant**.

### File List

**Modifiés — API**
- `apps/api/src/availability/availability.service.ts` (`createBatch` : collecte exhaustive des conflits + résolution par item + expiration groupée dans la transaction ; `createWithHoles` scindée en `buildHolePieces` pure + écriture ; types `ConflictRow` et `AvailabilityCreateData`)
- `apps/api/src/availability/availability.service.spec.ts` (2 tests réécrits, 8 ajoutés, `updateMany` ajouté au client transactionnel mocké, accesseur `updateManyWhere`)
- `apps/api/src/availability/dto/create-availability-batch.dto.ts` (`conflictResolution` en union fermée `@IsIn`)
- `apps/api/src/availability/dto/create-availability-batch.dto.spec.ts` (4 tests ajoutés)

**Modifiés — Shared**
- `packages/shared/src/index.ts` (`CreateAvailabilityBatchItem.conflictResolution` + réécriture du commentaire qui figeait l'invariant inverse)

**Nouveaux — Web**
- `apps/web/src/app/features/calendar/conflict-dialog/conflict-dialog.ts`
- `apps/web/src/app/features/calendar/conflict-dialog/conflict-dialog.html`
- `apps/web/src/app/features/calendar/conflict-dialog/conflict-dialog.scss`
- `apps/web/src/app/features/calendar/conflict-dialog/conflict-dialog.spec.ts` (15 tests)

**Modifiés — Web**
- `apps/web/src/app/core/availability/availability.service.ts` (type `ConflictEntry` portant `batchIndex` — ⚠️ hors de la liste « non touchés » de la story, motif ci-dessus)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (`resolveBatchConflicts`, `seanceCoveredCells`, `describeCell`, `describeSelection`, garde `conflictDialogOpen`, `SLOT_LABELS`, injection `MatDialog`)
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts` (2 tests réécrits, 9 ajoutés, mock `MatDialog` dans le harnais)

**Non touchés (confirmé par `git status`)**
- `apps/api/prisma/**` (**aucune migration**) · `availability.controller.ts` · `splitOccurrence()` · `constraint-panel/**` · `selection-bar/**` · `selection.utils.ts` · `day-detail.utils.ts` · `calendar-detail-rail/**` · `calendar-month-view/**` · `calendar-week-view/**` · `calendar-agenda-view/**` · `apps/web/src/styles.scss`

### Change Log

- 2026-08-19 — **Implémentation complète (Tasks 1 à 9, bmad-dev-story). Statut → review.** La route groupée absorbe désormais la résolution de conflits **et** la découpe de la story 1.7 (D-18) : deux AC de la story 30.2 sont renversées (AC2 échec en bloc, AC8 la garde), les sept autres tiennent et sont couvertes par des tests. **Le trou principal, trouvé en lisant le code et écrit dans aucun document, était que `createBatch()` ne renvoyait QU'UN SEUL conflit** (`find` + `throw` au premier item fautif) : le dialogue exigé par l'AC2 était donc inatteignable. La boucle collecte désormais tous les couples (créneau, déclaration) et ne lève qu'une fois. **La découpe est entrée dans le lot par EXTRACTION** — `createWithHoles()` ouvrait sa propre `$transaction`, son calcul est isolé dans `buildHolePieces()` pure, le chemin unitaire restant strictement inchangé (ses tests `keep` et les douze cas de `splitOccurrence` passent sans modification). **Une seule transaction, un seul `updateMany` groupé, une seule émission SSE** ; tout est calculé avant de l'ouvrir, le `timeout` par défaut étant de 5 s et la découpe multipliant les écritures. **« Remplacer ne touche que mes propres déclarations » n'a demandé aucune ligne de code** : l'indisponibilité dérivée d'une séance n'est jamais persistée, elle ne peut ni apparaître dans `conflicts` ni être expirée — le travail a été de l'afficher (ligne d'exception `✦`, non actionnable, construite côté client depuis `allCalendarEntries()`, **zéro appel réseau**) et de le verrouiller par des tests. **« Au cas par cas » est un parcours entièrement client** : le dialogue ne connaît aucun service HTTP, un geste résolu produit exactement DEUX appels et zéro pendant le défilé. **Le disaster n°1 de la story était réel** — les deux vues effacent leur sélection avant la réponse, `CalendarView` retient donc `event.cells`, sans quoi ni le nommage ni la re-soumission n'étaient possibles ; les vues n'ont pas été touchées. **⚠️ Un fichier hors de la liste « non touchés » a dû être modifié** : `core/availability/availability.service.ts`, pour que `ConflictError` porte `batchIndex` — seule clé reliant un conflit à une cellule nommable, les dates de `ConflictInfo` étant celles de la déclaration existante. **⚠️ `ConstraintPanel` n'a PAS été migré** (garde levée ≠ migration demandée, et zéro test de composant) : les vocabulaires « Écraser/Garder l'existant » et « Remplacer/Conserver » coexistent — question n°3 ouverte. **Un conflit interne au lot reste irrésoluble** et le front le distingue par les id synthétiques `batch-item-N`, conservant un message d'échec en bloc reformulé. **API 58 suites / 1245 tests** (baseline 1232, +13), typecheck 0, lint `src/availability` **22 = baseline**. **Web 103 fichiers / 1709 tests** (baseline 102/1686, +23), lint **143 = baseline**, build en échec sur le seul budget de bundle pré-existant (1,37 → 1,38 Mo). **Aucune migration Prisma.** ✅ **VÉRIFICATION VISUELLE RÉELLE FAITE** dans Chrome sur des données réelles — **elle a trouvé QUATRE défauts qu'aucun test ne voyait**, tous corrigés : accord manquant (« Les 4 deviennent disponible »), séparateur ambigu dans la liste des créneaux nommés (le même ` · ` séparait la date du créneau et deux créneaux entre eux — le créneau est désormais omis quand il vaut la journée entière, comme le fait le contrat d'UI), libellé et conséquence empilés-centrés par Material au lieu d'être alignés à gauche, et barre de défilement parasite en mode défilé. **Preuve la plus forte obtenue à l'écran** : quatre créneaux indisponibles redéclarés disponibles avec des décisions MIXTES (Remplacer / Conserver / Remplacer / Conserver) donnent 20 vert, 21 rouge, 22 vert, 23 rouge, état qui survit au rechargement — chaque décision n'a porté que sur son créneau, en une seule transaction. Annuler en cours de défilé après une décision déjà prise n'écrit rien. Web **103 fichiers / 1711 tests** après les correctifs (+2 tests de non-régression sur le nommage des créneaux), lint **143 = baseline**. ❌ **RESTE `/security-review`**, non optionnel sur cette story et déclenché par l'utilisateur.
- 2026-08-19 — Story créée (bmad-create-story), trois sous-agents d'exploration en parallèle. Cinq encadrés, seize AC, quatorze pièges, six questions ouvertes. Voir la note de `sprint-status.yaml` pour le détail.
