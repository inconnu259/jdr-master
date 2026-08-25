---
baseline_commit: cad1d0eb81c942faa74221fd4ed709e20803df7b
---

# Story 36.6 : La piste de participation d'un vote

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · **Serveur (D-17) + front** · **aucune migration** · porte **FR-51** (avec la 36.7) [Source: epics.md:1906, epics.md:1922]

> **Ordre rétabli.** La 36.13 a été prise hors ordre avant celle-ci, précisément pour lui livrer une vue Semaine capable de porter un vote. C'est fait (`cad1d0e`) : `CalendarWeekView` reçoit désormais `entries` et `activeLayers` et nomme déjà « Vote » au créneau. **L'AC4 n'a plus de raison d'être reporté.**

---

## Story

As a **membre d'une partie**,
I want **voir combien de personnes ont répondu sur un créneau, et pas seulement leur avis**,
so that **je distingue un créneau plébiscité d'un créneau voté par une seule personne**.

---

## 🚨 Encadré n°1 — Le trou structurel : une entrée de vote par SONDAGE, jamais par option

C'est le point le plus important de la story, et il n'est écrit nulle part.

`allCalendarEntries()` produit **une seule** `AgendaEntry` de type `votes-en-cours` par sondage, datée sur sa **première option seulement** — dans les deux contextes :

```ts
// calendar-view.ts:316-325 (contexte de partie)
for (const entry of this.activePolls()) {
  const firstOption = [...entry.poll.options].sort((a, b) => a.date.localeCompare(b.date))[0];
  entries.push({ key: `poll-${entry.poll.id}`, type: 'votes-en-cours',
                 date: firstOption ? firstOption.date.substring(0, 10) : '',
                 detail: `${entry.poll.options.length} option(s) proposée(s)`, slot: firstOption?.slot });
}
// calendar-view.ts:372-380 (calendrier personnel) — même forme depuis mc['votes-en-cours']
```

**Conséquence, vérifiable à l'écran aujourd'hui :** un vote proposant vendredi 28 **et** samedi 29 ne marque **que le 28**. Le 29 est muet en vue Mois, en vue Semaine et dans le rail — `buildDayDetail()` ne peut voir que ce que les entrées portent.

C'est un **défaut pré-existant**, que cette story n'a pas créé mais **doit corriger** : l'AC1 parle d'« un créneau proposé au vote », donc d'une piste **par option**, pas par sondage. Sans éclatement par option, il n'existe aucune surface où poser la piste.

⚠️ **Décision arrêtée (voir « Décisions arrêtées ») : une `AgendaEntry` par OPTION.** Elle change la forme de la vue Agenda, qui affichera désormais une ligne par créneau proposé au lieu d'une ligne par vote. C'est conforme à la lettre de l'AC4 (« un compteur dans l'agenda ») et **divergent de la planche** (`contrat-ui-calendrier.html:331` groupe les options en une ligne « 28 ou 29 août ») — divergence assumée, la 36.11 refond l'Agenda de toute façon.

Consommateurs à revérifier après l'éclatement : `agendaEntries()`, `calendarEntries()`, `nextMeaningfulDate()` (`day-detail.utils.ts`), `seanceMarkerDates()` (indifférent : filtre `mes-seances`), et les tests de `calendar-view.spec.ts` qui comptent les entrées.

---

## 🚨 Encadré n°2 — L'effectif de la troupe : deux définitions incompatibles vivent déjà dans le code

Le dénominateur du « 3 / 4 » n'était pas défini. **Trois faits, tous vérifiés dans le code :**

