---
baseline_commit: 364810c5613e621d9644d17bf3767869fab56cfd
---

# Story 36.5 : Les informations pratiques d'une séance

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · **Serveur (D-15) + front** · **Première migration Prisma de l'épic** · **`/security-review` dû** [Source: epics.md — Séquence et portée]

> ⚠️ **Story amendée le 2026-08-19, avant implémentation.** `D-15` portait à l'origine **un seul champ de texte libre** ; elle en porte désormais **trois** — heure de rendez-vous, lieu, note libre. Cinq documents ont été corrigés en conséquence : voir [`sprint-change-proposal-2026-08-19.md`](../planning-artifacts/sprint-change-proposal-2026-08-19.md).

---

## Story

As a **joueur**,
I want **savoir où l'on joue, à quelle heure on se retrouve et quoi apporter**,
so that **je n'aie pas à chercher l'information ailleurs**.

---

## 🚨 Encadré n°1 — La place est déjà réservée. Deux stories l'ont creusée exprès et n'y ont rien mis

C'est la situation la plus confortable de tout l'épic : **le travail de conception a été fait en amont**, et cette story vient remplir un trou dessiné.

| Surface | Emplacement déjà en place | Qui l'a réservé |
| --- | --- | --- |
| **Rail de détail** | classe `.m`, commentée dans le SCSS : *« Accessoires (lieu, heure, note) — repliés en premier quand la place manque »* (`calendar-detail-rail.scss:80-84`) | Story 36.1 |
| **Bande de la case** | `.sub` dans le contrat d'UI ; `DaySlotDetail.seanceLabel` a déjà sa gouvernance par couche | Story 36.2 |
| **Agenda** | `AgendaEntry` a déjà reçu **quatre champs additifs** en 36.1 — celui-ci est le cinquième | Story 36.1 |

Les deux stories le disent noir sur blanc, en « Hors périmètre » :

> **36.1** — « Les informations pratiques d'une séance (« · chez Marc, 20 h 30 ») → **Story 36.5 / dérogation D-15**. Le champ **n'existe pas encore côté serveur** : il est structurellement impossible de l'afficher ici. **Le rail doit prévoir l'emplacement (`.m`) sans rien y mettre.** »
> **36.2** — « Le champ n'existe pas côté serveur ; **la bande doit pouvoir l'accueillir sans le prévoir en dur.** »
> **36.1, Change Log** — « **Seul écart au contrat : les informations pratiques, attendues** (champ serveur inexistant, D-15/story 36.5). »

**Et la maquette avait déjà anticipé les trois champs**, alors que la spec écrite parlait d'un texte unique — c'est ce constat qui a déclenché l'amendement du 2026-08-19 :

```html
<!-- contrat-ui-calendrier.html:299 — vue Semaine -->
<div class="t">Le Convoi du Nord</div>
<div class="s">chez Marc</div>          <!-- le LIEU, sur sa propre ligne -->
<div class="s">20 h 30 · dés</div>      <!-- l'HEURE et la NOTE -->

<!-- ligne 296 — une séance qui n'a QU'UN LIEU -->
<div class="t">Les Cendres d'Ashal</div><div class="s">en visio</div>
```

➡️ **Conséquence : ne rien redessiner, et surtout ne pas régénérer le contrat d'UI.** Le travail est d'ajouter trois données, de les faire arriver par les deux chemins d'alimentation, et de les composer dans trois emplacements qui existent déjà.

---

## 🚨 Encadré n°2 — ⚠️ L'AC1 dit « depuis la chronologie du scénario ». La chronologie n'édite rien

`ScenarioTimeline` (`features/scenarios/scenario-timeline/scenario-timeline.ts:73`) n'affiche d'une séance **qu'une date** (`seanceDateLabel()`, `:215-223`) et ne fait que **router** : vers `ScenarioEditor` si MJ, vers `ScenarioReadDialog` sinon (`:191-209`). Elle ne porte **aucune action de séance**.

**C'est `SeanceList` qui édite** (`features/scenarios/seance-list/seance-list.ts:38`) — capacité, inscription, suppression, remise à zéro de date, **et compte rendu**. Elle est montée par `ScenarioEditor` avec `[isMj]="true"` et par `ScenarioReadDialog` avec `[isMj]="false"`.

C'est **exactement la même forme de constat** que la story 36.1 (« aucune fenêtre de séance n'existe dans l'application »), et `EXPERIENCE.md:585` l'a érigé en règle générale : *« une séance n'a d'existence à l'écran qu'à l'intérieur de son scénario »*.

➡️ **« Depuis la chronologie du scénario » désigne le parcours, pas le composant.** Le point d'écriture va dans **`SeanceList`**, atteint depuis la chronologie via `ScenarioEditor`. Ne pas chercher un formulaire dans `ScenarioTimeline` : il n'y en a pas, et il ne faut pas en créer un.

---

## 🚨 Encadré n°3 — Le patron existe déjà en entier : le compte rendu de séance

`compteRendu` **est** un champ texte libre, porté par `Seance`, écrit par le seul MJ. Tout est à cloner, à l'identique, du schéma au test.

| Couche | Chemin exact à cloner |
| --- | --- |
| Prisma | `schema.prisma:535` — `compteRendu String?` (nullable, **aucun `@db.VarChar`** → colonne `TEXT`) |
| DTO | `dto/set-compte-rendu.dto.ts` — `@IsString() @MaxLength(5000)`, 7 lignes |
| Service | `scenarios.service.ts:844-872` — `findUnique` → 404, `resolveScenarioOrThrow`, **`parties.getOwned(partieId, mjId)`**, `update`, puis `realtimeEvents.emit(partieTopic)` + `notifyPartieSignalsChanged` |
| Contrôleur | `scenarios.controller.ts:185-192` — `@Patch('scenarios/seances/:id/compte-rendu')`, `ParseUUIDPipe`, `@CurrentUser()`, `@Body() dto` |
| Sérialisation | `toSeanceDto()` `scenarios.service.ts:1038-1060` |
| Type partagé | `SeanceDto` `packages/shared/src/index.ts:356-364` |
| Service client | `core/scenarios/scenarios.service.ts:238-248` — `PATCH`, `satisfies`, retour `ScenarioDto` complet, `notifyChanged(result.partieId)` |
| Template MJ | `seance-list.html:253-275` — **template-ref, pas de ReactiveForm** |
| Handler | `seance-list.ts:229-242` — garde `pollActionPending`, `seanceLinked.emit(updated)` |
| Tests | `scenarios.service.spec.ts:3839-3851` (non-MJ → 403, **aucune écriture**), `seance-list.spec.ts:817-900` |

