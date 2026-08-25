---
baseline_commit: d9038e4
---

# Story 36.8 : La disponibilité du groupe sur un canal séparé

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · porte **FR-53** [Source: epics.md:1907] · ⚠️ **classée « Front » par `epics.md:1924` — elle ne l'est pas entièrement** (encadré n°1)

> **La couche existe déjà, elle est simplement invisible.** `disponibilite-groupe` est servie (`GET /parties/:id/heatmap`), alimentée (`heatmap()`), bascule-able (`calendar-layer-toggle`) et affichée en liste (« Fenêtres de la destinée », vue Agenda) depuis la 30.6. Ce qui n'a **jamais** été dessiné, c'est sa présence **dans la grille** : elle occupait le dernier rang de la préséance, donc elle disparaissait dès qu'une déclaration ou une séance existait. Cette story ne crée pas une couche — elle lui donne **un canal à elle**.

---

## 🚨 Encadré n°1 — ⚠️ CETTE STORY N'EST PAS FRONT PURE : l'AC4 demande une donnée que le serveur ne sert pas

`epics.md:1924` classe la 36.8 « Front ». **C'est vrai pour la jauge, faux pour les pastilles du MJ.** Vérifié dans le code, pas supposé :

| Ce qu'il faut pour l'AC4 | Ce que le serveur fait aujourd'hui |
| --- | --- |
| Le **statut de chaque membre**, nommé, sur **toute la plage rendue** | `GET /parties/:id/heatmap` ne renvoie que des **compteurs** (`AggregatedSlotDto`), jamais `members` — `parties.service.ts:1088-1095` |
| Idem | `GET /parties/:id/available-slots` renvoie bien `members` **au MJ** (`parties.service.ts:1029`), mais : il **exclut en dur** tout créneau où le MJ est `UNAVAILABLE` (`:993-997`), il **tronque à 20 entrées** (`:1026`), et il est piloté par la plage du formulaire « Du / Au », **pas** par la grille affichée |
| Un **ordre fixe** de la troupe (« la position identifie la personne ») | `resolveParticipants()` fait `membership.findMany` **sans `orderBy`** (`parties.service.ts:863-868`) — l'ordre des membres n'est stable ni entre deux requêtes ni entre deux surfaces |

⚠️ La planche affirme *« C'est la même donnée servie sous deux formes, **et le serveur le fait déjà** »* (`contrat-ui-calendrier.html:465`). **C'est à moitié vrai** : les deux formes existent, mais celle qui porte les identités n'est pas servie sur la plage de la grille, et son ordre n'est pas déterministe.

**Décision de cette story — option A, deux changements serveur minimaux :**

1. `GET /parties/:id/heatmap` gagne, **pour le MJ uniquement**, un champ `members` par créneau, de la forme déjà employée par `AvailableSlotDto.members` (`{ userId, pseudo, displayName, status }`). Le corps de `getHeatmap()` calcule **déjà** `statuses` membre par membre (`parties.service.ts:1081-1087`) — il les agrège immédiatement et jette les identités. **Aucune requête nouvelle, aucune migration** : on cesse de jeter ce qui est déjà calculé, sous la garde `isMj` **déjà présente** (`:1057`).
2. `resolveParticipants()` ajoute `orderBy: { joinedAt: 'asc' }` à son `membership.findMany` — le MJ reste en tête (il est poussé le premier, `:878-885`), les membres suivent dans l'ordre d'arrivée. **Même clé de tri que `listMembers()`** (`:330`), qui l'a déjà. C'est ce qui rend la position signifiante.

**Pourquoi pas l'option B (front pur : le MJ retombe toujours sur la jauge).** Elle est tentante et elle est **fausse** : l'AC4 est un AC de l'épic, verbatim, et y renoncer viderait FR-53 de sa moitié MJ. Le coût mesuré de l'option A est de deux diffs de moins de dix lignes chacun dans **un seul fichier** serveur.

🚨 **Ce que l'option A n'autorise PAS :**
- Pas de nouvel endpoint. Pas de nouveau DTO de requête. **Aucune migration Prisma.**
- `members` reste **absent** de la réponse pour un joueur — pas `[]`, **absent**. Un joueur ne doit pas pouvoir déduire l'effectif nominatif d'une forme vide. (Même discipline que `listMembers()`, qui met `email: undefined` et non `null`.)
- La forme reste **`AggregatedSlotDto` + un champ optionnel**, jamais un type d'union : les appelants existants ne bougent pas.
- ⚠️ `packages/shared` **est** modifié (un champ optionnel sur `AggregatedSlotDto`). C'est le seul.

---

## 🚨 Encadré n°2 — LE CANAL SÉPARÉ N'EST PAS UN RANG. Ne jamais le remettre dans la préséance

`day-detail.utils.ts:44-46` porte l'interdiction, écrite pour cette story :

> *« La **disponibilité du groupe n'y figure pas** : elle est sortie de la préséance le 2026-08-17 (FR-53) et passe sur un canal séparé, livré par la story 36.8. Ne pas l'y réintroduire. »*

Le motif est dans `EXPERIENCE.md:253` : au dernier rang, elle était **invisible dès que j'avais déclaré quoi que ce soit** — c'est-à-dire presque toujours. *Une couche qu'on n'allume que pour ne rien voir ne sert à rien.*

**En clair :**
- `SlotWinner` ne gagne **aucun** membre. `SLOT_PRECEDENCE` n'est pas touché.
- `DaySlotDetail` gagne **un champ frère**, indépendant de `winner` — proposition : `group: GroupAvailability | null`.
- **Contrairement à `text`, `info` et `vote`, ce champ ne suit PAS le rang gagnant.** Les trois précédents sont portés par le gagnant (`calendar-month-view.ts:152-158`) ; celui-ci est rendu **quel que soit** le gagnant, séance et vote compris. C'est littéralement l'AC2, et c'est tout l'intérêt de la séparation (`EXPERIENCE.md:310`).
- Il **est** gouverné par sa couche : `active.has('disponibilite-groupe')` ⇒ sinon `null`. Même gouvernance que `pollVote` (`day-detail.utils.ts:238`).

---

## 🚨 Encadré n°3 — LA COUCHE ALLUMÉE INTERDIT LA FUSION DES BANDES

La 36.2 fusionne les trois bandes d'un jour « uniforme » en une seule (`calendar-month-view.html`, bloc `@if (cell.uniform)`). **Une bande fusionnée ne peut pas porter trois jauges** — elle en porterait une, pour trois créneaux dont les disponibilités diffèrent : un mensonge à l'écran.

`bandsAreUniform()` a été écrite en prévision, et son commentaire nomme cette story (`day-detail.utils.ts:257-260`) :

> *« la story 36.8 devra y ajouter sa propre condition (la couche « disponibilité du groupe » allumée impose trois bandes, une jauge par créneau) — **elle le fera au point d'appel, sans toucher à celle-ci**. »*

⇒ `calendar-month-view.ts:162` devient `uniform: bandsAreUniform(previewDetail ?? detail) && !hasGroupChannel(detail)`, où `hasGroupChannel` vaut « au moins un des trois créneaux porte un `group` non nul ».

La planche contractuelle le prouve indépendamment : `contrat-ui-calendrier.html:788` — `if(uni(day)&&!g&&!mjm)`. **Le jour uniforme n'existe pas quand la couche de groupe est allumée.**

---

## 🚨 Encadré n°4 — LES DEUX VIDES, ET LE PIÈGE DE LA PLANCHE

AC6, et `EXPERIENCE.md:308` :

| État | Rendu | Dérivation depuis `AggregatedSlotDto` |
| --- | --- | --- |
| Tout le monde est bloqué | Jauge **pleine**, en `--color-unavailable` | `unavailable === total && total > 0` |
| Personne de disponible **et** personne ne s'est prononcé | Jauge **vide** (le fond gris seul) | `available === 0 && unavailable === 0` |
| Cas courant | Remplie par le bas à `available / total`, en `--color-available` | — |

🚨 **La planche ne rend PAS le premier cas.** Le CSS `.gauge.blocked i{background:var(--color-unavailable)}` existe (`contrat-ui-calendrier.html:105`) mais la fonction `gauge()` qui l'alimente **n'émet jamais la classe `blocked`** (`:765-770`) : elle ne connaît que « vide » et « proportionnelle ». **La prose gagne** — `EXPERIENCE.md:308` et `DESIGN.md` §7.9 bis le spécifient tous deux, et c'est un AC. Implémenter les trois états, pas les deux dessinés.