| Source | Ce qu'elle compte | Où |
| --- | --- | --- |
| `resolveParticipants()` → `AggregatedSlotDto.total` | **MJ + membres** | `parties.service.ts:857-882`, `:1093` |
| `GET /parties/:id/members` → `members()` du calendrier | **membres seuls, sans le MJ** | `parties.service.ts:325-344` (« le MJ n'étant jamais un `Membership` », `:302`) |
| `castVote()` | garde `getViewable` ⇒ **le MJ peut voter** | `poll.service.ts:96` |

Deux nombres différents pour « la troupe », sur le même écran, et un MJ qui vote pouvait produire « 5 / 4 ».

> ⚠️ **Tranché par l'utilisateur le 2026-08-20 : l'effectif est MJ + membres.** Motif : c'est la définition qu'emploie déjà la jauge de disponibilité du groupe rendue sur **la même case** (36.8), et le MJ vote réellement.
> **Conséquence à consigner, PAS à corriger ici :** `getMissingVoters()` / `poll-status` continuent d'ignorer le MJ dans leur liste des « manquants ». La divergence subsiste, elle est désormais **écrite**. → `deferred-work.md`.

🚨 **Le piège qui bloque la factorisation évidente.** `AvailabilityService` **ne peut pas injecter `PartiesService`** : `AvailabilityModule` exporte `AvailabilityService` et est consommé **par** `PartiesModule` (`availability.module.ts:10`) — l'inverse créerait un cycle de modules Nest.

**Solution imposée :** une **fonction pure** partagée, sans DI, importée des deux côtés. Une seule formule, jamais deux.

```ts
// apps/api/src/parties/participant-count.util.ts (nouveau)
/** L'effectif d'une partie = le MJ + ses Membership. Le MJ n'a JAMAIS de ligne Membership
 *  (parties.service.ts:302) et il peut voter (castVote passe par getViewable) : il compte.
 *  Même définition que `resolveParticipants()` / `AggregatedSlotDto.total`. Fonction pure —
 *  AvailabilityService ne peut pas injecter PartiesService (cycle de modules). */
export function participantCount(membershipCount: number): number { return membershipCount + 1; }
```

---

## 🚨 Encadré n°3 — Le contexte de partie a déjà tout, sauf le dénominateur

`AD-20` interdit tout calcul serveur par lecteur sur les écrans qui détiennent la charge utile — et le calendrier de partie la détient : `PollOptionDto.votes` porte `userId`, `pseudo`, `displayName` et `answer` de **tous** les votants, sans filtrage (`shared/index.ts:684-700`).

Donc, en contexte de partie : **les compteurs oui / peut-être / non ET ma propre réponse se dérivent côté client**, d'`activePolls()`, sans un seul appel réseau. **Le seul manque est le dénominateur** — `members()` n'est chargé que si `isMjMode` (`calendar-view.ts:563-565`), un joueur n'a donc aucun effectif en mémoire.

> **Arbitrage déjà rendu (2026-08-20), à reprendre tel quel : ajouter `membersCount` à `SessionPollDto`.**
> Zéro appel supplémentaire, agrégat anonyme conforme à AD-9/AD-2. **Écart assumé** vis-à-vis de la lettre de D-17 (« sans objet en contexte de partie ») — à signaler par ⚠️ dans le Change Log.
> Options **rejetées** : charger `members()` pour les joueurs (= appel réseau de plus, contraire à l'AC7) ; dériver l'effectif des votants connus (**faux par construction** — la portion tramée serait toujours vide, exactement le défaut que `DESIGN.md:333` dit d'avoir corrigé).

🚨 **Deux `toSessionPollDto` existent, et ils DIVERGENT DÉJÀ.** `poll.service.ts:228-249` renvoie `displayName` ; `scenarios.service.ts:1058-1077` **ne le renvoie pas**, alors que `PollVoteDto.displayName` est requis. Les deux doivent porter `membersCount`. *(Ne pas corriger `displayName` au passage : hors périmètre — le consigner.)*

🚨 **Piège de typage, décisif.** Dans les deux fonctions, `poll` est typé `any` : `options: (poll.options ?? []).map(...)` produit un `any[]` que TypeScript **ne vérifie pas**. Un champ ajouté **à l'intérieur des options** ne serait attrapé par aucun compilateur. À la **racine** du littéral, en revanche, il l'est (le retour est typé `SessionPollDto`).
⇒ **`membersCount` va à la RACINE de `SessionPollDto`**, jamais dans `PollOptionDto`. Et : `pnpm typecheck` côté API est **obligatoire** — `ts-jest` ne type-check pas cross-file (`isolatedModules`).

---

## 🚨 Encadré n°4 — Le serveur : les cinq lignes exactes à toucher, et rien de plus

Le calendrier **personnel** n'a rien : `MyCalendarPollEntry.options` ne porte que `{ date, slot }` — **pas même d'`optionId`**, sans lequel ni ma réponse ni un agrégat par créneau ne sont adressables (et sans lequel la 36.7 ne pourra pas voter depuis cet écran).

| Point | Fichier:ligne | Ce qu'il faut y faire |
| --- | --- | --- |
| Le DTO | `packages/shared/src/index.ts:637-643` | `optionId` + agrégats + `myAnswer` sur chaque option |
| L'`include` des sondages | `availability.service.ts:866-870` | `include: { options: { include: { votes: true } } }` — `votes` seul, **jamais** `include: { user: … }` : aucune identité n'a à sortir ici (AD-9) |
| La projection | `availability.service.ts:1042-1071` (`buildOpenPollsLayer`) | compter oui/peut-être/non, isoler ma réponse, porter l'effectif |
| L'effectif | `availability.service.ts:853` (`Promise.all` existant) | **un `membership.groupBy({ by: ['partieId'], where: { partieId: { in: partieIds } } })` ajouté DANS ce `Promise.all`** — jamais un `count` par partie en boucle (AD-3) |
| L'assemblage | `availability.service.ts:897-902` | passer la carte d'effectifs et `userId` à `buildOpenPollsLayer` |

🚨 **`getMyCalendar` prend déjà `userId`** (`:827`) mais `buildOpenPollsLayer` **ne le reçoit pas** : il faut le lui passer pour calculer `myAnswer`.

---

## 🚨 Encadré n°5 — Les tests verrouillants de l'API : ce qui casse, ce qui doit survivre

Trois assertions se ferment sur la forme actuelle. **Le diagnostic précédent était incomplet** — voici l'état vérifié :

1. **`availability.service.spec.ts:1781` — `toEqual` exact sur les 5 couches.** Ses assertions restent valides (aucune clé de couche ajoutée), **mais le test cassera quand même** : le faux Prisma (`:106-128`) n'a **pas** de `membership.groupBy`, et l'appel lèvera. ⇒ **étendre la fabrique de mocks**, pas l'assertion.
2. **`availability.service.spec.ts:2060-2088` — `toEqual` exact sur `MyCalendarPollEntry`.** Casse **réellement** : la forme des options change. **À étendre sciemment**, en écrivant la forme complète attendue.
3. **`availability.service.spec.ts:2232-2241` — la garde anti-N+1 (« une seule requête par table »).** 🚨 **Celle-ci doit être PRÉSERVÉE et RENFORCÉE** : lui ajouter `expect(mockMembershipGroupBy).toHaveBeenCalledTimes(1)`. C'est le seul garde-fou contre une régression AD-3 sur cet endpoint.

Côté **front**, rendre `membersCount` **requis** fera échouer la compilation de toutes les fixtures de `SessionPollDto`. **C'est voulu** : un effectif absent rendrait une piste au dénominateur indéfini, silencieusement. Fichiers à vérifier — `open-polls.service.spec.ts`, `poll.util.spec.ts`, `dashboard.spec.ts`, `partie-detail.spec.ts`, `poll-response.spec.ts`, `poll-status.spec.ts`, `poll-creation.spec.ts`, `seance-list.spec.ts`, `scenario-read-dialog.spec.ts`, `calendar-view.spec.ts`.

---

## 🚨 Encadré n°6 — La forme, au pixel, et la densité par CSS seul

`contrat-ui-calendrier.html:112-120` donne la piste **entièrement** :

```css
.track{height:4px;border-radius:2px;overflow:hidden;width:52px;flex:0 0 52px;margin-left:auto;display:flex;
  background:repeating-linear-gradient(45deg,transparent 0 2px,rgba(127,140,141,.8) 2px 4px)}
.track.sm{width:40px;flex:0 0 40px}   .track.lg{width:70px;flex:0 0 70px}
.track i{display:block;height:100%}
.track .y{background:var(--color-available)}.track .m{background:var(--jdr-status-todo)}.track .n{background:var(--color-unavailable)}
.cnt{font-size:9.5px;color:var(--jdr-text-muted);margin-left:5px}
.mine{font-size:9px;color:var(--jdr-accent-1);margin-left:5px}
```

- **La trame EST le fond de la piste**, pas un quatrième segment : elle apparaît là où les segments ne couvrent pas. Aucun élément « non répondu » à émettre.
- **Les largeurs sont en % de l'effectif TOTAL**, jamais des répondants (`contrat-ui-calendrier.html:761-764`, `DESIGN.md:329-333`). C'est **tout le sujet de la story** : « 1 oui sur 4 » et « 4 oui sur 4 » doivent différer (AC3).
- **Où la piste apparaît, et à quelle taille :**

| Surface | Piste | Compteur « 3 / 4 » | Ma réponse |
| --- | --- | --- | --- |
| Case du Mois, **large** (`@container month-grid (min-width: 712px)`) | `.track` 52 px | **non** | `.mine` « oui » |
| Case du Mois, **étroite** | **non** | non | non — le rail porte tout (36.1) |
| Cellule de Semaine, **large** (`@container week-grid (min-width: 500px)`) | `.track.lg` 70 px | **oui** | oui |
| Cellule de Semaine, **étroite** | `.track.sm` 40 px | non | non |
| Rail de détail (**toutes largeurs**) | `.track.lg` | **oui** | **oui, en toutes lettres** |
| Agenda | `.track.sm` en ligne | **oui** | oui |

🚨 **La bascule de densité est faite par CSS seul**, en réutilisant les deux `@container` **déjà en place** (`calendar-month-view.scss:288`, `calendar-week-view.scss`). **Aucun `@if` de largeur, aucun `ResizeObserver`, aucun `BreakpointObserver`** — même contrainte structurelle que 36.2 et 36.13, et même bénéfice : rien à tester en TS sur la bascule.

---

## 🚨 Encadré n°7 — Le marquage de la cellule de Semaine (inclus sur décision utilisateur)

`deferred-work.md:5` : depuis la 36.13, `.slot-cell` **nomme** l'événement mais son fond ne porte **aucun signe de rang** — ni liseré de vote ni filet de séance, alors que le contrat prévoit `.wk .cell.se` et `.cell.vo` (`contrat-ui-calendrier.html:156-159`) et que la doctrine **P-1** veut qu'une information ne repose jamais sur le seul texte.

> **Tranché par l'utilisateur le 2026-08-20 : inclus dans cette story.** Motif : poser une piste de participation sur une cellule qui ne se signale pas comme portant un vote reproduirait exactement le défaut P-1 que la piste est censée corriger.

**Comment, sans inventer de convention :** la case du Mois expose déjà le rang par `[attr.data-winner]` sur `.band` (`calendar-month-view.html:118`, `.scss:199-244`). **Reprendre le même attribut** sur `.slot-cell` — jamais un second schéma de classes.

---

## 🚨 Encadré n°8 — Le vote masqué par une séance : ne pas l'aggraver

`deferred-work.md:7` : la chaîne `@if / @else if` du rail est mutuellement exclusive — un créneau portant **à la fois** une séance confirmée et un vote concurrent ne rend que la séance. Même structure de rang gagnant en Mois (`text` suit `winner`) et, depuis la 36.13, en Semaine (`eventTitle()`).

**Règle de cette story, à ne pas déborder : la piste suit le rang `'vote'`**, exactement comme le texte. Un créneau dont le rang gagnant est `'seance'` ne porte **pas** de piste. C'est cohérent avec tout l'existant, ça n'aggrave rien — et le cas reste ouvert dans `deferred-work.md`, hors périmètre.

---

## Acceptance Criteria

Les sept premiers sont ceux d'`epics.md` (Story 36.6), **verbatim**. Les suivants sont ajoutés par cette story et portent leur motif.

**AC1 — La piste entière représente la troupe**
**Given** un créneau proposé au vote
**When** sa piste est rendue
**Then** la piste **entière représente l'effectif de la troupe**
**And** la portion remplie dit combien ont répondu

**AC2 — Les couleurs disent quoi, la trame dit ce qui manque**
**Given** les réponses données
**When** la piste est remplie
**Then** les couleurs distinguent oui, peut-être et non
**And** la portion restante porte la trame « personne ne s'est prononcé »

**AC3 — Un plébiscite ne se lit pas comme une voix isolée**
**Given** un créneau où une seule personne sur quatre a répondu oui
**When** on le compare à un créneau où les quatre ont répondu oui
**Then** les deux pistes **diffèrent visiblement**
*Motif : c'est le défaut nommé par `DESIGN.md:333`. Un test doit comparer les deux largeurs, pas seulement vérifier qu'une piste existe.*

**AC4 — Le compteur double la forme là où il y a la place**
**Given** la place disponible
**When** la piste est rendue en vue semaine, dans le rail ou dans l'agenda
**Then** un compteur « 3 / 4 » double la forme
**And** il est abandonné en vue mois étroite

**AC5 — Ma réponse est écrite, jamais seulement colorée**
**Given** j'ai répondu sur un créneau
**When** il s'affiche
**Then** ma réponse est rappelée **en toutes lettres**, jamais par la seule couleur

**AC6 — Le calendrier personnel : l'appel unique suffit**
**Given** le calendrier personnel
**When** il charge les votes en cours
**Then** l'appel unique existant renvoie désormais les compteurs et ma réponse
**And** aucun appel supplémentaire n'est émis

**AC7 — Le calendrier de partie : tout est déjà là**
**Given** le calendrier d'une partie
**When** il affiche la même lecture
**Then** il la dérive des signaux déjà chargés
**And** n'émet aucun appel réseau supplémentaire

**AC8 — Une piste par CRÉNEAU proposé, pas une par vote**
**Given** un vote proposant plusieurs créneaux
**When** le calendrier est rendu
**Then** **chacun** de ces créneaux porte sa propre piste, dans sa propre case
**And** aucun créneau proposé n'est muet
*Motif : encadré n°1 — aujourd'hui seule la première option d'un vote est marquée. Sans cet AC, la story livrerait une piste correcte sur un créneau et rien sur les autres.*

**AC9 — L'effectif est celui du reste du calendrier**
**Given** une partie dont le MJ et trois joueurs forment la troupe
**When** la piste et la jauge de disponibilité du groupe sont rendues sur la même case
**Then** elles emploient le **même effectif : 4**
**And** un MJ qui a voté ne produit jamais « 5 / 4 »
*Motif : encadré n°2. Deux définitions coexistaient ; celle-ci est désormais la seule.*

**AC10 — Un seul point de dérivation, une seule formule d'effectif**
**Given** les deux contextes (partie et personnel) et les deux couches serveur
**When** l'effectif ou les compteurs sont calculés
**Then** ils passent par **une fonction unique** — `participantCount()` côté serveur, un utilitaire pur côté front pour les proportions
**And** **aucune règle de préséance, aucune projection d'`AgendaEntry` n'est réécrite** dans une vue

**AC11 — Aucune identité ne fuit par le calendrier personnel**
**Given** la couche `votes-en-cours` de `GET /me/calendar`
**When** elle est sérialisée
**Then** elle ne porte **que des agrégats anonymes** et **ma seule** réponse
**And** ni `userId`, ni `pseudo`, ni `displayName` d'un autre votant n'y apparaissent
*Motif : AD-9 / AD-2. L'`include` des votes est le point où une identité entrerait sans que rien ne le signale.*

**AC12 — La garde anti-N+1 tient**
**Given** un utilisateur membre de N parties
**When** `GET /me/calendar` répond
**Then** l'effectif est obtenu par **une seule** requête groupée, quel que soit N
**And** le test `availability.service.spec.ts:2232` est **étendu**, jamais affaibli

**AC13 — La cellule de Semaine se signale, elle ne se contente pas de se nommer**
**Given** une cellule de Semaine portant un vote ou une séance
**When** elle est rendue
**Then** son fond porte le signe de rang du contrat d'UI — liseré pour le vote, filet pour la séance
**And** il emploie `[attr.data-winner]`, la convention déjà posée par la case du Mois

**AC14 — Le nom accessible dit la participation**
**Given** un créneau portant une piste, à n'importe quelle largeur
**When** un lecteur d'écran l'annonce
**Then** il dit **le nombre de répondants sur l'effectif** et **ma réponse**, en toutes lettres
**And** ce que le CSS masque n'est **jamais** absent du nom accessible
*Motif : la piste est une information **par la proportion** — donc invisible à un lecteur d'écran si elle n'est pas doublée par du texte. `DESIGN.md:335` dit d'ailleurs qu'« elle demande la légende ».*

---

## Tasks / Subtasks

### 1. Serveur — l'effectif, défini une fois (AC1, AC9, AC10)
- [x] Créer `apps/api/src/parties/participant-count.util.ts` : `participantCount(membershipCount) = membershipCount + 1`, avec le commentaire de l'encadré n°2 (MJ jamais `Membership`, MJ vote, cycle de modules interdisant l'injection).
- [x] Spec dédiée `participant-count.util.spec.ts` : la formule, et un test d'accord avec `resolveParticipants()` si praticable.
- [x] **Ne pas** modifier `resolveParticipants()` ni `listMembers()`.

### 2. Serveur — `SessionPollDto.membersCount` (AC7, AC9)
- [x] Ajouter `membersCount: number` **à la racine** de `SessionPollDto` (`packages/shared/src/index.ts:673`), **requis**, avec le commentaire disant pourquoi il n'est pas dans `PollOptionDto` (encadré n°3, piège `any`).
- [x] Le renseigner dans **les deux** `toSessionPollDto` : `poll.service.ts:228` et `scenarios.service.ts:1058`.
- [x] Le faire descendre jusqu'à `toSeanceDto` / `loadSeancesBatch` (`scenarios.service.ts:1088`, `:1140`) — **un seul comptage par appel**, jamais un par séance ni par sondage (AD-3). `ScenariosService` injecte déjà `PartiesService` (`:42`) : y ajouter la méthode de comptage si c'est le chemin le plus court.
- [x] Mettre à jour les fixtures des specs API concernées.

### 3. Serveur — la couche `votes-en-cours` de `GET /me/calendar` (AC6, AC11, AC12)
- [x] Étendre `MyCalendarPollEntry` (`shared/index.ts:637-643`) : `membersCount` à la racine de l'entrée, et par option `optionId`, `yes`, `maybe`, `no`, `myAnswer: VoteAnswer | null`.
- [x] `availability.service.ts:866-870` — `include: { options: { include: { votes: true } } }`. 🚨 **`votes` seul, jamais `include: { user: … }`** (AC11).
- [x] `availability.service.ts:853` — ajouter le `membership.groupBy({ by: ['partieId'], where: { partieId: { in: partieIds } }, _count: true })` **dans le `Promise.all` existant**. Garder la garde `partieIds.length === 0`.
- [x] `buildOpenPollsLayer` (`:1042-1071`) — recevoir `userId` et la carte d'effectifs, compter par option, isoler `myAnswer`, appliquer `participantCount()`.
- [x] Vérifier que le filtre de plage `inRange` reste **au niveau du sondage** (comportement actuel) ou passer au niveau option — **trancher et commenter**.

### 4. Front — une entrée par OPTION (AC8, AC10)
- [x] Étendre `AgendaEntry` (`calendar-agenda-view.ts:18-43`) de champs de vote **séparés** (`pollId`, `optionId`, `voteYes`, `voteMaybe`, `voteNo`, `voteTotal`, `myAnswer`). ⚠️ **Ne jamais les verser dans `detail`**, qui porte déjà trois usages.
- [x] `calendar-view.ts:316-325` (partie) — émettre **une entrée par option** du poll, avec sa date, son slot, ses compteurs dérivés de `PollOptionDto.votes` et `membersCount` du poll. Clé stable : `poll-${pollId}-${optionId}`.
- [x] `calendar-view.ts:372-380` (personnel) — même chose depuis `mc['votes-en-cours']`, en lisant les agrégats servis.
- [x] `myAnswer` en contexte de partie : dérivé de `votes.find(v => v.userId === moi)` (`AD-20` — la charge utile est là ; aucun appel).
- [x] Un **utilitaire pur** unique pour les proportions et le libellé de réponse (`day-detail.utils.ts` ou un `poll-track.utils.ts` frère), testé sans TestBed — patron `selection.utils.ts` / `day-detail.utils.ts`.
- [x] Porter les champs de vote jusqu'à `DaySlotDetail` dans `buildDayDetail()` (`day-detail.utils.ts`), gouvernés par `winner === 'vote'` **et** par la couche `votes-en-cours`, exactement comme `pollLabel` aujourd'hui.

### 5. Front — la piste dans les quatre surfaces (AC1 à AC5, AC13, AC14)
- [x] **Composant de rendu partagé** de la piste (SVG ou `<span>` à segments) — un seul, consommé par le Mois, la Semaine, le rail et l'Agenda. Styles repris **au pixel** de `contrat-ui-calendrier.html:112-120`.
- [x] Case du Mois : piste dans la bande, révélée par le `@container month-grid (min-width: 712px)` **existant** (`calendar-month-view.scss:288`). **Aucun compteur** (AC4).
- [x] Cellule de Semaine : piste + compteur, révélés par le `@container week-grid (min-width: 500px)` **existant**. Sous le seuil : `.track.sm`, sans compteur. 🚨 **Tout nœud ajouté reste descendant de `.slot-cell` et porte `pointer-events: none`** — sinon le glissement casse **et les tests restent verts** (36.13, encadré n°3).
- [x] Rail : piste `.lg` + compteur + **ma réponse en toutes lettres** (« tu as dit oui »), à toutes les largeurs.
- [x] Agenda : piste en ligne + compteur.
- [x] **AC13** — `[attr.data-winner]` sur `.slot-cell` + règles `.se` / `.vo` de `contrat-ui-calendrier.html:156-159`.
- [x] **AC14** — étendre `cellAriaLabel()` (Semaine), `bandAriaLabel()` (Mois) et le rail pour annoncer « 3 réponses sur 4 » et ma réponse.

### 6. Tests — API
- [x] Étendre la fabrique de mocks Prisma (`availability.service.spec.ts:106-128`) d'un `membership: { groupBy }` — sinon **tous** les tests de `getMyCalendar` lèvent (encadré n°5.1).
- [x] Réécrire sciemment l'assertion `toEqual` de la couche `votes-en-cours` (`:2060-2088`).
- [x] **Renforcer** la garde anti-N+1 (`:2232-2241`) d'un `expect(mockMembershipGroupBy).toHaveBeenCalledTimes(1)` (AC12).
- [x] **Test de non-fuite (AC11)** : un vote avec deux votants ⇒ la charge utile ne contient **aucun** `userId`/`pseudo`/`displayName` autre que le mien. *(Comble aussi le trou de couverture `deferred-work.md:22`.)*
- [x] Effectif : une partie MJ + 3 membres ⇒ `membersCount === 4` (AC9).
- [x] `membersCount` présent sur `SessionPollDto` par **les deux** chemins (`poll.service` et `scenarios.service`).

### 7. Tests — Web
- [x] `poll-track.utils` : proportions en % de l'effectif **total** ; **le test d'AC3 compare 1/4-oui et 4/4-oui et exige des largeurs différentes**.
- [x] Effectif 0 et sondage sans aucune réponse ⇒ piste entièrement tramée, **jamais** de division par zéro ni de `NaN%`.
- [x] `allCalendarEntries()` : un vote à deux options ⇒ **deux** entrées, sur **deux** dates (AC8).
- [x] Compteur présent en Semaine / rail / Agenda, **absent** de la case du Mois (AC4) — l'assertion porte sur la **présence du nœud**, jsdom n'évalue pas les container queries.
- [x] Couche `votes-en-cours` éteinte ⇒ la piste disparaît, comme le libellé (règle de la 36.2, revue du 2026-08-18).
- [x] Rang `'seance'` gagnant ⇒ **aucune** piste (encadré n°8).
- [x] `data-winner` sur `.slot-cell` pour vote et séance (AC13).
- [x] Noms accessibles (AC14), non tronqués.
- [x] Aucun `HttpClient` réclamé par les vues (AC7).
- [x] Zoneless : boucle de ticks établie du projet (`for (let i=0;i<10;i++){ await Promise.resolve(); fixture.detectChanges(); }`) — `whenStable()` seul ne suffit pas. Attention à `vi.useFakeTimers()` déjà présent dans les blocs de sélection.
- [x] Le test de non-régression du glissement de la 36.13 (`title.closest('[data-cell-date]') === cell`) doit être **étendu au nœud de piste**.

### 8. Vérification
- [x] **Mesurer la baseline AVANT tout changement**, working tree propre, `HEAD = cad1d0e`. Chiffres attendus — **API 59 suites / 1285 tests**, **web 103 fichiers / 1758 tests**, lint web **143**, `eslint src/availability` **22**, build en échec sur le seul budget de bundle pré-existant (~1,39 Mo). **Reconfirmer, ne pas recopier.**
- [x] API : `pnpm test`, `pnpm lint`, **`pnpm typecheck` obligatoire** (`ts-jest` ne type-check pas cross-file).
- [x] Web : `pnpm test`, `pnpm lint` = baseline.
- [x] ✅ **VÉRIFICATION VISUELLE RÉELLE OBLIGATOIRE.** Les stories 36.4, 36.5 et 36.13 ont **chacune** trouvé par ce seul moyen des défauts invisibles aux tests. À regarder :
  - un vote à **deux options ou plus** — les deux créneaux portent-ils leur piste ? (AC8)
  - **1 oui sur 4** à côté de **4 oui sur 4** — les deux pistes diffèrent-elles vraiment ? (AC3, le cœur de la story)
  - un vote **sans aucune réponse** — piste entièrement tramée, pas vide ni cassée
  - la case du Mois **étroite** et **large**, la Semaine **portrait** et **paysage**, et **en contexte de partie panneau ouvert**
  - le **rail** à toutes les largeurs
  - 🚨 **le compte du dénominateur, MJ compris** (AC9) — c'est le point que seul l'œil peut confirmer sur des données réelles
- [x] `/security-review` — **non optionnel sur cet épic** (`epics.md:335`), en dette depuis la 36.4. Cette story **touche des données** : elle ne peut pas la reporter comme la 36.13 l'a fait.

### Review Findings

*Revue du 2026-08-21 (bmad-code-review) : Blind Hunter, Edge Case Hunter, Acceptance Auditor — aucune violation d'AC. 8 `patch`, 2 `defer`, 5 rejetés comme bruit.*

- [x] [Review][Patch] Collision de clé `poll-<id>-undefined` sur une réponse API dégradée (pré-36.6) à plusieurs options [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts] — la garde de dégradation honnête protège `vote` mais pas `key`, qui lit `option.optionId` sans filet ; un vote à 2+ créneaux servi par une API non redéployée produit des clés `@for` identiques. Dériver la clé de `date`+`slot` (toujours présents) plutôt que d'`optionId`. **Corrigé** : clé `poll-${p.pollId}-${option.date}-${option.slot}`.
- [x] [Review][Patch] Créneau brut (`option.slot`, ex. `MORNING`) affiché tel quel dans l'Agenda pour une entrée de vote [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:1510,1558 ; rendu via calendar-agenda-view.html:16] — régression introduite par cette story : l'ancien texte traduit (« N option(s) proposée(s) ») est remplacé par le code d'enum brut, alors que `SLOT_LABELS` existe déjà dans ce même fichier (`calendar-view.ts:82`) pour les séances. **Corrigé** : `detail: SLOT_LABELS[option.slot]` dans les deux contextes.
- [x] [Review][Patch] Compteur/libellé accessible non bornés en cas d'effectif dépassé (« 5/4 ») alors que la piste, elle, est bornée [apps/web/src/app/features/calendar/poll-track.utils.ts — `counterLabel()`, `participationAriaLabel()`] — un membre retiré après avoir voté produit une piste pleine (100 %, bornée) à côté d'un texte « 5 réponses sur 4 » non borné : incohérence visible et dans le nom accessible. **Corrigé** : les deux fonctions bornent désormais le numérateur à `min(respondedCount, total)`.
- [x] [Review][Patch] Test de non-fuite AC11 trop faible (recherche de sous-chaîne) [apps/api/src/availability/availability.service.spec.ts:152] — `JSON.stringify(calls[0]).not.toContain('user')` ne détecterait pas une relation ajoutée sous une autre clé (`voter`, `author`, casse différente). **Corrigé** : assertion structurelle exacte de l'`include` (`toEqual`).
- [x] [Review][Patch] Docstring de `MyCalendarPollEntry` non mise à jour après l'ajout de `membersCount` et des agrégats par option [packages/shared/src/index.ts, ~ligne 2763] — le commentaire ne mentionne toujours que l'éclatement par option, pas les nouveaux champs. **Corrigé.**
- [x] [Review][Patch] Pourcentages flottants non arrondis écrits dans `style` [apps/web/src/app/features/calendar/poll-track/poll-track.ts — `pct()`] — pour un total non diviseur (ex. 3/7), produit des décimales arbitrairement longues dans l'attribut `style`. **Corrigé** : arrondi à 2 décimales.
- [x] [Review][Patch] Fixture `poll-creation.spec.ts` non mise à jour malgré la checklist de la story (encadré n°5) [apps/web/src/app/features/poll/poll-creation/poll-creation.spec.ts:11-40] — ne casse pas la compilation (mock non typé strictement), mais l'affirmation « 10 fixtures » de la Dev Agent Record n'est vérifiée que pour 9 + 1 fichier hors liste (`scenario-timeline.spec.ts`). **Corrigé** : `membersCount: 4` ajouté au fixture.
- [x] [Review][Patch] Classe `.band--no-counter` morte dans le template [apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.html:117] — vestige de la première approche (masquage par règle parent), abandonnée au profit de la classe d'hôte dans `poll-track.scss` (Completion Note #7). Aucune règle CSS ne la référence ; à retirer. **Corrigé.**

*Post-patch (2026-08-21) : API 60 suites / 1300 tests, web 105 fichiers / 1822 tests, lint web 143 = baseline, `eslint src/availability` 22 = baseline, `pnpm typecheck` API propre — tous vérifiés après application des 8 patches.*
- [x] [Review][Defer] Liste Agenda non bornée par plage, aggravée par l'éclatement par option (AC8) [apps/api/src/availability/availability.service.ts — `buildOpenPollsLayer`, filtre au niveau du sondage ; apps/web/.../calendar-view.ts — `agendaEntries()`] — deferred, pre-existing — un sondage à 5 créneaux dont un seul dans la fenêtre visible peut désormais injecter jusqu'à 5 lignes hors-plage dans l'Agenda (contre 1 avant cette story). Déjà consigné par la story elle-même comme dette aggravée (`deferred-work.md:15`) ; aucun test ne couvre la multiplication.
- [x] [Review][Defer] `participantCount()` divergerait de `resolveParticipants()` si le MJ obtenait un jour une ligne `Membership` [apps/api/src/parties/participant-count.util.ts] — deferred, pre-existing — l'accord entre les deux formules repose entièrement sur un invariant applicatif (garde anti-auto-invitation dans `invitations.service.ts`/`invite-links.service.ts`), sans contrainte en base. Hypothétique, non introduit par cette story, mais à garder en tête si une fonctionnalité de transfert de MJ apparaît.

---

## Hors périmètre

- **Le sélecteur de réponse de vote** (ouvrir oui/peut-être/non depuis la bande) → **story 36.7**. Cette story **affiche** la participation ; elle ne la modifie pas. Ne poser aucun gestionnaire de clic sur la piste.
- **La jauge de disponibilité du groupe** sur canal séparé → **36.8**.
- **Le mode Destinée / « qui manque »** → 36.9. **Composer un vote depuis la grille** → 36.10. **L'Agenda refondu** → 36.11 / 36.12. **Légende et préférences** → 36.14.
- **Aligner `getMissingVoters()` / `poll-status` sur le nouvel effectif** — divergence désormais **écrite** (encadré n°2), à consigner, **pas à corriger ici** : elle sortirait du calendrier pour aller dans le panneau de vote.
- **Corriger le `displayName` manquant de `scenarios.service.ts:1058`** — défaut pré-existant, à consigner.
- **Le vote masqué sous une séance** (`deferred-work.md:7`) — ne pas aggraver, ne pas corriger (encadré n°8).
- **Retirer `.seance-dot`** et **aligner « Soirée » / « Soir »** — dettes ouvertes de la 36.13.
- **Factoriser les blocs jumeaux de sélection** Mois / Semaine — dette structurelle, elle toucherait le geste.

---

## Ce qui doit continuer de fonctionner

- **La sélection par glissement**, en Mois comme en Semaine : long-press 450 ms, seuil de 8 px, `elementFromPoint` + `closest('[data-cell-date]')`, clamp, `suppressNextClick`, Échap, Maj+flèches, la barre de sélection et l'écriture groupée avec sa résolution de conflits (36.3, 36.4).
- **`buildDayDetail` / `SLOT_PRECEDENCE` / `composeSeanceInfo` / `buildMonthDetails` / `entryCoversSlot`** — **étendus, jamais dupliqués**.
- **FR-50** : une séance confirmée rend le créneau indisponible **quelle que soit la couche**, en Mois, en Semaine et au rail.
- **Le rail permanent à toutes les largeurs** (36.1) et **les deux container queries** (712 px Mois, 500 px Semaine) dans leur rôle actuel.
- **Le contrat DOM** : `.slot-cell`, `data-cell-date`, `data-cell-slot`, `.band`, `data-winner`, `.week-grid`, `app-selection-bar`.
- **`GET /me/calendar`** : les 5 couches, aucune clé ajoutée ni retirée, `disponibilite-groupe` toujours absente (AD-16), la garde de plage et le plafond de jours.
- **`PollResponseComponent` / `PollStatusPanel`** et les chemins de vote existants (`castVote`, `withdrawVote`, `choose`, `close`).
- **La garde anti-N+1** de `getMyCalendar`.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Laisser une entrée par sondage.** La piste ne se poserait que sur la première option ; les autres créneaux resteraient muets (encadré n°1, AC8).
2. **Calculer les largeurs en proportion des RÉPONDANTS.** C'est le défaut exact que `DESIGN.md:333` dit d'avoir corrigé : « 1 oui sur 4 » deviendrait une piste verte pleine, identique à « 4 oui sur 4 ». **AC3 existe pour ça.**
3. **Compter l'effectif sans le MJ.** Deux dénominateurs sur la même case, et « 5 / 4 » possible (encadré n°2, AC9).
4. **Injecter `PartiesService` dans `AvailabilityService`.** Cycle de modules Nest — d'où la fonction pure.
5. **Un `count` d'effectif par partie dans `getMyCalendar`.** Violation frontale d'AD-3, et la garde `:2232` est là pour l'attraper.
6. **Ajouter `include: { user: … }` aux votes du calendrier personnel.** Une identité de votant tiers fuiterait (AD-9, AC11).
7. **Mettre `membersCount` dans `PollOptionDto`.** `options` est un `any[]` dans les deux `toSessionPollDto` : **aucun compilateur ne verrait le champ manquant**. À la racine, si (encadré n°3).
8. **Oublier l'un des DEUX `toSessionPollDto`.** Ils divergent déjà sur `displayName`.
9. **Sauter `pnpm typecheck` côté API.** `ts-jest` ne type-check pas cross-file (`isolatedModules`) : une signature cassée passe les tests.
10. **Affaiblir la garde anti-N+1** au lieu de l'étendre (AC12).
11. **Sortir un nœud de piste de `.slot-cell`**, ou oublier `pointer-events: none`. Le glissement casse **et les tests restent verts** — il n'existe aucun garde-fou automatisé (36.13, encadré n°3).
12. **Brancher un `@if` de largeur, un `ResizeObserver` ou un `BreakpointObserver`.** Les deux container queries existent déjà ; tout doit être dans le DOM, le CSS masque.
13. **Poser un compteur dans la case du Mois étroite.** L'AC4 l'interdit explicitement.
14. **Faire de la piste la seule porteuse de l'information.** P-1 : le compteur et le nom accessible la doublent (AC5, AC14).
15. **Rendre une piste sur un créneau dont le rang gagnant est `'seance'`.** Le texte suit le rang ; la piste aussi (encadré n°8).
16. **Une division par zéro** sur un effectif nul, ou un `NaN%` en style inline.
17. **Croire que jsdom évalue les container queries.** Il ne le fait pas — d'où la vérification visuelle obligatoire.
18. **Rendre `membersCount` optionnel** « pour ne pas casser les fixtures ». Un effectif absent produirait une piste au dénominateur indéfini, silencieusement.
19. **Utiliser `[innerHTML]`** pour un libellé de vote. Interpolation seule, toujours.
20. **Ouvrir un chemin de vote depuis la piste.** C'est la 36.7.

### Décisions arrêtées par cette story

- **Effectif = MJ + membres**, partout. Une **fonction pure** `participantCount()` en est le point unique (encadré n°2). *(Décision utilisateur, 2026-08-20.)*
- **`membersCount` à la racine de `SessionPollDto`, requis.** ⚠️ Écart assumé vis-à-vis de la lettre de D-17.
- **`MyCalendarPollEntry.options` gagne `optionId`** — sans lui, ni ma réponse ni un agrégat ne sont adressables, et la 36.7 ne pourrait pas voter depuis le calendrier personnel.
- ⚠️ **Une `AgendaEntry` par OPTION, plus une par sondage.** Divergence assumée avec `contrat-ui-calendrier.html:331` (qui groupe les options en une ligne d'agenda) — la 36.11 refond l'Agenda ; à répercuter.
- **La piste suit le rang `'vote'`**, jamais un créneau dont la séance a gagné.
- **La densité est CSS pure**, via les deux `@container` déjà en place. Compteur : Semaine large, rail, Agenda. Jamais dans le Mois.
- **Le marquage de rang de la cellule de Semaine est inclus**, via `[attr.data-winner]` (encadré n°7). *(Décision utilisateur, 2026-08-20.)*
- **La trame est le FOND de la piste**, pas un segment.

### Décisions laissées à l'implémentation

- **Le filtre de plage des sondages : au niveau du sondage (actuel) ou de l'option ?** *Recommandation : au niveau de l'option, maintenant que chaque option devient une entrée — sinon une option hors plage produirait une entrée hors de la fenêtre demandée. **Commenter le choix**, il change le contrat de `GET /me/calendar`.*
- **Champs de vote plats sur `AgendaEntry`, ou un sous-objet `vote`.** *Recommandation : un sous-objet — sept champs plats sur un type déjà chargé deviendraient illisibles, et la 36.7 en ajoutera.*
- **Où vit l'utilitaire de proportions** : dans `day-detail.utils.ts` ou dans un `poll-track.utils.ts` frère. *Recommandation : un fichier frère — `day-detail.utils.ts` porte déjà la préséance, le rail et le mois.*
- **Composant de piste, ou fonction de style ?** *Recommandation : un composant de rendu pur, seule façon de garantir les quatre surfaces identiques.*
- **Le libellé de ma réponse** : « oui » (planche, case du Mois) vs « tu as dit oui » (planche, rail). *Recommandation : les deux, gouvernés par la densité, via un seul utilitaire.*
- **Comment `membersCount` descend jusqu'à `toSeanceDto`** : paramètre threadé, ou méthode publique sur `PartiesService`. *Un seul comptage par appel, quel qu'en soit le chemin.*

### Notes de plateforme

- **Web** : Angular 22 **zoneless**, Material 22.0.2, Vitest 4, TypeScript 6.0.2. `@if`/`@for`, signals, `input()`/`output()`, `standalone: true`, `import type` pour `@master-jdr/shared`.
- **API** : NestJS 11, Prisma 7.8 (générateur `prisma-client-js` legacy), Jest 30, TypeScript 5.7. **`pnpm typecheck` obligatoire.**
- **Aucune dépendance nouvelle. Aucune migration Prisma** — `PollVote`, `PollOption`, `Membership` existent tous.
- **Exécution : tout par Docker.** `docker compose exec api pnpm <…>` / `docker compose exec web pnpm <…>`.
- **Container queries** : déjà en production dans ce projet (`calendar-month-view.scss:288`, `calendar-week-view.scss`) — support acquis, pas une hypothèse.
- **Context7 (MCP)** : à consulter avant d'écrire du Prisma `groupBy` ou une signature Nest — les versions bougent vite.

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : aucun câblage nouveau requis en contexte de partie ; la dette du calendrier personnel n'est ni soldée ni aggravée.**

- **Contexte de partie** : `castVote()` et `withdrawVote()` émettent déjà sur `partieTopic(partieId)` (`poll.service.ts:118`, `:154`), et `CalendarView` recharge les scénarios sur `scenariosSvc.changed()` (`calendar-view.ts:487-497`). La piste, dérivée d'`activePolls()`, **hérite donc du temps réel existant** sans une ligne de plus. ⚠️ **À vérifier explicitement à l'implémentation** : la réponse d'un **autre** membre doit faire bouger la piste sans rechargement — c'est un cas nouveau, l'ancienne entrée par sondage ne montrait aucun compteur.
- **Calendrier personnel** : `GET /me/calendar` n'est **toujours pas** câblé sur `RealtimeService` (`deferred-work.md:17`). La piste y sera donc figée jusqu'au prochain chargement. **Écart connu, non aggravé, non soldé** — le consigner à nouveau. [Source: CLAUDE.md ; docs/checklist.md]

### Sécurité

- 🚨 **`/security-review` est NON OPTIONNEL sur cet épic** (`epics.md:335`) et **en dette depuis la 36.4**. Contrairement à la 36.13 (front pur), **cette story touche un DTO, un `include` Prisma et une agrégation** : elle ne peut pas la reporter.
- **Fuite d'identité (AC11)** — le point de risque est **l'`include` des votes** du calendrier personnel. `votes: true` suffit ; `include: { user: … }` ferait sortir des pseudos de membres d'autres parties sur un écran hors contexte de partie. **AD-9/AD-2.**
- **Exposition d'agrégats** — `membersCount` est un **entier anonyme**, sur une partie dont l'appelant est déjà membre (`getViewable`). Aucune information nouvelle sur une partie tierce.
- **Autorisation** — aucun endpoint neuf, aucune garde modifiée. `getMyCalendar` reste scopé à « mes parties » par `where: { partieId: { in: partieIds } }`.
- **XSS** — libellés de vote rendus par interpolation. **Jamais `[innerHTML]`.**
- **Styles inline calculés** — les largeurs de segments sont des pourcentages numériques. Les **borner** (0–100, jamais `NaN`) : une valeur issue d'un calcul non gardé finirait dans un attribut `style`.

### Dette refermée par cette story

- **`deferred-work.md:5`** — la cellule de Semaine nomme sans marquer (AC13, encadré n°7).
- **`deferred-work.md:22`** — absence de test de non-fuite d'une `SessionPoll` tierce (couvert par le test d'AC11).
- **Le défaut pré-existant** « seule la première option d'un vote est marquée dans la grille » (encadré n°1).
- **L'ambiguïté de l'effectif**, jamais tranchée jusqu'ici (encadré n°2).

### Dette explicitement NON refermée

- **`deferred-work.md:7`** — le rail masque un vote actif quand le créneau porte déjà une séance. **Ne pas l'aggraver** (encadré n°8).
- **`deferred-work.md:17`** — `GET /me/calendar` non câblé sur SSE.
- **`deferred-work.md:42`** — `OpenPollsService` fait doublon avec le signal `VOTE_EN_COURS_SANS_REPONSE` (fan-out par partie, motif proscrit par AD-3).
- **`deferred-work.md:15`** — liste Agenda non bornée. ⚠️ **Aggravée mécaniquement** par l'éclatement par option (N options au lieu d'un vote) — le **redire** dans `deferred-work.md`.
- **`getMissingVoters()` / `poll-status` ignorent le MJ** — divergence nouvelle à consigner (encadré n°2).
- **`scenarios.service.ts:1058` omet `displayName`** alors que `PollVoteDto` l'exige — défaut pré-existant masqué par `any`.
- **La pastille `.seance-dot`** et **« Soirée » / « Soir »** — dettes de la 36.13.

### Project Structure Notes

**Nouveaux**
- `apps/api/src/parties/participant-count.util.ts` (+ sa spec)
- `apps/web/src/app/features/calendar/poll-track/` — composant de piste partagé (+ sa spec)
- `apps/web/src/app/features/calendar/poll-track.utils.ts` (+ sa spec) — *si le fichier frère est retenu*

**Modifiés — API / shared**
- `packages/shared/src/index.ts` (`SessionPollDto.membersCount`, `MyCalendarPollEntry`)
- `apps/api/src/availability/availability.service.ts` (`getMyCalendar`, `buildOpenPollsLayer`, `include`, `Promise.all`)
- `apps/api/src/availability/availability.service.spec.ts` (fabrique de mocks, assertion de couche, garde N+1 **renforcée**, test de non-fuite)
- `apps/api/src/poll/poll.service.ts` (`toDto`)
- `apps/api/src/scenarios/scenarios.service.ts` (`toSessionPollDto`, `toSeanceDto`, `loadSeancesBatch`)
- fixtures des specs API portant un `SessionPollDto`

**Modifiés — Web**
- `calendar-view/calendar-view.ts` (éclatement par option, deux contextes) et `.spec.ts`
- `calendar-agenda-view/calendar-agenda-view.ts` / `.html` / `.scss` (champs de vote, piste, compteur)
- `day-detail.utils.ts` (champs de vote sur `DaySlotDetail`) — ⚠️ **touche le Mois, la Semaine et le rail : relancer leurs trois suites**
- `calendar-month-view/` (`.ts` / `.html` / `.scss`)
- `calendar-week-view/` (`.ts` / `.html` / `.scss`) — piste, compteur, `data-winner` (AC13)
- `calendar-detail-rail/` (`.ts` / `.html` / `.scss`)
- fixtures des specs web portant un `SessionPollDto` (10 fichiers, cf. encadré n°5)

**Non touchés (à confirmer par `git status`)**
- `selection.utils.ts` · `selection-bar/**` · `conflict-dialog/**` · `constraint-panel/**` · `poll-status/**` · `poll-response/**` (hors fixtures) · `apps/api/prisma/**` (aucune migration)

### References

- [Source: **epics.md — Story 36.6**] — les sept AC, verbatim.
- [Source: epics.md:1906, :1922, :335] — « FR-51 | 36.6, 36.7 », « **Serveur (D-17)** + front », et **`/security-review` non optionnel sur l'épic**.
- [Source: epics.md:1934 — Convention de lecture du contrat d'UI] — la planche décrit l'état d'arrivée de **l'épic** ; une story intermédiaire peut ne pas y ressembler encore. Le ⚠️ signale un écart à la **cible finale**.
- [Source: **prd.md:326-333 — FR-51**] — « la piste entière porte l'effectif de la troupe ; la portion remplie dit combien ont répondu, les couleurs disent quoi, la portion restante est tramée. Un compteur « 3 / 4 » double la forme partout où la place le permet. »
- [Source: **prd.md:434 — D-17**] — dérogation actée, « enrichissement d'un DTO existant, aucune migration ; **sans objet en contexte de partie** ». ⚠️ C'est cette dernière clause dont la story s'écarte, sciemment (encadré n°3).
- [Source: **DESIGN.md:327-335**] — la piste au pixel, **et le motif du défaut corrigé** : « tant que les largeurs étaient proportionnelles aux seuls répondants, « 1 votant sur 4 » et « 4 sur 4 » produisaient une piste identique ». Compteur `text-muted` 9,5 — « elle demande la légende ».
- [Source: **contrat-ui-calendrier.html:112-120**] — `.track` / `.cnt` / `.mine` au pixel ; `:761-764` — la fonction `track(tr, tot)` de la planche, dénominateur = **effectif total** ; `:797` — la bande du Mois porte piste **et** « oui », **sans compteur** ; `:374`, `:439-442`, `:489-491` — les surfaces à compteur ; `:662` — la légende « Participation : la piste = la troupe ».
- [Source: contrat-ui-calendrier.html:156-159] — `.wk .cell.se` / `.cell.vo`, le marquage de rang de la cellule de Semaine (AC13).
- [Source: **ARCHITECTURE-SPINE.md — AD-20**] — « états dépendants du lecteur résolus côté client » : `PollOptionDto.votes` porte tout, aucun endpoint dédié. **AD-3** — jamais une requête par partie. **AD-9** — non-fuite structurelle. **AD-18** — `GET /me/calendar`, un endpoint indexé par couche, une couche vide est un tableau vide. **AD-16** — `disponibilite-groupe` jamais dans le calendrier personnel.
- [Source: `36-13-la-grille-semaine-a-densite-variable.md`] — la Semaine câblée (`entries` + `activeLayers`), le **contrat DOM du glissement que rien ne teste**, la container query à 500 px, et l'observation consignée : « la cellule nomme mais ne marque pas — c'est le fond sur lequel la 36.6 posera sa piste ».
- [Source: `36-2-la-case-du-mois-trois-bandes-et-la-preseance.md`] — `SLOT_PRECEDENCE`, `data-winner`, la container query à 712 px, et la **fuite de texte inter-rangs** corrigée en revue (`text` doit suivre `winner`, jamais un `??`).
- [Source: `36-1-le-rail-de-detail.md`] — le rail permanent à toutes les largeurs, `buildDayDetail()` comme point unique, aucun appel réseau.
- [Source: `deferred-work.md:5, :7, :15, :17, :22, :42`] — les six dettes que cette story croise.
- [Source: `sprint-status.yaml`, entrée `36-6-…`] — l'analyse du 2026-08-20 et ses deux arbitrages, repris ici.
- [Source: docs/checklist.md ; CLAUDE.md] — évaluation SSE obligatoire, `/security-review` et `/code-review`, tout par Docker, Context7 avant du code framework.

---

## Décisions arbitrées avec l'utilisateur (2026-08-20)

1. **`membersCount` sur `SessionPollDto`** pour l'effectif en contexte de partie (arbitrage initial, reporté depuis la préparation de la 36.13).
2. **L'effectif inclut le MJ** — MJ + membres, aligné sur `resolveParticipants()` / `AggregatedSlotDto.total`. La divergence de `poll-status` (« manquants » sans le MJ) est **consignée en dette**, pas corrigée ici.
3. **Le marquage de rang de la cellule de Semaine est inclus** dans cette story (`deferred-work.md:5`) — poser une piste sur une cellule qui ne se signale pas reproduirait le défaut P-1.

### ⚠️ À répercuter hors story

- **La planche contractuelle** groupe les options d'un vote en **une** ligne d'agenda (`:331`) ; l'implémentation en produira **une par créneau**. À répercuter (`bmad-ux` / `correct-course`), ou à acter comme divergence assumée jusqu'à la 36.11.
- **D-17** dit « sans objet en contexte de partie » ; la story ajoute pourtant `membersCount` au `SessionPollDto` de partie. À amender dans le PRD.
- **`deferred-work.md`** : quatre entrées nouvelles ou mises à jour — la divergence d'effectif de `poll-status`, le `displayName` manquant de `scenarios.service.ts:1058`, l'aggravation de la liste Agenda non bornée, et la fermeture des entrées `:5` et `:22`.

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story, 2026-08-20)

### Debug Log References

- **Baseline mesurée avant tout changement** (`HEAD = cad1d0e`, working tree propre) : **API 59 suites / 1287 tests**, **web 103 fichiers / 1758 tests**, lint web **143**, `eslint src/availability` **22**, `pnpm typecheck` propre.
  ⚠️ Côté API la story annonçait **1285** : le chiffre réel était **1287**. Écart de +2 constaté au démarrage, sans conséquence — la consigne « reconfirmer, ne pas recopier » a fonctionné.
- **Phase rouge respectée à chaque tâche** : util d'effectif (module introuvable), `membersCount` (3 échecs), couche `votes-en-cours` (5 échecs), éclatement par option (5 échecs), case du Mois (3 échecs), cellule de Semaine (6 échecs), rail + Agenda (6 échecs).
- **Phase verte finale** : **API 60 suites / 1300 tests** (+1 suite, +13), **web 105 fichiers / 1822 tests** (+2 fichiers, +64). Lint web **143 = baseline** (mesuré par comparaison JSON fichier par fichier avec un `git stash`, pas à l'œil). `eslint src/availability` **22 = baseline**. `pnpm typecheck` propre.

### Completion Notes List

1. **L'effectif, défini une fois.** `participant-count.util.ts` porte `participantCount()` (le MJ + ses `Membership`) et `countParticipants()` (le comptage pour une partie). **Fonction pure et non méthode de service**, comme la story l'exigeait : `AvailabilityService` en a besoin et ne peut pas injecter `PartiesService` — `AvailabilityModule` est consommé PAR `PartiesModule`, l'inverse créerait un cycle. Un test compare explicitement la formule à ce que produit `resolveParticipants()`.

2. **Le compilateur a fait le travail annoncé.** `membersCount` requis à la RACINE de `SessionPollDto` a fait échouer la compilation de **10 fixtures front** — exactement ce que la story voulait. Le piège de typage était réel et vérifié : à l'intérieur de `options`, `poll` étant `any`, rien n'aurait été signalé.

3. **Filtre de plage tranché : il reste au niveau du SONDAGE**, toutes les options renvoyées (contrat inchangé). Motif écrit dans le code : filtrer par option aurait rendu `nextMeaningfulDate()` — le rail, story 36.1 — aveugle à une option juste au-delà de la fenêtre chargée, qui est précisément ce qu'il cherche.

4. **Les trois tests verrouillants, traités comme prévu** — et le diagnostic de la story s'est vérifié : `:1781` ne cassait pas par son assertion mais par la fabrique de mocks (pas de `membership.groupBy`) ; `:2060` cassait réellement ; **`:2232` a été RENFORCÉE** d'un `expect(mockMembershipGroupBy).toHaveBeenCalledTimes(1)`, jamais affaiblie.

5. **L'éclatement par option (AC8) a bien corrigé un défaut pré-existant réel.** Avant cette story, un vote proposant six créneaux n'en marquait qu'**un** dans la grille. Vérifié à l'écran : les **six** options du vote de « Chroniques de la Guilde » portent désormais chacune leur piste, sur leurs trois jours.

6. 🚨 **DÉFAUT RÉEL n°1, trouvé À L'ŒIL et par aucun des 3117 tests : « NaN / undefined » dans le rail.** Un client neuf interrogeant une API qui ne sert pas encore les agrégats (l'état transitoire de tout déploiement — reproduit ici, le conteneur API n'ayant pas rechargé) affichait littéralement `NaN / undefined`. Le typage ne protège de rien : la charge utile vient du réseau. **Corrigé sur deux niveaux** : `safeCount()` dans les utilitaires (aucune largeur non finie ne peut atteindre un attribut `style`), et surtout une **dégradation honnête** dans `calendar-view.ts` — sans agrégats servis, aucune piste n'est rendue du tout, plutôt qu'une piste vide qui affirmerait faussement « personne n'a répondu ». Quatre tests verrouillent le cas.

7. 🚨 **DÉFAUT RÉEL n°2, trouvé À L'ŒIL : le compteur s'affichait dans la case du Mois, contre l'AC4.** Cause : **l'encapsulation de vue d'Angular**. La règle `.band--no-counter .cnt { display: none }` écrite dans `calendar-month-view.scss` n'avait **aucun effet** — `.cnt` appartient au template de `PollTrack`, qu'un sélecteur du parent ne peut pas atteindre. La même faute était posée dans `calendar-week-view.scss`. **Corrigé** : toutes les règles de densité vivent désormais dans `poll-track.scss`, déclenchées par une **classe d'hôte** (`in-month`, `in-week`) que la surface pose. Les `@container` fonctionnent depuis là — le conteneur nommé est un ancêtre, la frontière de composant ne l'interrompt pas. Les deux tests concernés assertent maintenant le mécanisme qui marche, pas un proxy inopérant.

8. ⚠️ **DÉFAUT RÉEL n°3, trouvé À L'ŒIL : ma réponse écrasait le titre dans la case du Mois.** Piste (52 px) + « peut-être » (~45 px) dans une bande de **115 px** ne laissaient plus que ~15 px au titre, réduit à « C… ». **Le fait décisif était déjà écrit dans le fichier par la story 36.5 :** la grille du Mois est **plafonnée à ~896 px et ne grandit pas avec la fenêtre** — un seuil de densité plus haut ne se déclencherait donc **jamais**. Même remède qu'elle : l'accessoire cède. **⚠️ Divergence assumée avec la planche** (`contrat-ui-calendrier.html:797` rend « oui » dans la bande) : la case du Mois ne porte ni compteur ni réponse ; le rail les porte à toutes les largeurs, et le nom accessible de la piste dit toujours ma réponse. Mesure après correction : titre uniforme à **56 px** sur les six bandes.

9. **Défaut mineur corrigé dans la foulée** : chaque ligne d'Agenda répétait « 6 option(s) proposée(s) ». Ce texte décrivait le SONDAGE ; répété sur chacune de ses options éclatées, il devenait un bruit trompeur. Remplacé par le **créneau**, comme pour une séance.

10. **La dette `deferred-work.md:5` est refermée (AC13).** La cellule de Semaine porte enfin son signe de rang — liseré de vote, filet de séance — via `[attr.data-winner]`, **la convention déjà posée par la case du Mois**, jamais un second schéma de classes.

11. **Non-fuite (AC11) vérifiée deux fois** : par un test qui sérialise la couche et interdit tout `userId`/`pseudo`/`displayName` tiers, par un second qui interdit `user` dans l'`include` Prisma, et **sur la réponse réelle du serveur** pendant la vérification visuelle.

12. ✅ **VÉRIFICATION VISUELLE RÉELLE FAITE** (Chrome, session ouverte par l'utilisateur), sur **les deux contextes** et **les quatre surfaces**. Six votes de démonstration ont été posés via `psql` pour rendre l'AC3 observable — le jeu de développement n'avait qu'une réponse par option, ce qui ne permettait pas de comparer « 1 sur 5 » à « 5 sur 5 ». *(Même procédé que la story 36.5. Ces lignes restent en base : voir « Données de démonstration » ci-dessous.)*

13. ✅ **AC3, le cœur de la story, validé à l'œil** : le 21 septembre (« 1 / 5 », petite portion + trame) et le 22 (« 5 / 5 », piste pleine sans trame) **ne se ressemblent pas du tout**. C'est exactement le défaut que `DESIGN.md:333` décrivait, et il ne se produit pas.

14. ✅ **AC9 validé sur données réelles, dans les DEUX contextes** : « 1 / 5 » au calendrier personnel et « 1 réponse sur 5 » en contexte de partie — MJ + 4 membres. Les deux chemins s'accordent, et l'effectif est celui de la jauge de groupe.

15. ✅ **AC7 mesuré, pas supposé** : en contexte de partie, `window.fetch` instrumenté compte **0 appel** lors d'une bascule de couche, les six pistes étant dérivées d'`activePolls()`.

16. ✅ **Le scénario qui justifie la container query, revérifié** : contexte de partie, panneau latéral ouvert — fenêtre **1424 px**, grille **380 px**. La bascule se fait bien en **étroit** (compteur masqué) alors qu'une media query aurait affiché « 3 / 5 » dans une colonne de ~47 px. La règle posée depuis `poll-track.scss` franchit correctement la frontière de composant.

17. **Le contrat DOM du glissement est tenu** : la piste porte `pointer-events: none` et un test dédié vérifie `track.closest('[data-cell-date]') === cell` **sans** le stub `elementFromPoint` — le seul garde-fou possible.

18. ❌ **`/security-review` reste DÛ.** Cette story touche un DTO, un `include` Prisma et une agrégation : contrairement à la 36.13, elle ne peut pas s'en dispenser. **À lancer avant de clore l'épic.**

### Données de démonstration posées en base

Six lignes `PollVote` ont été ajoutées au jeu de développement pour rendre l'AC3 observable (partie « Chroniques de la Guilde », vote `da5756dd-…`). Elles sont **additives et sans effet sur les tests**. Pour les retirer :

```sql
DELETE FROM "PollVote"
WHERE "pollId" = 'da5756dd-f0fe-4918-851b-2c9d14ad1761'
  AND "userId" <> '154b9cce-8332-4d3d-9886-d6c5b22f7477';
```

### File List

**Nouveaux — API**
- `apps/api/src/parties/participant-count.util.ts` (`participantCount`, `countParticipants`)
- `apps/api/src/parties/participant-count.util.spec.ts` (4 tests)

**Nouveaux — Web**
- `apps/web/src/app/features/calendar/poll-track.utils.ts` (`VoteParticipation`, `trackSegments`, `counterLabel`, `answerLabel`, `participationAriaLabel`, `respondedCount`, `safeCount`)
- `apps/web/src/app/features/calendar/poll-track.utils.spec.ts` (22 tests)
- `apps/web/src/app/features/calendar/poll-track/poll-track.ts` / `.html` / `.scss` / `.spec.ts` (composant partagé, 9 tests)

**Modifiés — shared / API**
- `packages/shared/src/index.ts` (`SessionPollDto.membersCount`, `MyCalendarPollOption`, `MyCalendarPollEntry`)
- `apps/api/src/availability/availability.service.ts` (`include` des votes, `membership.groupBy` dans le `Promise.all`, `buildOpenPollsLayer` étendu)
- `apps/api/src/availability/availability.service.spec.ts` (fabrique de mocks, assertion de couche réécrite, garde N+1 **renforcée**, 2 tests de non-fuite)
- `apps/api/src/poll/poll.service.ts` / `.spec.ts` (`toDto(poll, membersCount)`, 4 tests)
- `apps/api/src/scenarios/scenarios.service.ts` / `.spec.ts` (`toSessionPollDto`/`toSeanceDto`/`loadSeancesBatch` threadés, 1 test)

**Modifiés — Web (calendrier)**
- `calendar-view/calendar-view.ts` / `.spec.ts` (éclatement par option dans les deux contextes, dégradation sans agrégats, `detail` = créneau)
- `day-detail.utils.ts` / `.spec.ts` (`DaySlotDetail.pollVote`)
- `calendar-agenda-view/` (`.ts` : `AgendaEntry.vote` ; `.html` ; `.spec.ts`)
- `calendar-month-view/` (`.ts` : `DayBand.vote`, `bandAriaLabel` ; `.html` ; `.scss` ; `.spec.ts`)
- `calendar-week-view/` (`.ts` : `cellWinner()`, `eventVote()`, `cellAriaLabel` ; `.html` ; `.scss` ; `.spec.ts`)
- `calendar-detail-rail/` (`.ts` ; `.html` ; `.spec.ts`)

**Modifiés — Web (fixtures `SessionPollDto`)**
- `core/poll/open-polls.service.spec.ts` · `core/poll/poll.util.spec.ts` · `features/dashboard/dashboard.spec.ts` · `features/parties/partie-detail/partie-detail.spec.ts` · `features/poll/poll-response/poll-response.spec.ts` · `features/poll/poll-status/poll-status.spec.ts` · `features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` · `features/scenarios/scenario-timeline/scenario-timeline.spec.ts` · `features/scenarios/seance-list/seance-list.spec.ts`

**Non touchés (confirmé par `git status`)**
- `apps/api/prisma/**` (aucune migration) · `selection.utils.ts` · `selection-bar/**` · `conflict-dialog/**` · `constraint-panel/**` · `poll-status/**` et `poll-response/**` (hors fixtures) · `apps/web/src/styles.scss`

### Change Log

- 2026-08-20 — Story créée (bmad-create-story). Analyse préalable du `sprint-status.yaml` reprise et **corrigée sur trois points** : (1) `CalendarWeekView` **reçoit désormais** `entries` et `activeLayers` depuis la 36.13, l'AC4 n'est plus bloqué ; (2) le test `availability.service.spec.ts:1781` ne casse pas par son assertion mais par la **fabrique de mocks** ; (3) 🚨 **l'effectif de la troupe n'était pas défini** — deux conventions incompatibles coexistent dans le code (`resolveParticipants()` avec le MJ, `listMembers()` sans lui) alors que le MJ vote. Tranché avec l'utilisateur : **MJ inclus**. Deux découvertes structurelles ajoutées : **une entrée de vote par sondage et non par option** (les créneaux autres que le premier sont muets aujourd'hui), et le **piège de typage `any`** qui empêcherait `tsc` de voir un champ manquant dans `options`. Le marquage de rang de la cellule de Semaine (`deferred-work.md:5`) est **inclus** sur décision de l'utilisateur.

- 2026-08-20 — **Implémentation complète (Tasks 1 à 8, bmad-dev-story). Statut → review.** L'effectif de la troupe est désormais défini **une seule fois** — `participantCount()` = **le MJ + ses membres**, une **fonction pure** parce qu'`AvailabilityService` ne peut pas injecter `PartiesService` (cycle de modules). `SessionPollDto.membersCount` à la RACINE (le piège `any` était réel : dans `options`, aucun compilateur n'aurait vu le champ manquant) ; `GET /me/calendar` sert `optionId` + agrégats + `myAnswer` par option, l'effectif venant d'**un seul `membership.groupBy`** ajouté au `Promise.all` existant — **garde anti-N+1 RENFORCÉE**, jamais affaiblie. 🚨 **AC8 a corrigé un défaut pré-existant** : `allCalendarEntries()` n'émettait qu'UNE entrée par sondage, datée sur sa première option — un vote à six créneaux n'en marquait qu'un, les cinq autres étaient muets en Mois, Semaine et rail. 🚨 **TROIS DÉFAUTS RÉELS TROUVÉS À L'ŒIL, aucun vu par les 3117 tests.** (1) **« NaN / undefined »** dans le rail dès qu'un client neuf interroge une API en retard — corrigé par `safeCount()` et surtout par une **dégradation honnête** (aucune piste plutôt qu'une piste vide qui mentirait). (2) **Le compteur s'affichait dans la case du Mois**, contre l'AC4 : l'**encapsulation de vue** rendait la règle du parent inopérante sur `.cnt`, qui appartient au composant de piste — toutes les règles de densité vivent désormais dans `poll-track.scss`, pilotées par une classe d'hôte, et les `@container` franchissent correctement la frontière. (3) **Ma réponse écrasait le titre** dans une bande de 115 px (« C… ») — la grille du Mois étant **plafonnée à 896 px** (fait mesuré et écrit par la 36.5), aucun seuil plus haut n'aurait servi : ⚠️ **divergence assumée**, la case ne porte ni compteur ni réponse, le rail les porte à toutes les largeurs. **Dette `deferred-work.md:5` refermée** (AC13, marquage de rang de la cellule de Semaine via `data-winner`, la convention du Mois). ✅ **Vérification visuelle réelle faite sur les deux contextes et les quatre surfaces** : AC3 saute aux yeux (« 1 / 5 » trame vs « 5 / 5 » pleine), AC9 cohérent des deux côtés (effectif 5 = MJ + 4), **AC7 mesuré à 0 appel réseau**, et la container query revérifiée dans le scénario qui la justifie (fenêtre 1424 px / grille 380 px). **API 60 suites / 1300 tests** (baseline 59/1287), **web 105 fichiers / 1822 tests** (baseline 103/1758), lint web **143 = baseline** et `src/availability` **22 = baseline** (comparés par relevé JSON fichier par fichier), `typecheck` propre, **aucune migration**. ⚠️ Écart de baseline API constaté au démarrage : **1287** et non 1285 comme annoncé. ❌ **`/security-review` reste DÛ** — cette story touche un DTO, un `include` Prisma et une agrégation ; contrairement à la 36.13 elle ne peut pas le reporter.