**L'autorisation ne s'invente pas** : `parties.getOwned()` lève `ForbiddenException` si `partie.mjId !== userId` (`parties.service.ts:282-287`). C'est la réponse entière à l'AC5, et c'est ce qu'impose `P1-AD-3` (« `getOwned`/`getViewable` seul point de vérité d'appartenance/rôle »).

⚠️ **Deux divergences volontaires avec le compte rendu :** il y a **trois** champs et non un, et **aucun n'est un `<textarea>`**. Voir l'encadré n°5.

---

## 🚨 Encadré n°4 — ⚠️ Sur téléphone, les deux surfaces se taisent en même temps. Trouvé en lisant le CSS

Vérifié dans le code, et écrit nulle part :

- La bande n'affiche son texte **qu'au-dessus de 712 px** de largeur de grille — `@container month-grid (min-width: 712px) { .band__label { display: block } }` (`calendar-month-view.scss:270-283`). En dessous : `display: none`.
- Le rail masque son accessoire `.m` **en dessous de 768 px** — `@media (max-width: 767px) { .v .m { display: none } }` (`calendar-detail-rail.scss:151-154`).

**Sur un téléphone, les deux conditions sont vraies simultanément : les informations pratiques ne seraient visibles nulle part.** Or c'est précisément le cas que la story 36.2 avait verrouillé par son AC10 : *« le rail livré par la story 36.1 en donne le détail / And la vue mois sur téléphone ne dit à aucun moment moins qu'avant cette story »*, et la story 36.1 avait posé le principe inverse du repli mobile : *« au-dessus, le rail déplie au contraire tout ce qu'il a — c'est l'endroit le plus riche de l'écran, pas une consolation mobile »*.

➡️ **Décision : sur téléphone, le rail NE replie PAS les informations pratiques.** Il les descend sur **une seconde ligne** sous le titre plutôt que de les masquer. C'est l'AC11.

⚠️ **Écart assumé vs `DESIGN.md:373`**, qui range les accessoires parmi ce qui est *« replié en premier quand la place manque »*. Motif : cette règle a été écrite quand l'accessoire était un ornement ; depuis 36.2, le rail est **la seule surface qui porte l'information en mobile**. Replier revient à la supprimer. *À répercuter hors story par `bmad-ux`.*

---

## 🚨 Encadré n°5 — Trois champs, une garde, et un ordre de repli

### a) La garde qui fait tenir tout l'édifice — l'heure est une ÉTIQUETTE

C'est **le** point de cette story. `D-15` interdisait à l'origine toute notion d'heure ; l'amendement du 2026-08-19 a distingué deux objets que le texte confondait :

| | Ce que c'est | Verdict |
| --- | --- | --- |
| **Heure-étiquette** | une chaîne `"20:30"` affichée et transmise ; rien ne la lit, ne la compare, ne la trie, ne la calcule | ✅ **c'est ce qu'on livre** |
| **Heure-modèle** | un `DateTime` entrant dans la détection de conflits, la heatmap, la dérivation d'indisponibilité | ❌ **toujours interdite** |

Le motif est inchangé et il est structurel : toute la chaîne de disponibilité (`AD-9`, heatmap, `getSeanceDerivedUnavailability`, `computeSlotStatus`, la préséance de `buildDayDetail`) raisonne en **créneau de journée**. Une heure entrant dans le moteur y créerait une seconde granularité temporelle que **rien ne sait consommer**.

**Six gardes, opposables et non négociables** [Source: addendum.md §5.7 amendé] :

1. `heureRdv` est une **chaîne `"HH:MM"`** — ⚠️ **jamais un `DateTime`, jamais un type `time` Prisma**. *Une colonne typée « heure » invite mécaniquement le code suivant à calculer avec ; une chaîne, non.*
2. Rien ne la **parse**, ne la **compare**, ne la **trie**, ni ne l'injecte dans la chaîne de disponibilité.
3. **Une seule heure**, jamais un début/fin — **la durée reste interdite**.
4. **Aucun fuseau horaire.**
5. `lieu` est une chaîne courte **non structurée** — ni adresse, ni géocodage, ni lien de visio typé.
6. **Les trois champs sont facultatifs.**

### b) Les trois champs, leurs bornes et leurs contrôles

| Champ | Prisma | Validation API | Contrôle MJ | Contenu attendu |
| --- | --- | --- | --- | --- |
| `heureRdv` | `String?` | `@Matches(/^([01]\d\|2[0-3]):[0-5]\d$/)` + `@MaxLength(5)` | **`<input type="time">`** — widget natif, rend déjà `"HH:MM"` | `20:30` |
| `lieu` | `String?` | `@MaxLength(80)` | `<input type="text">` | « chez Marc », « en visio » |
| `notePratique` | `String?` | `@MaxLength(200)` | `<input type="text">` | « pensez aux dés » |

**Pourquoi 80 et 200, et non les 5000 de la convention de projet ?** Le contenu réel tient en une trentaine de caractères, il se rend **tronqué sur une bande de 20 px**, et il part **avec chaque charge de calendrier** — `GET /me/calendar` et `GET /parties/:id/scenarios` le renvoient pour **toutes** les séances de la plage. *Décision confirmée par l'utilisateur le 2026-08-19.*

⚠️ **Aucun `<textarea>`, pour aucun des trois.** Les trois porteurs d'affichage sont en `white-space: nowrap` : un `\n` ne peut **structurellement pas** se rendre. Un champ mono-ligne ne ment pas sur ce que l'application fera du texte. *Divergence assumée avec le compte rendu, qui est un récit ; ceci est une ligne d'accessoire.*

💡 **`<input type="time">` est le seul endroit où le motif n°1 de l'utilisateur se réalise** : le navigateur fournit le sélecteur **et** la validation de format, gratuitement, et rend une valeur déjà au format `"HH:MM"`. Ne pas le remplacer par un champ texte masqué.

### c) L'ordre de repli — la note cède la première

Quand la place manque, **on lâche dans cet ordre** : titre → heure → lieu → **note libre (lâchée en premier)**.

C'est le motif n°3 de l'utilisateur, et c'est maintenant une règle écrite [Source: EXPERIENCE.md §4.3 bis amendé, epics.md AC3 amendée]. C'est aussi **la raison d'être des trois champs séparés** : avec un texte unique, on ne pouvait rien lâcher sélectivement.

### d) La vue Semaine — hors périmètre

Le contrat d'UI dessine des cellules de vue Semaine portant titre **et** informations pratiques (`.t` + `.s`). Mais la vue Semaine **n'affiche aujourd'hui aucun titre de séance** — seulement une pastille dans l'en-tête de colonne (`calendar-week-view.html:33-35`), alimentée par un `Set<string>` de **dates**. Elle ne connaît ni le titre, ni quelle séance, ni sur quel créneau. Poser un accessoire sous un titre qui n'existe pas produirait une information orpheline.

➡️ La refonte de la cellule appartient à la **story 36.13**. **Ce n'est pas une divergence au contrat** : `epics.md` rappelle qu'il décrit l'état d'arrivée de l'épic. *Confirmé par l'utilisateur le 2026-08-19.*

---

## Acceptance Criteria

**Les cinq premières sont reprises verbatim d'`epics.md` (Story 36.5), *dans leur version amendée du 2026-08-19*.** AC6 à AC13 comblent des trous identifiés à l'analyse ; chacune porte son motif.

**AC1** — **Given** une séance · **When** le MJ l'édite depuis la chronologie du scénario · **Then** il peut saisir une **heure de rendez-vous**, un **lieu** et une **note libre**, tous trois facultatifs · **And** l'heure est saisie par un contrôle qui n'accepte qu'un format horaire · **And** lui seul peut les écrire

**AC2** — **Given** ces trois champs · **When** ils sont spécifiés · **Then** l'heure est une **étiquette** et non un instant — une chaîne que rien ne parse, ne compare, ne trie ni ne calcule · **And** ils n'introduisent **aucune durée, aucun fuseau, aucun lieu structuré** · **And** **aucun calcul** n'est fait à partir de leur contenu · **And** la chaîne de disponibilité continue de raisonner au **créneau de journée**

**AC3** — **Given** une séance portant ces informations · **When** elle s'affiche sur un créneau, dans le rail ou dans l'agenda · **Then** elles sont rendues **telles quelles**, tronquées si la place manque · **And** quand la place manque, la **note libre cède la première**, l'heure et le lieu tenant plus longtemps

**AC4** — **Given** une séance sans aucune de ces informations · **When** elle s'affiche · **Then** rien n'est réservé ni affiché à leur place · **And** il en va de même pour **chaque champ absent pris séparément**

**AC5** — **Given** un membre qui n'est pas le MJ de la partie · **When** il tente d'écrire ce champ · **Then** la demande est refusée

---

**AC6 — Les trois champs arrivent par LES DEUX chemins d'alimentation, sans aucun appel réseau supplémentaire.** *(Motif : c'est le piège qu'ont rencontré 36.1 et 36.2 ; en contexte de partie ils sont gratuits, en contexte personnel ils n'existent pas encore.)*
**Given** le calendrier **d'une partie** et le calendrier **personnel** · **When** une séance portant ces informations s'y affiche · **Then** elles sont présentes dans les deux · **And** aucun appel réseau supplémentaire n'est émis dans l'un ni dans l'autre

**AC7 — Rien ne fuit JAMAIS dans le calendrier d'une autre partie.** *(Motif : `AD-9`. Avec un lieu et une heure, c'est devenu la charge utile la plus indiscrète de l'application — « chez Marc, 20 h 30 ».)*
**Given** un membre occupé par une séance d'une **autre** partie · **When** le calendrier d'une partie affiche son indisponibilité · **Then** ni heure, ni lieu, ni note n'y transitent · **And** rien d'autre de nommant non plus — ni titre, ni identifiant

**AC8 — Les trois champs suivent le TITRE, jamais l'indisponibilité.** *(Motif : FR-50 et la garde formelle de 36.2. Le rang gagnant gouverne le texte ; l'engagement ne dépend d'aucun réglage.)*
**Given** la couche « mes séances confirmées » éteinte · **When** un créneau porte une séance · **Then** heure, lieu et note disparaissent avec le titre · **And** l'indisponibilité qui en découle demeure

**AC9 — Les trois champs sont échappés, jamais interprétés.** *(Motif : `docs/security.md` — trois textes écrits par un utilisateur et réaffichés à tous les membres, donc trois XSS stockés potentiels. « Rendu tel quel » de l'AC3 signifie **non reformaté**, pas **non échappé**.)*
**Given** un contenu comportant du balisage · **When** il est affiché · **Then** il apparaît littéralement · **And** il n'est jamais rendu par `innerHTML`, ni par un pipe de balisage, ni via `bypassSecurityTrust*`

**AC10 — Une seule dérivation, et une seule composition.** *(Motif : doctrine « ce qui doit rester cohérent sur dix écrans passe par un point unique » — `ARCHITECTURE-SPINE.md:43`. `buildDayDetail()` sert **déjà** le rail ET la case.)*
**Given** le rail, la bande et l'agenda · **When** ils affichent ces informations · **Then** ils les tiennent de la même dérivation que le titre · **And** l'ordre de repli est appliqué **au même endroit** pour les trois surfaces, jamais réécrit trois fois

**AC11 — Sur téléphone, l'information reste atteignable.** *(Motif : encadré n°4 — la bande et le rail se taisent aujourd'hui au même moment.)*
**Given** une largeur de téléphone, où la bande ne porte plus de texte · **When** un jour portant une séance est affiché au rail · **Then** ses informations pratiques y restent lisibles · **And** elles ne sont pas repliées avec les autres accessoires