🚨 **Le troisième cas ambigu, qu'aucun document ne tranche :** `available === 0 && unavailable > 0 && unavailable < total` (personne de libre, une partie du groupe bloquée, le reste muet). Décision de cette story : **jauge vide** — la règle « pleine en rouge » est réservée à `unavailable === total`, littéralement « tout le monde est bloqué ». Le nom accessible, lui, dit toujours les trois nombres : c'est là que la nuance vit.

🚨 **Ne jamais laisser la couleur seule porter la différence entre les deux vides** (P-1). La jauge est un `role="img"` avec un `aria-label` complet — patron `PollTrack` (`poll-track.ts`, bloc « Accessibilité (AC14) »), à reprendre tel quel.

---

## 🚨 Encadré n°5 — LE CONTRAT DOM DU GLISSEMENT, QUE RIEN NE TESTE

Rappel des stories 36.6 et 36.13 : le hit-test du glissement fait `elementFromPoint(...).closest('[data-cell-date]')`. **Le hit-test est stubbé en jsdom : une régression ici ne serait vue par AUCUN test.**

Trois règles, non négociables :
1. Tout nœud ajouté reste **descendant** de `.band` (Mois) / `.slot-cell` (Semaine), qui portent `data-cell-date`.
2. L'hôte du composant porte **`pointer-events: none`** — exactement comme `poll-track.scss:14`.
3. **Aucun gestionnaire de pointeur, aucun `tabindex`, aucun bouton** sur la jauge. Elle est un affichage, pas une cible.

🚨 **Le seul changement structurel autorisé sur la bande : `.band { position: relative }`.** La jauge est `position:absolute; right:2px; top:2px; bottom:2px` (`contrat-ui-calendrier.html:102`) et `.band` n'est **pas** positionnée aujourd'hui (`calendar-month-view.scss:184-194`) — sans cette ligne la jauge se positionnerait par rapport à la case, voire à la grille. `.band` a déjà `overflow: hidden`, la jauge n'en débordera pas.