**AC12 — La migration est strictement additive.** *(Motif : première migration de l'épic 36.)*
**Given** le modèle de données · **When** cette story est livrée · **Then** **trois** champs, tous **nullables**, sont ajoutés à `Seance` · **And** aucun autre champ, aucune table, aucun index, aucune reprise de données · **And** **aucun d'eux n'est un type temporel** — `heureRdv` est un `String?`

**AC13 — Les informations sont annoncées, pas seulement affichées.** *(Motif : P-2 ; la bande porte déjà un `aria-label` construit, et un accessoire muet serait invisible au lecteur d'écran alors qu'il est visible à l'œil.)*
**Given** une bande ou une ligne de rail portant ces informations · **When** elle est lue par un lecteur d'écran · **Then** elles figurent dans son intitulé accessible · **And** la troncature visuelle ne les tronque pas à l'oreille

---

## Tasks / Subtasks

### 1. Les trois champs, en base et dans le contrat partagé (AC1, AC2, AC12)

- [x] `apps/api/prisma/schema.prisma` : ajouter **trois** champs au modèle `Seance`, **juste après `compteRendu`**, tous nullables et **sans `@db.VarChar`** (même patron exact que `compteRendu`, donc colonnes `TEXT`) :
  ```prisma
  heureRdv       String?   // « 20:30 » — ÉTIQUETTE, jamais un instant. Voir encadré n°5a.
  lieu           String?   // « chez Marc », « en visio » — chaîne non structurée
  notePratique   String?   // « pensez aux dés »
  ```
  ⚠️ **`heureRdv` est un `String?`, jamais un `DateTime` ni un type `time`.** C'est la garde n°1, et c'est celle qui empêche le code suivant de calculer avec.
- [x] `docker compose exec api pnpm prisma migrate dev --name seance_infos_pratiques` — la migration attendue est **trois `ADD COLUMN ... TEXT`**, sans default et sans backfill.
  ⚠️ Si la migration contient un type temporel, un index ou une reprise, c'est un signal d'erreur (AC12).
- [x] `packages/shared/src/index.ts` : ajouter les trois champs à **`SeanceDto`**, après `compteRendu`. Ajouter le payload `SetInfosPratiquesDto { heureRdv: string \| null; lieu: string \| null; notePratique: string \| null }` à côté de `SetCompteRenduDto`.
  💡 **Un seul payload pour les trois**, et non trois routes : le MJ les saisit ensemble, et une écriture partielle compliquerait la remise à vide.
- [x] ⚠️ **Ne PAS ajouter de durée, de fuseau, ni de lieu structuré** (AC2). Le motif est structurel, pas esthétique — voir l'encadré n°5a.

### 2. L'écriture, réservée au MJ (AC1, AC5)

- [x] `apps/api/src/scenarios/dto/set-infos-pratiques.dto.ts` — sur le patron de `set-compte-rendu.dto.ts`, mais avec **trois champs optionnels et nullables** :
  ```ts
  @IsOptional() @ValidateIf((_, v) => v !== null)
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: "L'heure doit être au format HH:MM" })
  heureRdv?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(80)
  lieu?: string | null;

  @IsOptional() @ValidateIf((_, v) => v !== null) @IsString() @MaxLength(200)
  notePratique?: string | null;
  ```
  ⚠️ **`null` doit être accepté** — c'est ainsi que le MJ **vide** un champ. `@ValidateIf` évite que les validateurs de format rejettent `null`.
  ⚠️ **80 et 200, et non 5000** : voir l'encadré n°5b. Commenter le motif dans le fichier.
  ⚠️ **Valider le format de l'heure côté serveur aussi**, jamais uniquement par le widget : `whitelist`/`forbidNonWhitelisted` ne contrôlent pas la forme d'une chaîne.
- [x] `ScenariosService.setInfosPratiques(seanceId, mjId, dto)` — **copie littérale de `setCompteRendu` (`:844-872`)**, écrivant les trois champs en un seul `update` : `findUnique` → `NotFoundException('Séance introuvable')`, `resolveScenarioOrThrow`, **`parties.getOwned(scenario.partieId, mjId)`**, `update`, `realtimeEvents.emit(partieTopic(partieId))`, `notifyPartieSignalsChanged`, retour `toEnrichedDto(...)`.
  ⚠️ **Aucune garde de `kind` ni de statut** — `Seance` n'a pas de statut, et le champ est neutre. Reprendre le commentaire AD-1/AD-9 de `setCompteRendu` (`:841-843`), adapté.
- [x] Route `@Patch('scenarios/seances/:id/infos-pratiques')` dans `scenarios.controller.ts`, calquée sur `:185-192` (`ParseUUIDPipe`, `@CurrentUser()`, `@Body()`).
  ⚠️ **Aucun guard MJ au niveau route** : dans ce projet l'autorisation est **en service** (`getOwned`). Ne pas inventer un décorateur.
- [x] `toSeanceDto()` (`:1038-1060`) : exposer les **trois** champs, après `compteRendu`.
- [x] ⚠️ **Aucun tri, aucune comparaison, aucun `new Date()` sur `heureRdv`** — nulle part, jamais (garde n°2).
- [x] ⚠️ **Ne PAS créer de signal de partie** sur ces champs. `party-signals.service.ts:74-84` construit `COMPTE_RENDU_NON_REDIGE` en filtrant `compteRendu: null` — une séance sans informations pratiques est **normale**, pas un manquement (AC4). *Le « rappel silencieux » voulu par l'utilisateur passe par le champ vide **dans le formulaire**, pas par un signal.*

### 3. Le calendrier personnel reçoit le champ (AC6)

- [x] `packages/shared/src/index.ts` : ajouter les **trois** champs à **`MyCalendarSeanceEntry`** (`:604-612`).
- [x] `availability.service.ts` : étendre la signature structurelle de `buildMySeancesLayer` (`:988-1002`) et son `entries.push` (`:1018-1028`).
  ✅ **Aucun coût de requête** : le `findMany` des séances (`:859-866`) ne restreint pas les colonnes scalaires — le champ est déjà chargé.
- [x] ⚠️ **Ne pas toucher `getSeanceDerivedUnavailability()`** (`:770-812`) : elle ne lit que date/slot/inscriptions et **doit le rester** (AC7). C'est le chemin par lequel une séance d'une autre partie devient une indisponibilité anonyme.

### 4. La donnée traverse le front jusqu'aux trois surfaces (AC3, AC6, AC8, AC10)

- [x] `AgendaEntry` (`calendar-agenda-view.ts:17-37`) : **trois champs additifs** — `seanceHeure?: string`, `seanceLieu?: string`, `seanceNote?: string`.
  ⚠️ **Ne PAS réutiliser `detail`** : il est déjà occupé (créneau brut, nombre d'options, comptage d'inscrits). Doctrine posée par 36.1 : *« champs additifs sur un type existant, jamais un type parallèle »*.
  💡 **Trois champs séparés jusqu'au bout, jamais une chaîne pré-composée** — sans quoi l'ordre de repli (AC3) devient impossible à appliquer en aval.
- [x] `calendar-view.ts`, `allCalendarEntries()` — **les deux branches** :
  - branche **partie** (`:291-311`) : le `SeanceDto` complet est déjà en main, le champ est gratuit ;
  - branche **personnelle** (`:343-379`) : depuis `MyCalendarSeanceEntry`, enrichi en Task 3.
- [x] `day-detail.utils.ts` : ajouter les trois champs à **`DaySlotDetail`** (`:62-81`), renseignés dans `buildDayDetail` (`:181-188`) **sous la même gouvernance `seanceNamed` que `seanceLabel`** — c'est l'AC8 : couche éteinte ⇒ titre **et** informations pratiques disparaissent, l'indisponibilité demeure.
- [x] **Une fonction pure de composition, dans le même fichier** (AC10) : `composeSeanceInfo(detail, budget)` → applique l'ordre de repli **titre → heure → lieu → note** et rend la chaîne à afficher. Elle sert le rail, la bande **et** l'agenda ; personne ne recompose de son côté.
  ⚠️ Le patch de 36.2 avait déjà corrigé une **fuite de texte inter-rangs** (« `text` suit désormais `winner` ») : le nouveau champ doit suivre le **rang gagnant**, pas un `??` opportuniste.
- [x] `calendar-month-view.ts` : `DayBand` (`:41-51`) gagne son texte accessoire **issu de `composeSeanceInfo()`**, calculé comme `text` (`:143`) — **uniquement quand `winner === 'seance'`**.
- [x] ⚠️ **Une séance sans vote couvre les TROIS bandes** (`chosenSlot` absent ⇒ `FULL_DAY` ⇒ `entryCoversSlot()`) : le texte se répétera sur trois bandes. C'est cohérent avec le titre, qui fait déjà de même. Ne pas « corriger » ce comportement.

### 5. Le rendu, dans les trois emplacements réservés (AC3, AC4, AC11, AC13)

- [x] **Rail** — remplir la classe `.m` existante (`calendar-detail-rail.html:48`, `scss:80-84`). ⚠️ Le rail **n'a aujourd'hui aucune troncature CSS** (`.v` a `flex:1; min-width:0` mais ni `nowrap` ni `ellipsis`) : l'ajouter.
- [x] **Rail en mobile (AC11)** : lever le `display: none` de `@media (max-width: 767px) { .v .m }` (`scss:151-154`) et faire passer l'accessoire **sur une seconde ligne**. Commenter le motif — c'est un écart assumé à `DESIGN.md:373`.
- [x] **Bande** — un span accessoire à côté de `.band__label`, sur le patron `.sub` du contrat : `font-size` inférieur, `text-muted`, `white-space: nowrap; overflow: hidden; text-overflow: ellipsis`. Il suit le même seuil de container query (712 px) que le titre.
- [x] **AC3 — l'ordre de repli** : sur la bande, la surface la plus étroite, la **note libre est omise en premier**. Elle ne compte pas sur l'ellipse CSS pour disparaître : `composeSeanceInfo()` la retire du texte composé.
- [x] **Agenda** — un span à côté de `.agenda-entry__detail` (`calendar-agenda-view.html:15-17`), conditionné par `@if`.
- [x] **AC4 partout, et champ par champ** : `@if (…)` sur chaque valeur, jamais un conteneur vide ni une hauteur réservée. Tester avec `null`, `''` **et** une chaîne d'espaces (le compte rendu utilise `.trim()` pour cela — `seance-list.html:264`). ⚠️ **Une séance n'ayant qu'un lieu ne doit rien réserver pour l'heure ni la note** — c'est le cas que la maquette dessine (`contrat-ui-calendrier.html:296`, « en visio » seul).
- [x] **AC13** : inclure le texte dans `bandAriaLabel()` (`calendar-month-view.ts:418-429`) et dans l'intitulé accessible de la ligne de rail.
- [x] ⚠️ **AC9 — interpolation `{{ }}` uniquement.** Jamais `[innerHTML]`, jamais `bypassSecurityTrust*`, jamais un pipe de balisage. L'échappement d'Angular **est** la défense ; il n'y a pas de sanitisation serveur dans ce projet pour les textes libres, et il ne faut pas en inventer une troisième forme.
- [x] ⚠️ **Piège de séparateur, hérité de la revue de 36.4.** La composition emploie ` · ` entre les trois champs, comme le contrat. Mais **la note libre peut elle-même contenir un ` · `** saisi par le MJ — auquel cas on ne distingue plus les champs les uns des autres. Le risque est **atténué** par la séparation (la note vient en dernier), il n'est pas nul. La story 36.4 a été rattrapée exactement là-dessus à la vérification visuelle : **choisir le rattachement au titre, le commenter, et le regarder à l'écran**.

### 6. L'écriture côté MJ (AC1, AC5)

- [x] `core/scenarios/scenarios.service.ts` : `setInfosPratiques(seanceId, dto)` — clone de `setCompteRendu` (`:238-248`) : `PATCH`, `satisfies`, retour `ScenarioDto` complet, `notifyChanged(result.partieId)`.
- [x] `seance-list.html` : **trois** contrôles MJ sur le patron du compte rendu (`:253-275`) — `@if (isMj()) { les trois champs + un bouton } @else if (au moins une valeur) { texte composé } @else { rien }`.
  - `<input type="time">` pour l'heure — ⚠️ **le widget natif est le point de la story** (motif n°1), ne pas le remplacer par un champ texte masqué ;
  - `<input type="text" maxlength="80">` pour le lieu, avec un **libellé visible « Lieu »** — c'est lui qui produit le « rappel silencieux » voulu (motif n°2) ;
  - `<input type="text" maxlength="200">` pour la note.
  ⚠️ **Un seul bouton d'enregistrement pour les trois**, cohérent avec le payload unique.
  ⚠️ **AC4 : pas d'état incitatif côté joueur.** Le compte rendu affiche « Aucun compte-rendu… » ; les informations pratiques, elles, ne réservent rien. **Divergence volontaire** avec le patron copié.
  ⚠️ **Aucun `<textarea>`** — encadré n°5b.
  💡 **Vider un champ** : le contrôle rendu vide doit envoyer `null`, pas `''` — sans quoi on ne distingue pas « effacé » de « jamais rempli ».
- [x] `seance-list.ts` : handler calqué sur `onSetCompteRendu` (`:229-242`) — garde `pollActionPending`, `try/catch`, `error.set(...)`, `seanceLinked.emit(updated)`.
- [x] ⚠️ **Ne rien ajouter à `ScenarioTimeline`** (encadré n°2). Elle route, elle n'édite pas.
- [x] ⚠️ **Aucune écriture depuis le calendrier** — `EXPERIENCE.md:578` : « *Écrire les informations pratiques | Depuis la séance dans la chronologie | MJ — **jamais depuis le calendrier*** ».

### 7. Tests — API (AC1, AC2, AC5, AC6, AC7, AC12)

- [x] `scenarios.service.spec.ts` — cloner le bloc `setCompteRendu` (`:3749-3851`) : succès, **non-MJ → `ForbiddenException` et `seance.update` NON appelé** (`:3839-3851`, le test le plus important), 404 séance introuvable, chaîne vide acceptée, émission temps réel, `notifyPartieSignalsChanged`, `it.each` sur les trois `kind`.
- [x] `dto/set-infos-pratiques.dto.spec.ts` — cloner `set-compte-rendu.dto.spec.ts`, étendu aux trois champs : les trois absents → valide ; les trois `null` → valide ; `heureRdv` `"20:30"` → valide ; `"25:00"`, `"8h30"`, `"20:5"` → **invalides** ; `lieu` à 81 caractères → invalide, 80 → valide ; `notePratique` à 201 → invalide, 200 → valide.
  ⚠️ Le test des formats d'heure invalides est **la garde n°1 rendue exécutable** : ne pas l'omettre.
- [x] `scenarios.controller.spec.ts` — routage seanceId/user/dto (patron `:172-179`).
- [x] `availability.service.spec.ts` — `getMyCalendar` : la couche `mes-seances` porte le champ ; **et une séance d'une autre partie ne le fait jamais fuiter** (AC7).
  💡 **Occasion de refermer une dette** : `deferred-work.md:9` note qu'**aucun test ne construit le cas « créneau `UNAVAILABLE` dérivé d'une séance d'une autre partie, sans nom ni id exposé »** (AC7 de la story 36.1, resté non couvert). Cette story ajoute une donnée nommante de plus — c'est le bon moment. Le noter comme refermé dans `deferred-work.md` si c'est fait.

### 8. Tests — Web (AC3, AC4, AC8, AC9, AC10, AC11, AC13)

- [x] `day-detail.utils.spec.ts` — fonctions **pures, testées sans TestBed** : les trois champs suivent le rang gagnant ; **couche éteinte ⇒ les trois à `null`** comme `seanceLabel` (patron `:141-144`) ; absents ⇒ `null`.
- [x] `composeSeanceInfo()` — **l'ordre de repli, testé isolément** (AC3) : les trois présents → composition complète ; budget réduit → **la note tombe la première** ; puis le lieu ; l'heure tient le plus longtemps ; une séance n'ayant qu'un lieu → « en visio » seul, sans séparateur orphelin.
- [x] `calendar-detail-rail.spec.ts` — texte rendu ; **absent ⇒ aucun nœud** (AC4) ; présent dans l'intitulé accessible (AC13).
- [x] `calendar-month-view.spec.ts` — texte dans la bande (patron `:748`) ; couche éteinte ⇒ disparu (patron `:754-772`) ; `aria-label` enrichi (patron `:787-791`).
- [x] `calendar-agenda-view.spec.ts` — rendu, et **`detail` inchangé** (non écrasé).
- [x] `calendar-view.spec.ts` — le champ arrive par **les deux branches** d'`allCalendarEntries()` (AC6) ; **zéro appel réseau supplémentaire** (patron AC5 de 36.1, `:1433`).
- [x] `seance-list.spec.ts` — cloner `:817-900` : champ visible MJ seulement, pré-rempli, joueur → texte seul, **absent ⇒ rien du tout** (AC4), handler appelle le service et émet `seanceLinked`.
- [x] **AC9** : un test par champ montant une valeur contenant du balisage et vérifiant qu'elle apparaît **littéralement** (`textContent`), aucun élément injecté.
- [x] **Zoneless** : `whenStable()` seul ne suffit pas après un `ngOnInit` asynchrone — reprendre la boucle de ticks établie dans `calendar-view.spec.ts`.

### 9. Vérification

- [x] `docker compose exec api pnpm test` · **`pnpm typecheck`** (⚠️ `ts-jest` ne type-vérifie pas en cross-file ; cette story change `SeanceDto`, consommé partout).
- [x] `docker compose exec web pnpm test` · `pnpm lint` (attendu : **143 erreurs pré-existantes**, zéro nouvelle).
- [x] `docker compose exec api pnpm exec eslint src/availability` (attendu : **22**, baseline).
- [x] Vérifier la migration générée : **trois `ADD COLUMN ... TEXT`**, aucun type temporel, aucun index (AC12).
- [x] **Vérification visuelle réelle** dans le navigateur. ⚠️ **Les quatre stories 36.1 à 36.4 ont CHACUNE trouvé par ce moyen des défauts qu'aucun test ne voyait.** Points à regarder en priorité : le **widget natif d'heure** (rendu et locale), le rattachement de l'accessoire au titre (piège de séparateur), le rendu **en largeur téléphone** (AC11 — le cas nouveau de cette story), l'**ordre de repli** en réduisant la largeur, une séance **n'ayant qu'un lieu** (AC4), une séance **sans rien** (rien ne doit bouger), et une séance sans vote qui répète le texte sur trois bandes.
- [ ] **`/security-review`** — story « données + autorisation » au sens de `docs/security.md:69`. ⚠️ **Il est déjà en dette depuis la story 36.4**, qui l'a consigné non fait.

### Review Findings

Revue adversarielle du 2026-08-19 (bmad-code-review) — 3 couches parallèles (Blind Hunter, Edge Case Hunter, Acceptance Auditor). 12 constats remontés, 6 patch, 0 decision, 0 defer, 6 rejetés (dont 1 faux positif vérifié : le Blind Hunter a mal attribué le hunk `heureRdv?/lieu?/notePratique?` à la dérivation d'indisponibilité `getSeanceDerivedUnavailability` — vérification faite, ce hunk appartient à `buildMySeancesLayer` (flux personnel AC6), aucune fuite ; AC7 tient et est testé).

- [x] [Review][Patch] `composeSeanceInfo` tronque par position et non par présence — une séance n'ayant qu'un `lieu` (sans `heureRdv`) n'affiche rien à densité `minimal`/`compact` [apps/web/src/app/features/calendar/day-detail.utils.ts:1507-1514] — corrigé (filtre avant troncature)
- [x] [Review][Patch] AC13 violé — le rail n'inclut pas les informations pratiques dans le nom accessible des lignes navigables (`aria-label` du bouton écrase le contenu visuel) [apps/web/src/app/features/calendar/calendar-detail-rail/calendar-detail-rail.ts:83-85] — corrigé (`openLabel()` inclut `seanceInfo()`)
- [x] [Review][Patch] Contrat PATCH infos-pratiques incohérent — DTO backend optionnel vs DTO partagé requis ; `dto.champ ?? null` effacerait silencieusement un champ omis sur un futur appel partiel [apps/api/src/scenarios/dto/set-infos-pratiques.dto.ts] — corrigé (champs requis, alignés sur le DTO partagé)
- [x] [Review][Patch] Le signal temps réel `changed` peut écraser une saisie MJ non sauvegardée dans les trois nouveaux champs (pas de garde de brouillon, contrairement au patron déjà établi dans le projet) [apps/web/src/app/features/scenarios/seance-list/seance-list.ts:66-73] — corrigé (brouillon signal, patron `ScenarioEditor.applyScenario()`)
- [x] [Review][Patch] `lieu`/`notePratique` acceptent des valeurs uniquement blanches côté API (pas de garde anti-espaces, contrairement à `heureRdv`) [apps/api/src/scenarios/dto/set-infos-pratiques.dto.ts:392-402] — corrigé (`@Matches(NON_BLANK)`)
- [x] [Review][Patch] `heureRdv` malformé (donnée insérée hors app) rendu vide silencieusement dans le sélecteur d'heure du MJ, mais affiché tel quel aux joueurs [apps/web/src/app/features/scenarios/seance-list/seance-list.html:265] — corrigé (avertissement inline si la valeur stockée ne respecte pas HH:MM)

---

## Hors périmètre

- **La cellule de vue Semaine** (titre + accessoires) → **story 36.13**. Elle n'affiche aujourd'hui qu'une pastille, sans titre : voir encadré n°5c.
- **Toute notion d'heure, de durée, de fuseau, de lieu structuré** → interdit par l'AC2, avec un motif structurel (addendum §5.7).
- **L'écriture depuis le calendrier** → interdite par `EXPERIENCE.md:578`.
- **Un signal de partie « informations pratiques non renseignées »** → l'absence est normale (AC4).
- **Réaligner les libellés « Écraser / Garder l'existant » du `ConstraintPanel`** → question ouverte héritée de 36.4, sans rapport ici.
- **Les items différés de 36.4** (TOCTOU, boucle séquentielle, `ConstraintPanel` sans test de composant) → restent dans `deferred-work.md`.
- **`deferred-work.md:21`** — `seance.findMany` sans borne de date inférieure. ⚠️ **Cette story l'aggrave** (une colonne texte de plus sur chaque ligne chargée) : le **noter** dans `deferred-work.md`, sans le corriger ici (aucun AC ne le porte).

---

## Ce qui doit continuer de fonctionner

- **`setCompteRendu` en entier** — service, route, DTO, champ `SeanceDto`, textarea de `SeanceList`, et le signal `COMPTE_RENDU_NON_REDIGE`.
- **`buildDayDetail()` / `SLOT_PRECEDENCE` / `entryCoversSlot()` / `buildMonthDetails()`** — le point unique livré par 36.1 et achevé par 36.2. Signatures étendues, jamais dupliquées.
- **La garantie de FR-50** : couche éteinte ⇒ le **texte** disparaît, l'**indisponibilité** demeure. Elle est protégée par des tests des deux côtés.
- **`getSeanceDerivedUnavailability()`** — anonyme, sans texte, sans identité (AD-9).
- **Les seuils existants** : container query à 712 px pour la bande, `--bp-tablet` 768 px pour le rail (dont seule la règle `.m` change).
- **La sélection, la barre et la résolution de conflits** livrées par 36.3 et 36.4 — cette story ne touche à aucun geste.
- **`AgendaEntry.detail`** dans ses trois usages actuels.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Chercher un formulaire dans `ScenarioTimeline`.** Il n'y en a pas. L'édition vit dans `SeanceList` (encadré n°2).
2. **Écraser `AgendaEntry.detail`.** Il porte déjà trois choses. Cinquième champ **additif**.
3. **Oublier la branche personnelle.** En contexte de partie le champ est gratuit ; en personnel il faut enrichir `MyCalendarSeanceEntry` **et** `buildMySeancesLayer`. Sans cela le champ marche à l'essai et manque en production sur `profile/calendar` (AC6).
4. **Laisser le texte fuiter dans `getSeanceDerivedUnavailability()`.** C'est l'AC7, et c'est la donnée la plus indiscrète de l'application.
5. **Faire suivre l'indisponibilité au texte au lieu du titre.** 36.2 a déjà corrigé cette fuite une fois (« `text` suit désormais `winner` »).
6. **Rendre le texte avec `[innerHTML]`** parce que l'AC3 dit « tel quel ». « Tel quel » = **non reformaté**, pas non échappé (AC9).
7. **Retenir `@MaxLength(5000)` par mimétisme.** Le texte part avec chaque charge de calendrier (encadré n°5b).
8. **Un `<textarea>`.** Les trois porteurs sont `nowrap` : un `\n` ne peut pas se rendre (encadré n°5b).
8 bis. 🚨 **Typer `heureRdv` en `DateTime` ou en `time` Prisma.** C'est **la** faute qui ruinerait la story : elle ferait entrer une seconde granularité temporelle dans un modèle qui raisonne en créneau de journée, et rouvrirait tout ce que `D-15` protège. `String?`, et rien d'autre (garde n°1).
8 ter. **Parser, comparer ou trier `heureRdv`** — même « juste pour ordonner deux séances du même jour ». Garde n°2 : rien ne la lit.
8 quater. **Composer la chaîne trop tôt.** Les trois champs restent séparés jusqu'à `composeSeanceInfo()` ; une chaîne pré-composée côté serveur ou dans `AgendaEntry` rendrait l'ordre de repli (AC3) inapplicable.
8 quinquies. **Envoyer `''` au lieu de `null`** quand le MJ vide un champ : on ne distinguerait plus « effacé » de « jamais rempli ».
9. **Ajouter un état incitatif « Aucune information pratique ».** L'AC4 l'interdit — divergence volontaire avec le compte rendu. *Le « rappel silencieux » passe par le champ vide dans le **formulaire MJ**, pas par un message côté joueur.*
10. **Coller l'accessoire au titre avec ` · `** alors que le texte de l'utilisateur emploie déjà ce séparateur. C'est exactement le défaut que la vérification visuelle de 36.4 a attrapé.
11. **Replier l'accessoire du rail en mobile** parce que `DESIGN.md` le dit. Il serait alors invisible partout (encadré n°4, AC11).
12. **Oublier `pnpm typecheck` côté API.** `SeanceDto` est consommé largement, et `ts-jest` ne type-vérifie pas en cross-file.
13. **Laisser la migration faire autre chose que trois `ADD COLUMN ... TEXT`.** AC12.
14. **Créer un signal de partie** sur l'absence du champ. Une séance sans informations pratiques est normale.

### Décisions arrêtées par cette story

- **Trois champs** : `heureRdv` (chaîne `"HH:MM"`), `lieu`, `notePratique` — nommage cohérent avec `compteRendu`, `resumeFin`, `dureeHeures`.
- 🚨 **`heureRdv` est une chaîne, jamais un type temporel.** C'est la garde qui fait tenir `D-15` amendée.
- **Bornes : heure au format validé, `lieu` 80, `notePratique` 200** — ⚠️ écart assumé vs la convention de 5000, avec son motif.
- **Trois `<input>` mono-ligne**, dont un `type="time"` natif — ⚠️ divergence assumée avec le `<textarea>` du compte rendu.
- **Un seul payload et un seul bouton** pour les trois champs.
- **Ordre de repli : titre → heure → lieu → note**, appliqué en **un seul endroit** (`composeSeanceInfo()`).
- **Le rail ne replie pas l'accessoire en mobile**, ⚠️ écart assumé vs `DESIGN.md:373`.
- **La vue Semaine reste hors périmètre** → 36.13.
- **Aucun état incitatif** quand un champ est vide (AC4).
- **Les trois champs suivent le rang gagnant `seance`**, sous la gouvernance `seanceNamed` existante.

### Décisions laissées à l'implémentation

- **Forme du rattachement visuel** de l'accessoire au titre (deuxième ligne, séparateur autre que ` · `, mise en retrait) — à trancher et **commenter**, le contrat ne dessinant qu'un rendu desktop.
- **Noms exacts des champs d'`AgendaEntry` / `DaySlotDetail`** (`seanceHeure` / `seanceLieu` / `seanceNote` recommandés, par symétrie avec `seanceLabel`/`seanceTarget`).
- **Signature de `composeSeanceInfo()`** — un budget en caractères, un drapeau de densité, ou un simple niveau (`'full' | 'compact' | 'minimal'`). *Recommandation : un niveau, plus lisible en test que des caractères.*
- **Disposition des trois contrôles** dans la ligne de `SeanceList` — en colonne, ou heure et lieu côte à côte.
- **Placement du champ dans la ligne de `SeanceList`** — au-dessus ou en dessous du compte rendu.
- **Troncature du rail** : une ligne à l'ellipse, ou deux lignes en `-webkit-line-clamp`.

### Notes de plateforme

- **API** : NestJS 11, Prisma 7.8 (générateur `prisma-client-js` legacy), Jest 30 + `ts-jest`. Migrations : `<YYYYMMDDHHMMSS>_<snake_case>`, la plus récente étant `20260814192840_calendar_layers`.
- **Web** : Angular 22 **zoneless**, Material 22.0.2, Vitest 4, TypeScript 6.0.2. `@if`/`@for` et signals ; `input()`/`output()` signal-based ; `standalone: true` ; `import type` pour `@master-jdr/shared`.
- **Validation globale** : `whitelist: true` / `forbidNonWhitelisted` déjà en place — un champ non déclaré au DTO est rejeté.
- **Aucune dépendance nouvelle.**
- **Exécution : tout par Docker.**
- **Baseline mesurée au démarrage de cette story** (working tree propre, `HEAD = 364810c`) : **API 58 suites / 1248 tests**, **web 103 fichiers / 1714 tests**, tous verts. Lint web **143**, lint `src/availability` **22**, build en échec sur le seul budget de bundle pré-existant (~1,38 Mo).
  ⚠️ Ces chiffres sont **supérieurs** à ceux consignés par la story 36.4 (1245 / 1711) : un travail est encore en cours sur la 36.4, dont le statut est repassé à `in-progress`. **Reconfirmer la baseline au démarrage.**

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : aucun câblage nouveau, le câblage existant suffit et doit être conservé.** `setCompteRendu` émet déjà `realtimeEvents.emit(partieTopic(partieId))` et `notifyPartieSignalsChanged` ; la méthode clonée fait de même, et côté client `notifyChanged(result.partieId)` repropage vers `ScenarioTimeline`, `SeanceList` et `CalendarView`, qui écoutent déjà `scenarios.changed()`. Un MJ modifiant les informations pratiques pendant qu'un joueur regarde son calendrier de partie verra donc l'écran du joueur se rafraîchir. **La dette héritée sur `GET /me/calendar`** (non rafraîchi sur `profile/calendar`) **reste ouverte et non aggravée** — le calendrier personnel ne se met pas à jour en direct, comme aujourd'hui. [Source: CLAUDE.md ; docs/checklist.md]

### Sécurité

- **XSS stocké** : le champ est écrit par le MJ et lu par tous les membres. La défense est l'**échappement d'Angular en interpolation** (AC9), cohérente avec `compteRendu` et `resumeFin`, qui n'ont eux non plus aucune sanitisation serveur. Ne pas inventer un troisième chemin (doctrine `AD-17`).
- **Autorisation** : écriture par `getOwned` (MJ), lecture par `getViewable` (membre). ⚠️ `toSeanceDto()` n'applique **aucun filtrage anti-spoil** — l'anti-spoil est purement frontend (`AD-6`) — donc le champ est visible de **tout membre de la partie** dès qu'il entre dans `SeanceDto`. C'est **voulu** (l'AC3 le destine aux joueurs), mais doit être su.
- **Non-fuite inter-parties** : AC7, garantie par `getSeanceDerivedUnavailability()` qui ne renvoie qu'un statut de créneau.
- **Validation** : union non applicable ; `@IsString() @MaxLength(200)`, jamais un champ libre non borné.
- **`/security-review` obligatoire** avant clôture — et **déjà en dette depuis 36.4**.

### Dette refermée par cette story

- **L'emplacement vide du rail (`.m`) et de la bande (`.sub`)**, réservés par 36.1 et 36.2 et laissés vides faute de champ serveur. Le « seul écart au contrat » consigné au Change Log de 36.1 se referme ici.
- **Le désaccord entre la maquette et le PRD** — la planche composait trois morceaux, la spec parlait d'un texte unique. Résolu par la proposition de changement du 2026-08-19.
- **Possiblement `deferred-work.md:9`** (aucun test ne couvre l'absence de fuite d'une séance tierce) — voir Task 7.

### Dette explicitement NON refermée

- **`deferred-work.md:21`** — `seance.findMany` sans borne de date inférieure, **aggravée** par cette story. À noter, pas à corriger.
- **`deferred-work.md:8`** — l'indicateur `loading` du rail omet `slotsLoading`.
- **`deferred-work.md:15`** — liste Agenda non bornée ; chaque ligne s'alourdit d'un texte.
- **`deferred-work.md:425`** — TOCTOU `P2025` entre `findUnique` et `update` sur `Seance`. ⚠️ **Cette story reproduit exactement ce patron** (elle clone `setCompteRendu`). Rester cohérent avec l'existant plutôt que traiter le cas ici, mais **le consigner**.
- **Les items différés de la story 36.4**, dont `/security-review` non fait.

### Project Structure Notes

**Nouveaux — API**
- `apps/api/src/scenarios/dto/set-infos-pratiques.dto.ts` (+ `.spec.ts`)
- `apps/api/prisma/migrations/<timestamp>_seance_infos_pratiques/migration.sql`

**Modifiés — API**
- `apps/api/prisma/schema.prisma` (**trois** champs nullables sur `Seance`)
- `apps/api/src/scenarios/scenarios.service.ts` (`setInfosPratiques`, `toSeanceDto`) + `.spec.ts`
- `apps/api/src/scenarios/scenarios.controller.ts` + `.spec.ts`
- `apps/api/src/availability/availability.service.ts` (`buildMySeancesLayer`) + `.spec.ts`

**Modifiés — Shared**
- `packages/shared/src/index.ts` (`SeanceDto` +3 champs, `SetInfosPratiquesDto`, `MyCalendarSeanceEntry` +3 champs)

**Modifiés — Web**
- `core/scenarios/scenarios.service.ts`
- `features/scenarios/seance-list/seance-list.ts` / `.html` / `.spec.ts`
- `features/calendar/day-detail.utils.ts` + `.spec.ts`
- `features/calendar/calendar-agenda-view/calendar-agenda-view.ts` / `.html` / `.spec.ts`
- `features/calendar/calendar-view/calendar-view.ts` + `.spec.ts`
- `features/calendar/calendar-detail-rail/calendar-detail-rail.html` / `.scss` / `.spec.ts`
- `features/calendar/calendar-month-view/calendar-month-view.ts` / `.html` / `.scss` / `.spec.ts`

**Non touchés (à confirmer par `git status`)**
- `features/scenarios/scenario-timeline/**` · `constraint-panel/**` · `selection-bar/**` · `conflict-dialog/**` · `selection.utils.ts` · `calendar-week-view/**` · `party-signals.service.ts` · `getSeanceDerivedUnavailability()`

### References

- [Source: **sprint-change-proposal-2026-08-19.md**] — ⚠️ **l'amendement qui fait passer `D-15` d'un champ à trois**, ses six gardes, et la distinction heure-étiquette / heure-modèle. **À lire en premier.**
- [Source: epics.md — Story 36.5] — les cinq AC, verbatim, **dans leur version amendée du 2026-08-19**.
- [Source: epics.md:1921] — « **Serveur (D-15)** + front ».
- [Source: epics.md:1905 — carte de couverture] — « FR-50 | 36.2, 36.5 | Titre dans la bande, **puis les informations pratiques** ». Le titre, la préséance, la troncature et la garantie d'indisponibilité sont **acquis** ; il ne reste que les informations pratiques.
- [Source: epics.md:1934 — Convention de lecture du contrat d'UI] — le contrat décrit l'état d'arrivée de **l'épic**, pas de chaque story.
- [Source: prd.md:320-325 — FR-50] — « un **texte libre** rédigé par le MJ — où l'on joue, à quelle heure on se retrouve, quoi apporter. Ce n'est **pas** un modèle d'horaires » ; « **Écriture depuis la chronologie du scénario** […] **lecture** sur le créneau et dans l'Agenda ».
- [Source: prd.md:431 — D-15] — « Faible — un champ texte, un point d'écriture MJ, le champ ajouté aux DTO du calendrier. **Aucune notion de temps n'entre dans le modèle** ✅ actée ».
- [Source: addendum.md §5.7, **amendé**] — le motif structurel, désormais formulé en **six gardes opposables**, et le tableau heure-étiquette / heure-modèle. **C'est ce qu'il faut opposer à toute demande de calculer avec l'heure.**
- ⚠️ [Source: ARCHITECTURE-SPINE.md:11] — `binds: [FR-1 … FR-48]` : **aucune AD ne couvre FR-49 à FR-57**. La story relève des conventions, comme 36.1 l'avait déjà consigné.
- [Source: ARCHITECTURE-SPINE.md:119-127 — AD-9] — « aucune séance appartenant à une autre partie n'est jamais exposée en tant que telle […] La non-fuite est **structurelle** » → AC7.
- [Source: ARCHITECTURE-SPINE.md:187-194 — AD-18] — un endpoint unique pour le calendrier personnel → le champ s'ajoute au DTO, aucun appel neuf.
- [Source: ARCHITECTURE-SPINE.md:43] — « **Ce qui doit rester cohérent sur dix écrans passe par un point unique** » → AC10.
- [Source: ARCHITECTURE-SPINE.md:250] — valeurs dérivées jamais persistées ; ce champ est une **donnée saisie**, il se persiste légitimement.
- [Source: P1-AD-3] — `getOwned`/`getViewable`, seul point de vérité d'appartenance et de rôle → AC5.
- [Source: EXPERIENCE.md:259] — « s'affiche **tel quel et tronqué**, jamais reformaté : il n'existe ni champ d'heure, ni champ de lieu ».
- [Source: EXPERIENCE.md:248] — table de préséance, rang 1 : « la case […] porte le **titre** ; selon la place, le créneau et les informations pratiques ».
- [Source: EXPERIENCE.md:343] — Agenda, section « C'est programmé » : « Séances datées, **avec leurs informations pratiques** ».
- [Source: EXPERIENCE.md:578] — « Écrire les informations pratiques | Depuis la séance dans la chronologie | **MJ — jamais depuis le calendrier** ».
- [Source: EXPERIENCE.md:585] — « **Il n'en existe aucun** [écran de séance] : une séance n'a d'existence à l'écran qu'à l'intérieur de son scénario » → encadré n°2.
- [Source: DESIGN.md:319 — §7.9 CalendarCell] — « Titre en gras, puis **infos pratiques en `text-muted`** ».
- ⚠️ [Source: DESIGN.md:373 — §7.10 bis DetailRail] — « accessoires — lieu, heure, note — […] **repliés en premier quand la place manque** ». **Écart assumé par l'AC11** (encadré n°4).
- [Source: DESIGN.md:382] — « les **informations pratiques** (§ FR-50) **quand elles existeront** » — le conteneur est stable depuis 36.1.
- ⚠️ [Source: DESIGN.md §7] — **aucun composant de chronologie, de séance ni de champ de saisie n'est spécifié.** La surface d'écriture n'est dessinée nulle part — même situation que la barre de sélection (36.3) et le dialogue de conflit (36.4).
- [Source: mockups/contrat-ui-calendrier.html:263-264, **296, 299**] — rail : `<span class="m"> · chez Marc, 20 h 30</span>` ; et surtout la vue Semaine qui **séparait déjà lieu et heure sur deux lignes**, et montrait une séance n'ayant qu'un lieu (« en visio »). **Aucune régénération de la planche n'est nécessaire.**
- [Source: mockups/contrat-ui-calendrier.html:~310-315] — cellules de vue Semaine avec `.t` + `.s` → ⚠️ **story 36.13**, hors périmètre ici.
- [Source: mockups/contrat-ui-calendrier.html:272, :314, :711] — annotations « La séance est nommée dans sa bande avec ses informations pratiques » et « **Aucun champ d'heure n'entre dans le modèle** » ; table de couverture « Titre de séance + infos pratiques | Neuf | FR-50 · D-15 ».
- [Source: 36-1-le-rail-de-detail.md] — l'emplacement `.m` réservé et laissé vide ; les quatre champs **additifs** d'`AgendaEntry` ; `buildDayDetail()` comme point unique ; « le rail déplie ce qu'il a, ce n'est pas une consolation mobile ».
- [Source: 36-2-la-case-du-mois-trois-bandes-et-la-preseance.md] — `.sub` à accueillir ; `entries` **non filtré** par couche jusqu'à la projection ; le texte suit `winner` ; AC10 (« la vue mois sur téléphone ne dit à aucun moment moins qu'avant »).
- [Source: 36-4-resolution-de-conflits-sur-lecriture-groupee.md] — baselines, pièges de plateforme (**séparateur ` · ` ambigu**, accord grammatical dans les gabarits), et la leçon transversale : la vérification visuelle a trouvé des défauts sur **les quatre** stories. `/security-review` y est **en dette**.
- [Source: apps/api/src/scenarios/scenarios.service.ts:844-872] — `setCompteRendu`, **le patron entier**.
- [Source: apps/api/src/scenarios/scenarios.controller.ts:185-192] — la route à cloner.
- [Source: apps/api/src/parties/parties.service.ts:282-287] — `getOwned` : `NotFoundException` puis `ForbiddenException`.
- [Source: apps/api/src/availability/availability.service.ts:859-866, 987-1031] — le `findMany` charge déjà les scalaires ; `buildMySeancesLayer` à étendre.
- [Source: apps/web/src/app/features/scenarios/seance-list/seance-list.html:253-275 ; .ts:229-242] — le patron d'édition MJ.
- [Source: apps/web/src/app/features/calendar/day-detail.utils.ts:62-81, 135-212] — `DaySlotDetail` et `buildDayDetail`.
- [Source: apps/web/src/app/features/calendar/calendar-detail-rail/calendar-detail-rail.scss:80-84, 151-154] — `.m`, son commentaire, et le `display: none` mobile à lever.
- [Source: apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.scss:255-283] — la troncature de `.band__label` et le seuil de 712 px.
- [Source: deferred-work.md:9, :15, :21, :425] — la lacune de test AC7 à refermer ; les trois dettes aggravées ou voisines.
- [Source: docs/security.md:15, :30-40, :69-71] — XSS, validation, autorisation, `/security-review` obligatoire.
- [Source: CLAUDE.md ; docs/checklist.md] — convention SSE, évaluation obligatoire à chaque ajout ; tout par Docker.

---

## Décisions arbitrées avec l'utilisateur (2026-08-19)

*Les quatre points ouverts à la rédaction ont été tranchés **avant** implémentation. Ils ne sont plus discutables par le dev agent.*

| # | Point | Décision | Motif retenu |
| --- | --- | --- | --- |
| 0 | **Nombre de champs** | ✅ **Trois** : heure de rendez-vous, lieu, note libre | Widget de saisie pour l'heure, « rappel silencieux » du champ Lieu, et surtout un **ordre de repli** possible quand la place manque. ⚠️ **A exigé d'amender cinq documents** — voir `sprint-change-proposal-2026-08-19.md`. |
| 1 | Longueur maximale | ✅ **`lieu` 80, `notePratique` 200**, heure au format validé | Le contenu attendu fait ~35 caractères, il se rend tronqué sur une bande de 20 px, et il part avec **chaque** charge de calendrier. ⚠️ Écart assumé vs la convention de projet (5000). |
| 2 | Repli du rail en mobile | ✅ **Le rail NE replie PAS** les informations pratiques | Vérifié dans le code : la bande se tait sous 712 px **et** le rail sous 768 px — sur téléphone l'information serait invisible partout. Il les descend sur une seconde ligne. |
| 3 | Forme des champs de saisie | ✅ **Trois `<input>` mono-ligne**, dont un **`type="time"` natif** | Les trois porteurs sont `white-space: nowrap` : un `\n` ne peut structurellement pas se rendre. Le widget natif fournit sélecteur et validation de format gratuitement. ⚠️ Divergence assumée avec le `<textarea>` du compte rendu. |
| 4 | Séquencement | ✅ **La story 36.4 est soldée** (`done`, `/security-review` faite) | La 36.5 démarre sur une base stable. |

**Point non rouvert** — la **vue Semaine** reste hors périmètre (→ story 36.13) : elle n'affiche aujourd'hui aucun titre de séance, seulement une pastille.

### ⚠️ À répercuter hors story

**Fait le 2026-08-19** — la décision n°0 a été répercutée par `correct-course` : `prd.md` (FR-50 et D-15), `addendum.md` §5.7, `epics.md` (AC de la story et notes de l'épic) et `EXPERIENCE.md` §4.3 bis sont **amendés et cohérents**. Le contrat d'UI n'avait pas besoin d'être régénéré.

⚠️ **Reste ouvert : la décision n°2 modifie une planche validée.** `DESIGN.md:373` (§7.10 bis DetailRail) range les accessoires — lieu, heure, note — parmi ce qui est *« replié en premier quand la place manque »*. Cette story fait l'inverse en dessous de 768 px, avec son motif. **À passer par `bmad-ux`** — la story ne modifie aucun document de conception elle-même.

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story)

### Debug Log References

- `docker compose exec api pnpm test` — **59 suites, 1285 tests**, tous verts (baseline 59/1248, **+37**).
- `docker compose exec api pnpm typecheck` — **exit 0**.
- `docker compose exec api pnpm exec eslint src/availability` — **22 erreurs = baseline**.
- `docker compose exec web pnpm test` — **103 fichiers, 1748 tests**, tous verts (baseline 103/1714, **+34**).
- `docker compose exec web pnpm lint` — **143 erreurs = baseline**. Zéro erreur nouvelle.
- `docker compose exec web pnpm build` — échec sur le seul budget de bundle pré-existant : **1,39 Mo** (baseline 1,38).
- `pnpm prisma migrate dev --name seance_infos_pratiques` — migration **conforme à l'AC12**, trois lignes :
  `ALTER TABLE "Seance" ADD COLUMN "heureRdv" TEXT, ADD COLUMN "lieu" TEXT, ADD COLUMN "notePratique" TEXT;`

### Completion Notes List

**La garde a tenu, et elle est écrite partout où elle compte.** `heureRdv` est un `String?` en base, une chaîne validée `HH:MM` au DTO, transmise telle quelle par `toSeanceDto` et par `buildMySeancesLayer`, et jamais convertie nulle part. Trois tests la verrouillent explicitement — un côté service (`typeof === 'string'`, `not.toBeInstanceOf(Date)`), un côté `getMyCalendar`, et neuf cas de format invalide au DTO (`24:00`, `8h30`, `20:5`, `2:30`, `20:30:00`, …). C'était le risque n°1 de l'amendement de `D-15` ; il est refermé par des tests, pas par un commentaire.

**Le typecheck a attrapé ce que 1284 tests verts ne voyaient pas.** Après la migration, `pnpm test` passait intégralement alors que `scenarios.service.ts` référençait trois colonnes que le client Prisma ne connaissait pas encore. `pnpm typecheck` a levé `TS2353` ; `pnpm prisma generate` a réglé le cas. **C'est exactement le piège n°12 de la story** (`ts-jest` ne type-vérifie pas en cross-file), et il s'est produit.

**Le point unique a été respecté.** `composeSeanceInfo()` vit dans `day-detail.utils.ts` et sert **quatre** surfaces : la bande du Mois, le rail, l'agenda et la lecture joueur de `SeanceList`. Personne ne recompose de son côté, et l'ordre de repli n'existe qu'à un seul endroit (AC10).

**Les trois champs restent séparés jusqu'au rendu**, de `Seance` à `AgendaEntry` en passant par `MyCalendarSeanceEntry` et `DaySlotDetail`. C'est ce qui rend l'ordre de repli possible : une chaîne pré-composée l'aurait interdit.

**Les deux chemins d'alimentation sont câblés et testés séparément** (AC6) — branche partie (le `SeanceDto` complet était déjà en main, coût nul) et branche personnelle (enrichissement de `MyCalendarSeanceEntry` + `buildMySeancesLayer`, sans requête supplémentaire, un test le vérifie).

**Une dette de test a été refermée au passage.** `deferred-work.md:9` notait qu'aucun test ne construisait le cas « créneau dérivé d'une séance d'une autre partie, sans nom ni id exposé ». Le test existe maintenant, et il est plus fort que prévu : la séance tierce porte `heureRdv`/`lieu`/`notePratique`, et l'assertion vérifie que **rien** de tout cela n'apparaît dans l'objet sérialisé (AC7).

**✅ VÉRIFICATION VISUELLE RÉELLE FAITE**, sur l'application en marche. **Elle a trouvé trois défauts qu'aucun test ne voyait** — comme pour les quatre stories précédentes de l'épic.

| Défaut | Cause | Correction |
| --- | --- | --- |
| Dans la bande, l'accessoire se réduisait à **« 20… »** | La grille du Mois est **plafonnée à ~896 px** et **ne grandit pas avec la fenêtre** : la case fait ~115 px quoi qu'il arrive. « 20:30 · chez Marc » n'y tient pas | La bande demande désormais le niveau **`minimal`** — **l'heure seule**. C'est précisément ce à quoi sert l'ordre de repli |
| Puis l'heure elle-même se tronquait en **« 2… »** | `.band__label` en `flex: 1 1 auto` mangeait toute la place | `.band__sub` passe en `flex: 0 0 auto` : **l'heure est atomique** (« 2… » ne vaut rien), le titre prend l'ellipse — il reste lisible amputé |
| Une première tentative de correction posait un seuil de container query à **1120 px** | Seuil **inatteignable** : la grille plafonne à 896 px. L'accessoire n'aurait **jamais** paru | Seuil ramené à celui du titre (712 px), la tenue venant du niveau `minimal` et non d'un seuil |

| Vérifié à l'écran | Résultat |
| --- | --- |
| Rail, largeur bureau : titre puis « 20:30 · chez Marc · pensez aux dés » sur sa propre ligne (AC3) | ✅ |
| Bande du Mois : « La Route des L… **20:30** » — heure complète, titre ellipsé | ✅ |
| **AC11, largeur téléphone (500 px)** : bande muette, **rail toujours porteur** | ✅ `.band__sub` → `none`, `.m` du rail → `block` avec le texte entier |
| AC5 : un joueur ne voit aucun champ de saisie (dialogue de lecture du scénario) | ✅ |
| AC4 : une séance sans informations pratiques n'affiche ni ne réserve rien | ✅ |

⚠️ **L'AC11 est ce qui sauve la fonctionnalité sur téléphone, et la vérification l'a prouvé.** Si le rail avait suivi `DESIGN.md:373` (« accessoires repliés en premier »), la bande étant déjà muette sous 712 px, **les informations pratiques auraient été invisibles partout** sur un téléphone. L'encadré n°4 de la story avait vu juste.

**❌ NON VÉRIFIÉ À L'ŒIL — la saisie MJ.** Le compte connecté est **« Voyageur » sur ses quatre parties** : aucune n'ouvre `ScenarioEditor`, et je n'ai pas le droit de m'authentifier sous un autre compte. Les trois contrôles, le sélecteur d'heure natif et le bouton d'enregistrement ne sont donc **couverts que par des tests** (7 tests de `seance-list.spec.ts` : présence des trois contrôles, `input[type="time"]`, pré-remplissage, absence côté joueur, appel du service avec les trois valeurs, vidage à `null`, échappement). **À regarder avec un compte MJ avant de clore.**

**⚠️ Écriture directe en base de développement, à signaler.** Pour vérifier le chemin de LECTURE sans compte MJ, j'ai posé `heureRdv='20:30'`, `lieu='chez Marc'`, `notePratique='pensez aux dés'` sur la séance `e5273d97…` (Chapitre 2 : Le Sceau Brisé) via `psql`. **Les valeurs sont toujours en base** — elles servent de données de démonstration cohérentes. À retirer si elles gênent.

**Deux fichiers hors périmètre annoncé, tous deux par nécessité.** `scenario-read-dialog.spec.ts` et `scenario-timeline.spec.ts` : leurs fixtures `SeanceDto` ne compilaient plus, le type ayant gagné trois champs obligatoires. Cinq fixtures complétées mécaniquement, aucun test réécrit. Le choix de rendre les trois champs **obligatoires et à `null`** (plutôt qu'optionnels) est délibéré : le client n'a jamais à distinguer « clé absente » de « valeur vide ».

**Aucun `notifyPartieSignalsChanged` sur ce chemin**, contrairement à `setCompteRendu` : l'absence d'informations pratiques n'est pas un manquement et ne porte aucun signal (AC4).

**Évaluation SSE** — refaite, verdict inchangé : aucun câblage nouveau. `setInfosPratiques` émet `partieTopic` comme `setCompteRendu`, et `notifyChanged(result.partieId)` repropage côté client vers `ScenarioTimeline`, `SeanceList` et `CalendarView`. La dette sur `GET /me/calendar` reste héritée et non aggravée.

**❌ RESTE `/security-review`** — story « données + autorisation », déclenchée par l'utilisateur.

**Dette laissée ouverte, avec son motif** : `deferred-work.md:21` (`seance.findMany` sans borne de date inférieure) est **aggravée** par trois colonnes texte de plus par ligne chargée — à consigner. `deferred-work.md:8` et `:15` inchangées. Le TOCTOU `P2025` entre `findUnique` et `update` (`deferred-work.md:425`) est **reproduit** par cette story, qui clone `setCompteRendu` — cohérence avec l'existant préférée à un traitement isolé.

### File List

**Nouveaux — API**
- `apps/api/prisma/migrations/20260819175433_seance_infos_pratiques/migration.sql`
- `apps/api/src/scenarios/dto/set-infos-pratiques.dto.ts`
- `apps/api/src/scenarios/dto/set-infos-pratiques.dto.spec.ts` (21 tests)

**Modifiés — API**
- `apps/api/prisma/schema.prisma` (trois champs nullables sur `Seance`)
- `apps/api/src/scenarios/scenarios.service.ts` (`setInfosPratiques`, `SetInfosPratiquesPayload`, `toSeanceDto`)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (bloc `setInfosPratiques`, fixture `addSeance` complétée)
- `apps/api/src/scenarios/scenarios.controller.ts` (`PATCH /scenarios/seances/:id/infos-pratiques`)
- `apps/api/src/scenarios/scenarios.controller.spec.ts`
- `apps/api/src/availability/availability.service.ts` (`buildMySeancesLayer`)
- `apps/api/src/availability/availability.service.spec.ts` (dont le test AC7 de non-fuite)

**Modifiés — Shared**
- `packages/shared/src/index.ts` (`SeanceDto`, `SetInfosPratiquesDto`, `MyCalendarSeanceEntry`)

**Modifiés — Web**
- `apps/web/src/app/core/scenarios/scenarios.service.ts`
- `apps/web/src/app/features/calendar/day-detail.utils.ts` (+ `.spec.ts`) — `composeSeanceInfo`, `InfoDensity`, `SeanceInfoParts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` (les deux branches)
- `apps/web/src/app/features/calendar/calendar-agenda-view/` (`.ts` / `.html` / `.spec.ts`)
- `apps/web/src/app/features/calendar/calendar-detail-rail/` (`.ts` / `.html` / `.scss` / `.spec.ts`)
- `apps/web/src/app/features/calendar/calendar-month-view/` (`.ts` / `.html` / `.scss` / `.spec.ts`)
- `apps/web/src/app/features/scenarios/seance-list/` (`.ts` / `.html` / `.scss` / `.spec.ts`)
- ⚠️ `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` — fixture seule
- ⚠️ `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` — fixtures seules

**Non touchés (confirmé par `git status`)**
- `scenario-timeline.ts` · `constraint-panel/**` · `selection-bar/**` · `conflict-dialog/**` · `selection.utils.ts` · `calendar-week-view/**` · `party-signals.service.ts` · `getSeanceDerivedUnavailability()` · `apps/web/src/styles.scss`

### Change Log

- 2026-08-19 — **Implémentation complète (Tasks 1 à 9, bmad-dev-story). Statut → review.** `D-15` livrée dans sa forme amendée : **trois champs** sur `Seance` — `heureRdv`, `lieu`, `notePratique` — tous nullables, migration en trois `ADD COLUMN ... TEXT` conforme à l'AC12. **LA GARDE CENTRALE TIENT ET EST TESTÉE** : `heureRdv` est un `String?`, validé `HH:MM` au DTO (neuf cas invalides couverts), transmis tel quel par `toSeanceDto` et `buildMySeancesLayer`, et **jamais converti** — trois tests l'affirment explicitement, dont un `not.toBeInstanceOf(Date)`. **LE TYPECHECK A ATTRAPÉ CE QUE 1284 TESTS VERTS NE VOYAIENT PAS** : le client Prisma n'était pas régénéré, `ts-jest` ne type-vérifiant pas en cross-file — c'est le piège n°12 de la story, survenu tel quel. **UN SEUL POINT DE COMPOSITION** : `composeSeanceInfo()` sert la bande, le rail, l'agenda et la lecture joueur, et porte seul l'ordre de repli (AC10). Les trois champs restent **séparés jusqu'au rendu**, sans quoi ce repli serait impossible. **LES DEUX CHEMINS D'ALIMENTATION** sont câblés et testés séparément (AC6). **DETTE REFERMÉE** : `deferred-work.md:9` — le test de non-fuite d'une séance tierce existe désormais, et il est plus fort que prévu (la séance porte les trois champs, l'assertion vérifie que rien n'en sort, AC7). ✅ **VÉRIFICATION VISUELLE RÉELLE FAITE — TROIS DÉFAUTS TROUVÉS, tous corrigés** : (1) dans la bande, l'accessoire se réduisait à « 20… », la grille du Mois étant **plafonnée à ~896 px et ne grandissant pas avec la fenêtre** — la bande demande désormais le niveau **`minimal`**, l'heure seule ; (2) l'heure se tronquait ensuite en « 2… », le titre mangeant la place — `.band__sub` passe en `flex: 0 0 auto`, **l'heure est atomique**, le titre prend l'ellipse ; (3) une première correction posait un seuil de container query à 1120 px, **inatteignable** — ramené à 712 px. **AC11 VÉRIFIÉ À L'ÉCRAN EN LARGEUR TÉLÉPHONE** : bande muette, rail toujours porteur du texte complet — sans l'écart assumé à `DESIGN.md:373`, les informations auraient été **invisibles partout** sur téléphone, ce que l'encadré n°4 avait prévu. **API 59 suites / 1285 tests** (baseline 1248, +37), typecheck 0, lint `src/availability` 22 = baseline. **Web 103 fichiers / 1748 tests** (baseline 1714, +34), lint 143 = baseline, build en échec sur le seul budget de bundle pré-existant. ❌ **NON VÉRIFIÉ À L'ŒIL : la saisie MJ** — le compte connecté est « Voyageur » sur ses quatre parties et je ne peux pas m'authentifier autrement ; les trois contrôles et le sélecteur d'heure natif ne sont couverts que par 7 tests. ⚠️ **Écriture directe en base de développement signalée** : valeurs de démonstration posées via `psql` sur la séance du 3 septembre pour vérifier le chemin de lecture, **toujours présentes**. ❌ **RESTE `/security-review`.**
- 2026-08-19 — Story amendée (correct-course) : `D-15` passe d'un champ à trois. Voir `sprint-change-proposal-2026-08-19.md`.
- 2026-08-19 — Story créée (bmad-create-story), trois sous-agents d'exploration.