Le test de non-régression existant (`track.closest('[data-cell-date]') === cell`, sans stub d'`elementFromPoint`) doit rester vert **et** gagner son équivalent pour la jauge.

---

## 🚨 Encadré n°6 — LA PLAGE : en vue Semaine, la couche est muette dès qu'on navigue

`loadHeatmap(id, centerDate)` couvre exactement la grille de 6×7 jours d'un mois (`monthGridRange`, `calendar-view.ts:1176-1186`). Elle est appelée au montage (`:653`), à `onSearch()` (`:1124`) et à `onMonthDateChange()` (`:906`).

🚨 **`onWeekDateChange()` ne la rappelle JAMAIS en contexte de partie** (`calendar-view.ts:914-928` : la seule branche de rechargement est gardée par `if (!this.partieId())`, et rien ne lui répond côté partie). Aujourd'hui c'est sans conséquence visible — la couche n'est pas dessinée dans la grille. **Dès cette story, naviguer de deux semaines fait disparaître la jauge sans rien dire**, alors que `EXPERIENCE.md:304` dit « Toutes les vues de grille ».

⇒ `onWeekDateChange()` doit appeler `loadHeatmap(id, d)` en contexte de partie, symétriquement à `onMonthDateChange()`. `monthGridRange(d)` couvre largement la semaine de `d` (42 jours autour du mois de `d`), et **reste sous le plafond serveur de 45 jours** (`parties.service.ts:1073`). Ne pas inventer une seconde plage.

*Effet de bord accepté : deux navigations de semaine à l'intérieur du même mois rechargent la même plage. C'est le comportement déjà toléré de `onMonthDateChange`, et le coût est une requête déjà bornée.*

---

## 🚨 Encadré n°7 — ⚠️ AC7 CONTRE AC3 : les noms dans le rail, et pour qui

L'AC7 dit « le rail **nomme les membres et leur statut, quel que soit le rôle** ». Plusieurs sources le contredisent, dont deux **de la même story** :

- **AC3 de cette story** : « je vois une jauge […] **et aucune identité n'est exposée** » (joueur).
- **AC9 de cette story** : « Fenêtres de la destinée » liste « les membres **nommément pour le MJ** » et « des compteurs **sans identité** pour un joueur ».
- **`EXPERIENCE.md:102`** (table des rôles) : joueur = « disponibilité du groupe **en compteurs anonymes** » ; MJ = « **par membre, nommément** ».
- **`contrat-ui-calendrier.html:465`** : « Là où le MJ voit quatre pastilles nommables par leur position, **le joueur voit un niveau**. »
- **`iteration-groupe-participation-filtres.html:266`** : « au-delà de six, on retombe sur la jauge **et le rail donne les noms** » — écrit dans la **section MJ**, comme le repli du MJ.

⚠️ **Tranché : le rail nomme les membres POUR LE MJ. Pour un joueur, il donne les mêmes compteurs sans identité.** L'expression « quel que soit le rôle » de l'AC7 s'entend comme *quelle que soit la vue et quelle que soit la largeur* (le rail est la lecture longue à toutes les densités), pas comme une levée de l'anonymat que trois documents et deux AC de la même story imposent.

**Ce n'est pas seulement une lecture de texte : c'est la seule qui soit implémentable.** Le serveur ne sert aucune identité à un joueur — ni par `heatmap` (agrégé), ni par `available-slots` (agrégé pour un non-MJ, `parties.service.ts:1029-1039`). Lui en servir serait une **exposition de données nouvelle**, un changement de politique de confidentialité (AD-9), et sortirait de très loin du périmètre d'une story de lisibilité.

*Question posée à l'utilisateur en fin de story.*

---

## 🚨 Encadré n°8 — CE QUI EXISTE DÉJÀ ET NE DOIT PAS ÊTRE RÉÉCRIT

| L'AC | Ce qui le sert déjà | Ce qui reste à faire |
| --- | --- | --- |
| **AC8** — couche absente du calendrier personnel | `defaultLayersForContext()` et `availableLayerKeys()` la retirent hors partie (`calendar-view.ts:174-185`) ; `MeCalendarDto` ne la porte **jamais** (`shared/index.ts:688-698`, testé côté API `availability.service.spec.ts:1808`) | **Rien.** Un test de non-régression, et ne rien casser |
| **AC9** — « Fenêtres de la destinée » nomme pour le MJ, compte pour le joueur | `AvailableSlotsPanel` rend `CreneauCard` quand `'members' in slot` (noms + statut + alertes) et `AggregatedCreneauCard` sinon (compteurs seuls) — `available-slots.ts:56`, `creneau-card.html`, `aggregated-creneau-card.html` | **Rien.** Un test de non-régression. ⚠️ **Ne pas refondre ce panneau** : `EXPERIENCE.md:312` dit qu'il *conserve sa place* et devient la lecture longue |
| Le compteur textuel du groupe en Agenda | `calendar-view.ts:383-392` construit déjà les entrées `disponibilite-groupe` | Rien — sauf leur donner la charge utile structurée (Task 2) |
| La bascule de couche, son libellé, sa persistance | `calendar-layer-toggle`, `tones.ts:301/594/887` | **Rien.** Aucune clé de ton nouvelle attendue |

🚨 **Deux AC sur neuf sont donc déjà acquis.** Les rouvrir serait le « wheel reinvention » le plus coûteux de cette story.

---

## 🚨 Encadré n°9 — LA FORME SUIT LA DONNÉE, JAMAIS UN DRAPEAU DE RÔLE

`isMjMode()` dérive de la **route** (`calendar-view.ts:234` : `mode() === 'mj'`), pas du rôle réel sur la partie. C'est déjà le motif pour lequel `mjSlots` teste la **forme** de la donnée et non le mode : `this.availableSlots().filter((s): s is AvailableSlotDto => 'members' in s)` (`calendar-view.ts:561-563`).

⇒ **Règle de cette story :** on rend des pastilles **si et seulement si** le créneau porte une liste de membres, et que sa longueur est **≤ 6**. Sinon, jauge. Jamais `if (isMjMode())`.

Conséquences, toutes voulues :
- Le serveur reste **la seule** autorité sur qui voit les identités (garde `isMj`, `parties.service.ts:1057`).
- Le seuil de 6 (AC5) est évalué sur la **longueur reçue**, ce qui le rend juste par construction.
- Un MJ dont la route dirait « joueur » verrait les pastilles s'il en a le droit — cohérent, et déjà le comportement de `mjSlots`.

---

## Acceptance Criteria

Les neuf premiers sont ceux d'`epics.md` (Story 36.8), **verbatim**. Les suivants sont ajoutés par cette story et portent leur motif.

**AC1 — Un canal distinct du fond**
**Given** la couche « disponibilité du groupe » active
**When** une bande est rendue
**Then** la disponibilité du groupe s'affiche sur un **canal distinct** du fond de la bande
**And** elle n'entre jamais dans l'arbitrage de préséance

**AC2 — Elle survit à un objet posé**
**Given** une bande portant une séance ou un vote
**When** la couche est active
**Then** la disponibilité du groupe y reste visible

**AC3 — Le joueur voit un niveau, pas des gens**
**Given** je suis joueur
**When** la couche est active
**Then** je vois une **jauge** remplie à proportion des membres disponibles
**And** aucune identité n'est exposée

**AC4 — Le MJ voit la troupe, dans un ordre fixe**
**Given** je suis le MJ et la partie compte au plus six membres
**When** la couche est active
**Then** je vois **une marque par membre**, dans un ordre fixe
**And** la position identifie la personne, la couleur son statut

**AC5 — Au-delà de six, retour à la jauge**
**Given** une partie de plus de six membres
**When** je suis le MJ
**Then** l'affichage retombe sur la jauge

**AC6 — Les deux vides ne se ressemblent pas**
**Given** un créneau où personne n'est disponible et où personne ne s'est prononcé
**When** il est comparé à un créneau où tout le monde est bloqué
**Then** les deux se distinguent visuellement

**AC7 — Le rail donne les noms**
**Given** le rail de détail
**When** un jour est affiché
**Then** il nomme les membres et leur statut, quel que soit le rôle
*⚠️ Mise en œuvre (encadré n°7) : **noms pour le MJ, compteurs sans identité pour un joueur**. « Quel que soit le rôle » s'entend « à toutes les largeurs et dans les deux vues » — le rail porte la lecture longue pour tout le monde, il n'expose d'identités qu'à qui le serveur en sert.*

**AC8 — Absente du calendrier personnel**
**Given** le calendrier personnel
**When** il est affiché
**Then** cette couche en est absente
*Déjà acquis (encadré n°8) — à protéger par un test, pas à réimplémenter.*

**AC9 — « Fenêtres de la destinée » garde sa lecture longue**
**Given** la section « Fenêtres de la destinée »
**When** elle est affichée
**Then** elle liste les membres nommément pour le MJ
**And** des compteurs sans identité pour un joueur
*Déjà acquis (encadré n°8) — à protéger par un test, pas à réimplémenter.*

**AC10 — La couche éteinte ne laisse rien**
**Given** la couche « disponibilité du groupe » éteinte
**When** la grille et le rail sont rendus
**Then** **aucune** jauge, **aucune** pastille, **aucune** marge réservée ne subsiste
**And** un jour uniforme retrouve sa bande fusionnée
*Motif : la couche est gouvernée comme `pollVote` (encadré n°2), et la fusion de bandes dépend d'elle (encadré n°3). Une marge droite orpheline serait un décalage visible sur toute la grille.*

**AC11 — La couche allumée impose trois bandes**
**Given** un jour dont les trois créneaux portent le même rang et aucun événement
**When** la couche est active
**Then** la case rend **trois** bandes, chacune avec sa propre marque de groupe
**And** elle ne fusionne pas
*Motif : encadré n°3 — une bande fusionnée porterait une seule marque pour trois créneaux dont les données diffèrent.*

**AC12 — Le glissement n'est pas touché**
**Given** une cellule de Semaine ou une bande du Mois portant une marque de groupe
**When** le glissement de sélection la traverse
**Then** il continue de fonctionner à l'identique
**And** aucun nœud inséré ne capte le pointeur
*Motif : encadré n°5 — le hit-test est stubbé en jsdom, aucun test ne verrait la régression.*

**AC13 — La couche suit la plage affichée, dans les deux vues**
**Given** la vue Semaine et la couche active
**When** je navigue vers une autre semaine
**Then** la disponibilité du groupe reste servie pour les jours affichés
*Motif : encadré n°6 — `onWeekDateChange()` ne recharge rien en contexte de partie aujourd'hui.*

**AC14 — Un joueur ne reçoit aucune identité, jamais**
**Given** un membre non-MJ
**When** il appelle `GET /parties/:id/heatmap`
**Then** la réponse **ne porte aucun champ nominatif**
**And** aucune surface front ne peut en dériver un nom
*Motif : encadré n°1 — le champ ajouté est le seul point du projet où une identité pourrait fuiter par erreur de garde. C'est l'AC de sécurité de cette story.*

**AC15 — Le canal se dit en toutes lettres**
**Given** une jauge ou une rangée de pastilles
**When** un lecteur d'écran l'annonce
**Then** elle dit le créneau, le nombre de disponibles sur l'effectif, et le nombre d'indisponibles
**And** aucune information n'y repose sur la seule couleur
*Motif : la jauge code par la **proportion** et les pastilles par la **position** — sans texte, ni l'une ni l'autre n'existe pour un lecteur d'écran (même raisonnement que `PollTrack`, AC14 de la 36.6).*

**AC16 — Un seul point de dérivation**
**Given** la case du Mois, la cellule de Semaine et le rail
**When** ils affichent le même créneau
**Then** ils tirent la disponibilité du groupe de **`buildDayDetail()`**, et d'aucune autre source
*Motif : doctrine du projet (AD-12, AD-19). La 36.6 a payé le prix d'une dérivation dupliquée ; la 36.2 a été écrite pour qu'un seul endroit arbitre le créneau.*

---

## Tasks / Subtasks

### 0. Baseline
- [x] `git status` propre, `git log -1` = `d9038e4`. **Mesurer la baseline avant toute modification** : API suites/tests, web fichiers/tests, `pnpm lint` web, `pnpm typecheck` API. *Repères de la 36.7 : reconfirmer, ne pas recopier.* → **Mesuré : API 60 suites / 1300 tests, typecheck propre ; web 106 fichiers / 1859 tests ; lint web 143 problèmes** (identique au repère 36.6/36.7).
- [x] Context7 (MCP) : rien de framework-neuf ici (aucun overlay, aucune API CDK). **À consulter seulement** si une signature Prisma ou Angular est en jeu. → *Non consulté : aucune API nouvelle. `orderBy` Prisma et `input()`/`computed()` Angular sont déjà employés partout dans le dépôt.*

### 1. Serveur — les deux diffs de l'encadré n°1 (AC4, AC14)
- [x] `packages/shared/src/index.ts` — `AggregatedSlotDto` gagne `members?: { userId; pseudo; displayName; status: SlotStatus }[]`, **optionnel**, avec le commentaire disant *pour le MJ uniquement, absent (jamais `[]`) pour un joueur*. Réutiliser la forme exacte de `AvailableSlotDto.members` — **ne pas en écrire une seconde**. → *Forme extraite en `SlotMemberDto`, désormais partagée par les deux DTO : la contrainte « ne pas en écrire une seconde » est tenue par le compilateur, pas par la discipline.*
- [x] `parties.service.ts` — `getHeatmap()` : conserver les identités déjà calculées et ne les joindre **que si `isMj`** (la variable existe, `:1057`). Ne pas déplacer la garde, ne pas la dupliquer. → *Spread conditionnel : la clé est **omise** pour un joueur, elle n'est ni `[]` ni `undefined`.*
- [x] `parties.service.ts` — `resolveParticipants()` : `orderBy: { joinedAt: 'asc' }` sur `membership.findMany`, avec le commentaire disant que **la position identifie la personne** côté calendrier. Vérifier qu'aucun test existant n'assertait l'ordre inverse. → *Aucun test ne l'assertait ; les 60 suites restent vertes.*
- [x] Tests API : le MJ reçoit `members` dans l'ordre `[MJ, …membres par joinedAt]` ; **un joueur ne reçoit PAS la clé** (`hasOwnProperty` faux — patron d'`availability.service.spec.ts:1808`) ; un non-membre reste en `403`. → *3 tests ajoutés. L'appariement identité ↔ statut est vérifié, pas seulement la présence d'une liste. Le `403` non-membre était déjà couvert par la garde partagée.*
- [x] 🚨 `git status` : **exactement deux fichiers** hors `apps/web`. Aucune migration. → *`packages/shared/src/index.ts` + `apps/api/src/parties/parties.service.ts` (+ son `.spec.ts`). Aucune migration.*

### 2. Le point unique de dérivation (AC1, AC2, AC16, encadré n°2)
- [x] `group-availability.utils.ts` (ou l'ajout dans `poll-track.utils.ts`) — type `GroupAvailability { available; unavailable; unknown; total; members: GroupMember[] | null }` + les fonctions pures : `groupFillRatio()`, `groupIsAllBlocked()`, `groupAriaLabel()`. *Fonctions pures + spec dédiée : patron `poll-track.utils.ts`.* → *Fichier frère retenu. Plus `showsMemberPastilles()`, `memberStatusWord()`, `groupCounterLabel()` et `GROUP_PASTILLE_MAX`. 18 tests.*
- [x] `calendar-agenda-view.ts` — `AgendaEntry` gagne `group?: GroupAvailability`, renseigné pour les seules entrées `disponibilite-groupe`. **Ne jamais le verser dans `detail`**, qui porte déjà trois usages.
- [x] `calendar-view.ts:383-392` — renseigner `group` sur les entrées construites depuis `heatmap()`. ⚠️ **Retirer le `continue`** → *retiré ; le filtre est passé dans `agendaEntries()`, à l'affichage. Un test prouve les deux moitiés : le créneau muet atteint `calendarEntries()` et n'atteint pas `agendaEntries()`.*
- [x] `day-detail.utils.ts` — `DaySlotDetail` gagne `group: GroupAvailability | null`, dérivé dans `buildDayDetail()`, gouverné par `active.has('disponibilite-groupe')`. **Hors de la chaîne `winner`** : aucun `SlotWinner` nouveau, `SLOT_PRECEDENCE` intact.
- [x] Spec de `day-detail.utils` : le `group` survit à un `winner` `'seance'` **et** `'vote'` (AC2) ; il disparaît couche éteinte (AC10) ; `FULL_DAY` couvre les trois créneaux. → *+8 tests, dont un qui vérifie que le jour ne devient pas « porteur » (`isEmpty` reste vrai).*

### 3. Le composant de canal (AC1, AC3, AC4, AC5, AC6, AC15)
- [x] Nouveau `apps/web/src/app/features/calendar/group-gauge/` — **rendu pur**, `input.required<GroupAvailability>()`, aucun service, aucun output. Patron **`PollTrack`** à la lettre.
- [x] Deux formes, choisies **par la donnée** (encadré n°9) : `members !== null && members.length <= 6` ⇒ pastilles ; sinon jauge. → *`showsMemberPastilles()`, qui exclut aussi la liste vide.*
- [x] Styles repris **au pixel** de `contrat-ui-calendrier.html:101-111`.
- [x] Les **trois** états de l'encadré n°4, dont `blocked`, que la planche ne dessine pas.
- [x] 🚨 `:host { pointer-events: none }` (encadré n°5).
- [x] Spec dédiée : les trois états de jauge, le basculement à 6 et à 7 membres, l'ordre des pastilles préservé tel que reçu, le nom accessible complet dans les trois états. → *14 tests, dont un qui compare le DOM des deux vides et un qui interdit tout `NaN` dans un `style`.*

### 4. Les trois surfaces de grille (AC1, AC2, AC10, AC11, AC12)
- [x] `calendar-month-view.ts` — `DayBand.group`, **copié sans condition de rang**, avec le commentaire qui dit pourquoi (piège n°1).
- [x] `calendar-month-view.ts` — `uniform: bandsAreUniform(...) && !hasGroupChannel(detail)` (encadré n°3). **`bandsAreUniform()` non touchée.**
- [x] `calendar-month-view.html` — `<app-group-gauge class="in-month" [group]="band.group" />` dans la bande, après la piste.
- [x] `calendar-month-view.scss` — `.band { position: relative }` et `.band--gauge { padding-right: 11px }`, posée **seulement pour la jauge**.
- [x] ➕ **Non prévu par la story, trouvé en écrivant le code** : `.band` porte `role="img"` + `aria-label`, qui **écrase** le nom accessible de `<app-group-gauge>`. `bandAriaLabel()` replie donc le canal, comme la revue de la 36.7 avait dû le faire pour la piste dans le rail. Idem `cellAriaLabel()` en vue Semaine.
- [x] `calendar-week-view` — même ajout dans `.slot-cell`, classe d'hôte `in-week`, `.slot-cell { position: relative }`.
- [x] `calendar-detail-rail` — la lecture longue : noms + statuts pour le MJ, jauge + compteur pour un joueur. **Pas un bouton.** Elle s'ajoute à la valeur existante sans la remplacer.
- [x] `calendar-agenda-view` — l'entrée `disponibilite-groupe` gagne la même forme, en plus de son texte.

### 5. La plage (AC13, encadré n°6)
- [x] `calendar-view.ts` — `onWeekDateChange()` appelle `loadHeatmap(id, d)` en contexte de partie. Aucune plage nouvelle : `monthGridRange` seule.
- [x] Test : navigation de semaine en contexte de partie ⇒ `getHeatmap` rappelé, avec une plage qui couvre bien la semaine visée. *Le test était **rouge** avant le correctif.*

### 6. Tests — Web
- [x] AC1/AC2 : bande `data-winner="seance"` **et** `data-winner="vote"` ⇒ marque présente dans les deux cas (Mois **et** Semaine). *C'est le test qui prouve la story.*
- [x] AC3 : sans `members` ⇒ jauge, aucun nom, aucun `userId` dans le DOM.
- [x] AC4 : une pastille par membre, **dans l'ordre reçu** ; l'ordre d'entrée inversé inverse le rendu (preuve que rien ne re-trie côté front).
- [x] AC5 : 7 membres ⇒ jauge, zéro pastille.
- [x] AC6 : les trois états, distingués **dans le DOM** (`.gg-gauge--blocked`, absence de `.fill`), pas par une couleur calculée.
- [x] AC10 : couche éteinte ⇒ aucun `app-group-gauge`, aucune `.band--gauge`, **et** le jour uniforme redevient une bande unique.
- [x] AC11 : jour uniforme + couche allumée ⇒ **trois** `.band`, chacune avec sa marque.
- [x] AC12 : le test de non-régression du glissement reste vert **sans** être modifié, et gagne son équivalent canal dans les deux vues.
- [x] AC15 : nom accessible complet dans les trois états et dans les deux formes, + le repli dans `bandAriaLabel`/`cellAriaLabel`.
- [x] AC8/AC9 : non-régressions (couche absente et jamais appelée en contexte personnel ; `CreneauCard` MJ / `AggregatedCreneauCard` joueur — **plus un test qui prouve que le discriminant ne se laisse pas tromper par le `members?` optionnel**).
- [x] Fixtures : aucune fixture API n'est tombée (champ optionnel). Côté front, `DaySlotDetail.group` et `DayBand.group` sont requis — aucune fixture n'a eu besoin d'être assouplie.
- [x] Zoneless : boucle de ticks établie, jamais `whenStable()` seul.

### 7. Vérification
- [x] Web **et** API : `pnpm test`, `pnpm lint`, `pnpm typecheck`. → **API 60 suites / 1303 tests** (baseline 1300), **web 108 fichiers / 1932 tests** (baseline 106/1859), **lint web 143 = baseline** (monté à 149, ramené à 143), **typecheck API propre**. Lint API inchangé sur les fichiers touchés (0 finding dans le bloc ajouté).
- [x] ✅ **VÉRIFICATION VISUELLE RÉELLE FAITE**, dans Chrome (session de test de l'utilisateur), partie « Les Veilleurs du Pont » en mode MJ. 🚨 **Elle a trouvé un défaut qu'aucun test n'a vu** — voir la note 1 ci-dessous. Constaté ensuite :
  - **AC2 mesuré sur la grille réelle** : `seance 1/1`, `available 27/27`, `unavailable 18/18`, `none 80/80` — **126 bandes sur 126 portent le canal**, quel que soit leur rang ;
  - **AC4** : pastilles dans l'ordre de la troupe, MJ en tête, ordre identique sur les 9 créneaux du payload ;
  - **AC7** : le rail dit « Disponibilité du groupe : 2 sur 2 disponibles — Diane disponible, Alice disponible » ;
  - **AC10** : couche éteinte ⇒ 0 canal, 0 `.band--gauge`, et la fusion revient (44 bandes / 41 fusionnées, contre 126 allumée) ;
  - **AC11** : 3 bandes et 6 pastilles sur **tous** les jours, y compris ceux qui auraient fusionné ;
  - **AC13** : 5 semaines en avant (21–27 sept., hors grille d'août) ⇒ **21/21 cellules portent encore le canal**. Sans le correctif : 0 ;
  - **AC12 prouvé par un hit-test RÉEL** (`elementFromPoint` au centre d'une pastille) ⇒ renvoie `.slot-cell`, pas la jauge. Meilleure preuve que n'importe quel test jsdom, où le hit-test est stubbé ;
  - **case étroite** : le libellé de la cellule fait 40,6 px pour 69 px de texte — **identique couche allumée et éteinte**. La troncature est préexistante (panneau ouvert, cellule à 48 px), le canal ne coûte aucune largeur.
  - ⚠️ **Non vérifié à l'œil** : les deux vides côte à côte et la vue joueur (jauge anonyme) — ce compte est MJ d'une seule partie à 2 membres, donc toujours en pastilles. Couverts par 6 tests, la revue de sécurité et la garde `isMj` tracée, mais **pas vus**.
- [x] `/security-review` — **lancée**. Aucune vulnérabilité HIGH ni MEDIUM. Chaîne d'autorisation tracée maillon par maillon (`@CurrentUser()` → session, garde `403` inchangée, `isMj` non dupliqué, clé omise pour un joueur). Dette de `/security-review` ouverte depuis la 36.4 : **refermée**.
- [x] `/code-review` — lancée (bmad-code-review, 2026-08-22). Revue à trois couches (Blind Hunter, Edge Case Hunter, Acceptance Auditor) sur le diff non committé vs baseline `d9038e4`. 4 patch, 0 decision-needed, 3 defer, 7 rejetés comme bruit. Voir « Review Findings » ci-dessous.
- [x] `deferred-work.md` — 7 entrées consignées.
- [x] `git add` — **non fait, et c'est la contrainte, pas un oubli** : l'override `_bmad/custom/bmad-dev-story.user.toml` interdit `git add`/`git commit` à l'agent. Un message de commit a été écrit dans `.git/commit-template.txt`. 🚨 **6 fichiers neufs sont en `??`/staged** (cf. File List) — les ajouter avant de committer, sinon le dépôt ne compile pas pour un clone frais (l'erreur de la 36.6).

### Review Findings

- [x] [Review][Patch] `group-gauge.ts` lie la classe d'hôte `gg--pastilles` (`pastilles() !== null`) mais aucune règle SCSS ne la cible — hook de style mort/non implémenté [apps/web/src/app/features/calendar/group-gauge/group-gauge.ts:55] — **corrigé** : liaison d'hôte inutilisée retirée.
- [x] [Review][Patch] `resolveParticipants()` trie par `orderBy: { joinedAt: 'asc' }` sans clé de départage — deux membres au même timestamp (invitations groupées) peuvent permuter d'une requête à l'autre, contredisant « la position identifie la personne » [apps/api/src/parties/parties.service.ts:870] — **corrigé** : `orderBy: [{ joinedAt: 'asc' }, { userId: 'asc' }]`.
- [x] [Review][Patch] Les appels à `loadHeatmap()` (montage, `onSearch`, changement de mois/semaine) ne sont pas séquencés — une navigation rapide peut laisser une réponse `getHeatmap` périmée écraser une réponse plus récente [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:1176-1238] — **corrigé** : jeton de requête incrémental `heatmapReqId`, même patron que `meCalendarReqId`.
- [x] [Review][Patch] `loadHeatmap()` n'a aucune gestion d'échec — si l'appel réseau échoue après un chargement précédent réussi, l'écran garde silencieusement la couche de groupe périmée, sans indication [apps/web/src/app/features/calendar/calendar-view/calendar-view.ts:1232-1238] — **corrigé** : un échec vide désormais la couche (`heatmap.set([])`) plutôt que de laisser une donnée périmée.
- [x] [Review][Defer] `isNamedSlot(s) = !('total' in s)` (available-slots.ts) n'a aucune garde avant d'accéder à `s.members` si un payload malformé ne portait ni `total` ni `members` [apps/web/src/app/features/calendar/available-slots/available-slots.ts] — deferred, pre-existing (le typage partagé garantit `total` sur `AggregatedSlotDto` aujourd'hui ; risque théorique, non atteignable par un chemin réel)
- [x] [Review][Defer] `day-detail.utils.ts` : `groupEntry = sameDay.find(...)` prend silencieusement la première correspondance en cas d'entrées `disponibilite-groupe` dupliquées pour le même créneau/jour [apps/web/src/app/features/calendar/day-detail.utils.ts] — deferred, pre-existing (aucun chemin actuel ne produit de doublon ; garde défensive à ajouter si le modèle évolue)
- [x] [Review][Defer] ~~`.grp__m[data-status='UNKNOWN']` n'a aucune règle de couleur explicite~~ — **entre-temps résolu** par le point 341 ci-dessous (colorisation des noms), qui ajoute une règle `UNKNOWN` explicite ; conservé ici pour la traçabilité de la revue.

### Amélioration demandée par l'utilisateur (hors findings de revue, appliquée dans la même passe)

Constat de l'utilisateur : sous 500 px, le rail perdait TOUTE information de disponibilité (le mot de statut disparaissait et rien ne le remplaçait). Décision : coloriser le nom du membre lui-même par statut (rouge/vert/gris — même logique que les pastilles des autres surfaces), pour un lien visuel direct et un gain de place. Pour ne pas retomber dans le piège que P-1 interdit déjà ailleurs dans cette story (jamais la seule couleur), un glyphe court (D/I/?) double désormais le nom colorisé sous 500 px, à la place du mot entier — `memberStatusGlyph()` dans `group-availability.utils.ts`, rendu via `.grp__g` dans `calendar-detail-rail`. Le nom accessible (`groupLabel()`/`aria-label`) est inchangé.

**Rejetés comme bruit (7)** : le zip positionnel `participants`/`statuses` dans `getHeatmap()` (même `.map()`, aligné par construction) ; `hasGroupChannel()` désactivant la fusion du jour entier (comportement spécifié à l'encadré n°3/AC11) ; le masquage du mot de statut sous 500 px dans le rail (le mot coloré disparaît entièrement, ce n'est pas « couleur seule », et c'est un compromis documenté calqué sur la 36.2/AC11 — le nom accessible n'est pas affecté) ; l'`orderBy` partagé de `membership.findMany` affectant d'autres appelants (vérifié intentionnel, même clé que `listMembers()`) ; `groupAriaLabel()` omettant le compte « unknown » dans les cas mixtes (l'AC15 n'exige que les comptes disponible/indisponible) ; la double enveloppe `isNamedSlot`/`isMjSlot` (encapsulation raisonnable, pas une dérive réelle) ; le risque de double annonce `role="img"` imbriqué dans le rail (faux positif — vérifié : les deux branches `@if`/`@else` du template sont mutuellement exclusives).

---

## Hors périmètre

- **Le mode Destinée et le panneau réduit à « qui manque »** → **36.9**.
- **Composer un vote depuis la grille** → **36.10, D-16**.
- **La refonte de l'Agenda** → **36.11** ; **l'Agenda du MJ et le scellement** → **36.12**.
- **La légende** (qui devra décrire la jauge et les pastilles, `EXPERIENCE.md:391`) → **36.14**. Cette story livre le codage ; la légende qui l'explique arrive après. ⚠️ *L'écran doit rester lisible sans elle* — c'est pourquoi l'AC15 exige un nom accessible complet dès maintenant.
- **Refondre « Fenêtres de la destinée »** — elle conserve sa place (`EXPERIENCE.md:312`), AC9 est déjà acquis.
- **Aligner `getMissingVoters()` / `poll-status` sur l'effectif MJ inclus** → dette écrite (`deferred-work.md`).
- **Câbler `GET /me/calendar` sur SSE** → dette écrite. Sans objet ici : la couche de groupe n'existe pas dans le calendrier personnel (AC8).
- **Borner la liste Agenda** → dette écrite, aggravée par la 36.6, **non traitée ici**.
- **Retirer `.seance-dot`, aligner « Soirée » / « Soir »** → dettes de la 36.13.

---

## Ce qui doit continuer de fonctionner

- **La sélection par glissement**, en Mois comme en Semaine : long-press 450 ms, seuil 8 px, `elementFromPoint` + `closest('[data-cell-date]')`, clamp, `suppressNextClick`, `Échap`, `Maj`+flèches, la barre, l'écriture groupée et sa résolution de conflits (36.3, 36.4).
- **Le sélecteur de réponse de vote** et son ordre d'arbitrage du tap (36.7, encadré n°1) — **la jauge n'est pas une cible et ne s'y insère pas**.
- **La piste de participation** et ses quatre surfaces, la densité par `@container` seule, `pointer-events: none`, `data-winner` (36.6).
- **La préséance à quatre rangs** et la fusion des bandes du jour uniforme — sauf couche de groupe allumée (AC11).
- **FR-50** : une séance confirmée rend le créneau indisponible quelle que soit la couche.
- **Le rail permanent** à toutes les largeurs, ses trois lignes toujours rendues, et l'ouverture du scénario depuis une ligne de séance (36.1).
- **Le contrat DOM** : `.slot-cell`, `data-cell-date`, `data-cell-slot`, `.band`, `data-winner`, `.week-grid`, `app-selection-bar`.
- **`GET /me/calendar`** : les 5 couches, aucune clé ajoutée ni retirée.
- **`GET /parties/:id/available-slots`** : sa forme, son plafond de 20, son exclusion du MJ indisponible — **non touchés**. Cette story ne passe **pas** par lui.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Réintroduire le groupe dans `SlotWinner` / `SLOT_PRECEDENCE`.** L'interdiction est écrite dans le code (`day-detail.utils.ts:44`) et c'est la raison d'être de la story.
2. **Porter `group` par le rang gagnant**, comme `text`, `info` et `vote`. Ce serait recopier trois lignes voisines et **détruire l'AC2** — le seul AC qui justifie tout le travail.
3. **Oublier la condition de fusion** (encadré n°3) : une bande unique porterait une marque pour trois créneaux différents.
4. **Oublier `.band { position: relative }`** : la jauge se positionne alors sur la case ou la grille. Visible à l'œil, invisible aux tests.
5. **Oublier `pointer-events: none`** : le glissement casse et **aucun test ne le verra**.
6. **Insérer la jauge hors de `.band` / `.slot-cell`** : le `closest('[data-cell-date]')` ne remonte plus.
7. **Rendre les pastilles sur `isMjMode()`** au lieu de la forme de la donnée (encadré n°9).
8. **Servir `members: []` à un joueur** au lieu d'omettre la clé — AC14.
9. **Déplacer ou dupliquer la garde `isMj`** de `getHeatmap()`. Elle est là, elle est bonne, elle suffit.
10. **Confondre les deux vides** (encadré n°4), ou n'implémenter que les deux états que la planche dessine.
11. **Laisser le `continue` de `calendar-view.ts:384`** qui saute les créneaux sans avis : c'est l'un des deux vides.
12. **Oublier `onWeekDateChange`** (encadré n°6) : la couche devient muette dès la deuxième semaine.
13. **Re-trier les membres côté front.** L'ordre vient du serveur, il est fixe depuis la Task 1, et le re-trier ferait bouger la position d'une personne d'une surface à l'autre.
14. **Refondre « Fenêtres de la destinée »** ou `AvailableSlotsPanel` : AC9 est acquis.
15. **Ajouter une clé de ton.** `account.calendar_layer.disponibilite-groupe` existe dans les trois thèmes. Si une clé manque vraiment, la poser **dans les trois**.
16. **Toucher `available-slots` côté serveur.** Cette story ne l'emprunte pas.
17. **Rendre `DaySlotDetail.group` optionnel** pour éviter de réparer des fixtures — même raisonnement que `membersCount` (36.6) et `partieId` (36.7).
18. **Nommer les membres à un joueur** dans le rail (encadré n°7) : c'est une exposition de données, pas un choix de mise en page.
19. **Faire de la ligne de groupe du rail un bouton** : elle n'ouvre rien, et une affordance qui ne mène nulle part est un piège (règle AC11 de la 36.1).
20. **Oublier `pnpm typecheck` côté API** après un changement de signature partagée.

### Décisions arrêtées par cette story

- **Deux diffs serveur, dans un seul fichier**, plus un champ optionnel dans `packages/shared` (encadré n°1). ⚠️ Écart assumé au « Front » d'`epics.md:1924`.
- **`members` est absent, jamais vide, pour un joueur.**
- **`resolveParticipants()` trie par `joinedAt`** — c'est ce qui rend la position signifiante.
- **`buildDayDetail()` est le point unique**, et `group` y est **frère** de `winner`, pas dérivé de lui.
- **La forme (jauge / pastilles) suit la donnée reçue**, jamais un drapeau de rôle.
- **Trois états de jauge**, dont `blocked`, que la planche ne dessine pas.
- **`available === 0 && 0 < unavailable < total` ⇒ jauge vide** ; le rouge plein est réservé à « tout le monde ».
- ⚠️ **AC7 : noms pour le MJ, compteurs pour un joueur** (encadré n°7).
- **La couche allumée interdit la fusion des bandes**, au point d'appel.
- **`onWeekDateChange` recharge la plage** en contexte de partie.

### Décisions laissées à l'implémentation

- **Où vivent les types et fonctions pures du groupe** : dans `poll-track.utils.ts` (qui deviendrait « utilitaires de couche ») ou dans un `group-availability.utils.ts` frère. *Recommandation : un fichier frère — `poll-track.utils.ts` porte déjà le vote et la 36.7 l'a chargé.*
- **Nom du composant** : `app-group-gauge` proposé, d'après `DESIGN.md` §7.9 bis (« GroupGauge »). *Un seul composant pour les deux formes — jamais deux, même raison que `PollTrack`.*
- **Comment la marge droite est posée** : classe sur `.band` depuis le template, ou `:has()` en CSS. *Recommandation : une classe explicite — `:has()` sur une grille de 126 bandes n'a jamais été mesuré ici.*
- **Comment le rail présente les noms** : une ligne par membre, ou une liste en ligne. *Recommandation : en ligne, repliable — le rail porte déjà trois lignes de créneau et l'AC7 ne demande pas une refonte de sa structure.*

### Notes de plateforme

- **Web** : Angular 22 **zoneless**, Material + CDK 22.0.2, Vitest 4, TypeScript 6.0.2. `@if`/`@for`, signals, `input()`/`output()`, `standalone: true`, `import type` pour `@master-jdr/shared`.
- **API** : NestJS 11, Prisma 7.8.0, Jest 30, TypeScript 5.7.3. **Aucune migration** — aucun champ de base de données n'est ajouté, seuls un `orderBy` et une projection changent.
- **Aucune dépendance nouvelle.**
- **Exécution : tout par Docker.** `docker compose exec api pnpm <…>` / `docker compose exec web pnpm <…>`.
- ⚠️ **`apps/api` : `ts-jest` ne type-check pas cross-file** (`isolatedModules`). Un `pnpm typecheck` API est obligatoire après le changement de `packages/shared`.

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : un écart réel, connu et non soldé ici ; aucun câblage nouveau n'est demandé, mais il doit être dit.**

- **Ce que cette story affiche** vient de `GET /parties/:id/heatmap`, chargé à trois moments seulement : montage, `onSearch()`, changement de mois — et, à partir de cette story, changement de semaine (Task 5). **Il n'est câblé sur aucun signal `changed()`.**
- **La donnée sous-jacente change sans moi** : une déclaration de disponibilité d'un autre membre modifie la jauge de tous les autres. Jusqu'ici l'écart était sans conséquence visible (la couche n'était pas dessinée dans la grille) ; **il devient visible avec cette story** — une jauge peut rester périmée jusqu'au prochain changement de mois.
- **Ce n'est pas un couplage trivial** : `heatmap` n'a pas de signal de domaine dédié, et l'écriture qui l'invalide (`POST /availability`) est faite par **un autre utilisateur** de la partie. Le câbler correctement suppose une émission sur `partieTopic` depuis `AvailabilityService` — une décision d'architecture, pas un branchement.
- **Décision : hors périmètre, consigné dans `deferred-work.md`, à évaluer avec la 36.14** (préférences et couches). Le rechargement de plage de la Task 5 en limite l'effet à un mois.
[Source: CLAUDE.md ; docs/checklist.md]

### Sécurité

- 🚨 **`/security-review` est NON OPTIONNEL sur cet épic** (`epics.md:335`), en dette depuis la 36.4, et **cette story en avait le plus besoin de tout l'épic** : c'est la seule à élargir une réponse serveur avec des **identités d'utilisateurs**.
- **La garde existe déjà** : `getHeatmap()` vérifie `isMj || isMember` puis lève `403` (`parties.service.ts:1057-1059`), et `isMj` est calculé au même endroit. **Ne pas la réécrire, ne pas la déplacer.** L'AC14 la teste.
- **Le champ ajouté est le seul chemin de fuite possible.** Un `members` renvoyé par erreur à un joueur exposerait le `userId`, le `pseudo` et le `displayName` de toute la troupe — des données qu'un joueur peut déjà voir ailleurs (`GET /parties/:id/members` est ouvert aux membres), **mais croisées avec leurs disponibilités**, ce qu'aucune surface ne lui donne aujourd'hui. C'est le croisement, pas l'identité seule, qui est nouveau.
- **Aucune donnée sensible nouvelle n'entre en base.** Aucun champ, aucune migration, aucun index.
- **XSS** : `pseudo` et `displayName` sont rendus par interpolation, comme dans `IdentityLabel`. **Jamais `[innerHTML]`.**
- **Aucune écriture** n'est introduite par cette story. Aucune route de mutation n'est touchée.

### Dette refermée par cette story

- **La couche `disponibilite-groupe` n'était jamais visible dans la grille** — elle existait dans le modèle, la préférence, la bascule et deux listes, sans jamais atteindre la surface qu'on regarde.
- **L'ordre non déterministe de `resolveParticipants()`** — silencieux jusqu'ici, il aurait rendu l'AC4 faux par intermittence.
- **`onWeekDateChange()` ne rechargeait rien en contexte de partie** (encadré n°6).

### Dette explicitement NON refermée

- `heatmap` non câblé sur SSE (ci-dessus).
- `deferred-work.md` — `getMissingVoters()` / `poll-status` sans le MJ ; liste Agenda non bornée ; `GET /me/calendar` sans SSE ; `scenarios.service.ts` sans `displayName` ; les dettes de la 36.13.
- L'écart de la planche sur `.gauge.blocked`, et le cas ambigu tranché en encadré n°4 — à répercuter par `bmad-ux` dans la révision suivante du contrat d'UI.

### Project Structure Notes

**Nouveaux — Web**
- `apps/web/src/app/features/calendar/group-gauge/` — `.ts` / `.html` / `.scss` / `.spec.ts`
- `apps/web/src/app/features/calendar/group-availability.utils.ts` (+ `.spec.ts`) *(ou l'ajout dans `poll-track.utils.ts` — cf. décisions laissées à l'implémentation)*

**Modifiés — Serveur (les seuls)**
- `packages/shared/src/index.ts` — `AggregatedSlotDto.members?`
- `apps/api/src/parties/parties.service.ts` (+ `.spec.ts`) — `getHeatmap()`, `resolveParticipants()`

**Modifiés — Web**
- `calendar/day-detail.utils.ts` (+ `.spec.ts`) — `DaySlotDetail.group`
- `calendar-view/calendar-view.ts` (+ `.html` / `.spec.ts`) — alimentation, `onWeekDateChange`
- `calendar-month-view/` (`.ts` / `.html` / `.scss` / `.spec.ts`) — `DayBand.group`, fusion, `position: relative`
- `calendar-week-view/` (`.ts` / `.html` / `.scss` / `.spec.ts`)
- `calendar-detail-rail/` (`.ts` / `.html` / `.scss` / `.spec.ts`)
- `calendar-agenda-view/` (`.ts` / `.html` / `.spec.ts`) — `AgendaEntry.group`
- fixtures web portant un `DaySlotDetail` / `DayBand`

**Non touchés — à confirmer par `git status` final**
- `apps/api/prisma/**` · `apps/api/src/availability/**` · `apps/api/src/poll/**` · `parties.controller.ts` · `core/poll/poll.service.ts` · `available-slots/**` · `creneau-card/**` · `aggregated-creneau-card/**` · `vote-answer-picker/**` · `poll-track/poll-track.ts` · `selection.utils.ts` · `selection-bar/**` · `conflict-dialog/**` · `constraint-panel/**`

### References

- [Source: **epics.md — Story 36.8**, `:2246-2292`] — les neuf AC, verbatim ; `epics.md:1907` — « FR-53 | 36.8 » ; `epics.md:1924` — portée **Front** (⚠️ encadré n°1) ; `epics.md:335` — **`/security-review` non optionnel sur l'épic** ; `epics.md:1934` — convention de lecture du contrat d'UI.
- [Source: **EXPERIENCE.md §4.3 quater**, `:297-314`] — le canal séparé, la table des rôles, les deux vides, « la jauge survit sous une séance ou un vote », et le statut de « Fenêtres de la destinée » ; **`:253`** — le motif de la sortie de la préséance ; **`:102`** — joueur en compteurs anonymes / MJ nommément ; **`:391`** — la jauge demande la légende (36.14).
- [Source: **DESIGN.md §7.9 bis**, `:337-354`] — la spécification au pixel : 5 px au bord droit, remplissage par le bas, 11 px de marge, pastilles de 7 px, « les noms vivent dans le rail » ; **§7.10 bis** — ce que le rail porte et quand.
- [Source: **contrat-ui-calendrier.html:101-111**] — le CSS de la jauge et des pastilles ; **`:765-773`** — la fonction de rendu (et son absence de `.blocked`) ; **`:788`** — `uni(day)&&!g&&!mjm` ; **`:465`** — « le serveur le fait déjà » (⚠️ à moitié vrai) ; **`:713`** — « Jauge de groupe / pastilles par membre — **neuves** ».
- [Source: **iteration-groupe-participation-filtres.html**, section 2] — les quatre cas de jauge dessinés, la vue MJ à quatre pastilles, « au-delà de six, on retombe sur la jauge et le rail donne les noms ».
- [Source: `day-detail.utils.ts:44-46`] — l'interdiction de réintroduire le groupe dans la préséance ; **`:257-260`** — la condition de fusion, écrite en prévision de cette story ; **`:118`** — `entryCoversSlot`.
- [Source: `parties.service.ts:857-897`] — `resolveParticipants()` et son absence d'`orderBy` ; **`:899-1039`** — `getAvailableSlots()`, son filtre MJ, son plafond de 20, sa bascule `isMj` ; **`:1041-1100`** — `getHeatmap()`, sa garde et son agrégation.
- [Source: `participant-count.util.ts`] — « effectif = le MJ + ses `Membership` », tranché le 2026-08-20 ; **`listMembers()` ne renvoie pas le MJ** (`deferred-work.md`).
- [Source: `36-6-la-piste-de-participation-dun-vote.md`] — le composant unique pour les quatre surfaces, `pointer-events: none`, les règles CSS qui doivent vivre dans le composant, le nom accessible complet.
- [Source: `36-7-le-selecteur-de-reponse-de-vote.md`] — l'ordre d'arbitrage du tap, le contrat DOM du glissement que rien ne teste, la discipline « requis, jamais optionnel ».
- [Source: `36-2-la-case-du-mois-trois-bandes-et-la-preseance.md` + `calendar-month-view.ts:140-165`] — le rang gagnant porte `text`/`info`/`vote`, et pourquoi le groupe ne doit **pas** suivre cette règle.
- [Source: `36-1-le-rail-de-detail.md`] — le rail permanent, rendu pur, trois lignes toujours, ligne activable réservée.
- [Source: `shared/index.ts:32-50`, `:602-616`, `:688-698`] — les six couches, `AvailableSlotDto` / `AggregatedSlotDto`, l'absence de `disponibilite-groupe` dans `MeCalendarDto`.
- [Source: docs/checklist.md ; CLAUDE.md] — évaluation SSE obligatoire, `/security-review` et `/code-review`, tout par Docker, Context7 avant du code framework.

---

## Questions pour l'utilisateur

1. ⚠️ **La story sort du « Front »** (encadré n°1). L'AC4 — une marque par membre pour le MJ, sur la grille — exige deux diffs serveur : un champ `members` optionnel sur `AggregatedSlotDto`, servi **au seul MJ** par `GET /parties/:id/heatmap`, et un `orderBy: { joinedAt: 'asc' }` sur `resolveParticipants()`. Aucune migration, aucun endpoint neuf, ~15 lignes en tout. **Confirmes-tu ce périmètre**, ou préfères-tu la variante strictement front (le MJ retombe toujours sur la jauge, l'AC4 étant alors reporté à une story serveur dédiée) ?
2. ⚠️ **L'AC7 contre l'AC3** (encadré n°7). J'ai tranché : le rail **nomme** les membres pour le MJ, et donne des **compteurs sans identité** à un joueur — l'inverse serait une exposition de données nouvelle (les disponibilités de chacun, nommément), que trois documents et l'AC3 de cette même story interdisent, et que le serveur ne sert pas. **À confirmer.**
3. **La marge droite de 11 px** que la jauge impose à chaque bande ampute d'autant le titre en case étroite (~115 px). Le contrat la prescrit (`contrat-ui-calendrier.html:106`). Je la pose telle quelle et je la fais regarder à la vérification visuelle — **si le titre devient illisible, préfères-tu que la jauge se superpose au bord de la bande sans marge, ou que le titre cède ?**

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story, 2026-08-22)

### Debug Log References

- Baseline mesurée sur `d9038e4`, arbre propre : API 60 suites / 1300 tests, typecheck propre ; web 106 fichiers / 1859 tests ; lint web 143.
- Cycle red-green tenu sur les trois points où il avait du sens : les 2 tests serveur de l'AC4 (rouges avant le diff `parties.service.ts`), le champ `group` de `DaySlotDetail` (rouge au compilateur), l'AC13 (`expected 1 to be 2` avant le correctif de `onWeekDateChange`).
- Lint web monté à 149 après l'implémentation, ramené à 143 (baseline) : 5 corrections Prettier sur les fichiers neufs + une variable `fixture` inutilisée.

### Completion Notes List

**1. 🚨 LE DÉFAUT QUE SEULE LA VÉRIFICATION VISUELLE A VU — et il n'était pas dans le code.** Au premier passage dans Chrome, le rail affichait la **jauge anonyme et « 2 / 2 »** là où un MJ doit voir des noms, et les bandes des pastilles grises. Tout le front était pourtant juste. Cause : **le serveur API tournait depuis 9 h 24, mon diff datait de 10 h 45 — le watcher `nest start --watch` ne l'avait pas repris** (montage de volume Windows). `docker compose restart api` a suffi, et tout est apparu d'un coup. Aucun test ne pouvait le voir : les 1303 tests API s'exécutent sur le code source, pas sur le processus qui sert. **À retenir pour les prochaines stories touchant `apps/api` : redémarrer le conteneur avant toute vérification visuelle, sinon on débogue un front correct contre un serveur périmé.**

**2. La story n'était pas « Front », et le code l'a confirmé plus durement que prévu.** Les deux diffs serveur annoncés (encadré n°1) ont suffi, mais un troisième effet a été révélé **par le compilateur** : ajouter `members?` à `AggregatedSlotDto` casse le discriminant `'members' in s`, employé à quatre endroits pour séparer la vue MJ de la vue joueur. `s.members` devenait `possibly undefined`. Corrigé par `isNamedSlot()`, qui discrimine sur l'**absence d'agrégats** (`!('total' in s)`) — un discriminant qu'un champ facultatif ne peut plus rendre ambigu. Trois tests le verrouillent, dont un qui passe exactement la forme « agrégats + identités » que sert désormais le heatmap.

**3. `resolveParticipants()` n'avait pas d'`orderBy`.** Écart silencieux jusqu'ici : personne ne dépendait de l'ordre. L'AC4 en dépend entièrement (« la position identifie la personne »), et deux requêtes successives pouvaient permuter deux membres. Une ligne, `orderBy: { joinedAt: 'asc' }`, alignée sur `listMembers()` qui l'avait depuis toujours. Vérifié sur le payload réel : ordre identique sur les 9 créneaux.

**4. Le canal ne suit PAS le rang gagnant — et c'est le seul endroit où l'implémentation résiste à sa propre lecture.** Dans `calendar-month-view.ts`, `text`, `info` et `vote` sont chacun conditionnés par `s.winner === …` sur trois lignes consécutives ; `group` vient juste après et ne l'est pas. C'est l'AC2 tout entier. Trois commentaires 🚨 le disent, au type, au point de copie et dans la vue Semaine, parce que le geste naturel en relisant ce bloc est d'ajouter la garde manquante. Mesuré à l'écran : **126 bandes sur 126 portent le canal**, y compris celle qui porte une séance.

**5. Le `continue` de `calendar-view.ts` était la moitié cachée de l'AC6.** Il sautait les créneaux « aucun disponible et aucun avis » — précisément l'un des deux vides que l'AC6 demande de distinguer. Tant qu'il filtrait à la source, la grille ne pouvait **structurellement pas** montrer cet état. Retiré ; le filtre est passé à l'affichage de l'Agenda, où une ligne « 0/4 disponibles » par créneau et par jour n'a rien à faire. Un test couvre les deux moitiés.

**6. Un défaut d'accessibilité anticipé par la revue de la 36.7, retrouvé ici intact.** `.band` (Mois) et `.slot-cell` (Semaine) portent leur propre `aria-label`, qui **écrase** le contenu — donc le `role="img"`/`aria-label` de `<app-group-gauge>` aurait été inaudible. `bandAriaLabel()` et `cellAriaLabel()` replient le canal, exactement comme `voteLabel()` avait dû replier la piste. Rien dans la story ne l'annonçait ; c'est le même piège, au même endroit, une story plus tard.

**7. AC13 : le correctif de plage était un vrai trou, mesuré.** Cinq semaines en avant (21–27 septembre, hors de la grille d'août), **21 cellules sur 21** portent encore le canal. Sans le correctif, `onWeekDateChange()` ne rechargeait rien en contexte de partie et la couche serait devenue muette dès la deuxième semaine — sans rien dire à l'écran.

**8. AC12 prouvé mieux qu'un test ne le permet.** `document.elementFromPoint()` au centre d'une pastille, dans le vrai navigateur, renvoie `.slot-cell` — pas la jauge. En jsdom le hit-test est stubbé : cette assertion-là n'y a aucune valeur. C'est la seule preuve réelle du contrat du glissement, et elle est verte.

**9. Le canal ne coûte aucune largeur en vue Semaine.** Mesuré : le libellé de cellule fait 40,6 px pour 69 px de texte, **couche allumée comme éteinte**. La troncature est préexistante (cellule à 48 px, panneau ouvert) ; les pastilles se rangent sur leur propre ligne, la cellule étant une colonne.

**10. Deux AC sur neuf étaient déjà acquis (encadré n°8) et n'ont rien coûté** — AC8 (couche absente du calendrier personnel) et AC9 (« Fenêtres de la destinée »). Ils ont gagné des tests de non-régression, rien d'autre. L'encadré a fait exactement son travail : empêcher de réimplémenter ce qui existait.

**11. Trois questions restent ouvertes pour l'utilisateur**, dont deux tranchées par défaut dans le code : le périmètre serveur (implémenté), l'arbitrage AC7/AC3 (noms MJ / compteurs joueur, implémenté), et la marge de 11 px (posée telle quelle — sans effet mesurable, cf. note 9).

**12. Ce que la vérification visuelle n'a PAS pu couvrir** : les deux vides côte à côte et la **vue joueur** (jauge anonyme). Le compte de test est MJ d'une seule partie à 2 membres, donc toujours en pastilles. Ces cas sont couverts par 6 tests, par la revue de sécurité et par la garde `isMj` tracée ligne à ligne — mais ils n'ont pas été **vus**. À regarder avec un second compte si tu en as un.

**13. `/security-review` lancée et propre** — aucune vulnérabilité HIGH ni MEDIUM. La seule surface nouvelle (`members` sur le heatmap) est gardée par le `isMj` existant, dérivé de `partie.mjId` et de l'identifiant de **session** (`@CurrentUser()`), jamais d'un paramètre de requête. La clé est **omise** pour un joueur, jamais `[]`. La dette de `/security-review` ouverte depuis la 36.4 est refermée.

### File List

**Nouveaux**
- `apps/web/src/app/features/calendar/group-availability.utils.ts`
- `apps/web/src/app/features/calendar/group-availability.utils.spec.ts`
- `apps/web/src/app/features/calendar/group-gauge/group-gauge.ts`
- `apps/web/src/app/features/calendar/group-gauge/group-gauge.html`
- `apps/web/src/app/features/calendar/group-gauge/group-gauge.scss`
- `apps/web/src/app/features/calendar/group-gauge/group-gauge.spec.ts`

**Modifiés — serveur**
- `packages/shared/src/index.ts`
- `apps/api/src/parties/parties.service.ts`
- `apps/api/src/parties/parties.service.spec.ts`

**Modifiés — web**
- `apps/web/src/app/features/calendar/day-detail.utils.ts` · `.spec.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts` · `.spec.ts`
- `apps/web/src/app/features/calendar/calendar-month-view/calendar-month-view.ts` · `.html` · `.scss` · `.spec.ts`
- `apps/web/src/app/features/calendar/calendar-week-view/calendar-week-view.ts` · `.html` · `.scss` · `.spec.ts`
- `apps/web/src/app/features/calendar/calendar-detail-rail/calendar-detail-rail.ts` · `.html` · `.scss` · `.spec.ts`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts` · `.html`
- `apps/web/src/app/features/calendar/available-slots/available-slots.ts` · `.spec.ts`

**Documentation**
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

**Aucune migration Prisma. Aucun fichier de `apps/api/prisma/`.**

### Change Log

- **2026-08-22** — Story 36.8 implémentée. La couche « disponibilité du groupe » passe sur un **canal séparé** : elle sort définitivement de la préséance et reste visible sous une séance comme sous un vote. Nouveau composant `GroupGauge` (une forme pour les quatre surfaces : pastilles par membre pour le MJ jusqu'à six, jauge agrégée sinon), dérivé au point unique `buildDayDetail()`. Côté serveur, `GET /parties/:id/heatmap` sert le détail nominatif **au seul MJ** sous la garde `isMj` existante, et `resolveParticipants()` gagne un ordre déterministe. La couche allumée interdit la fusion des bandes ; `onWeekDateChange()` recharge enfin la plage en contexte de partie. API 60/1303, web 108/1932, lint et typecheck à la baseline. `/security-review` lancée et propre. Vérification visuelle réelle faite dans Chrome (elle a révélé que le conteneur API n'avait pas rechargé le diff).
