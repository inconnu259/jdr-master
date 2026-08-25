---
baseline_commit: 452e5c9
baseline_note: "Arbre de travail PROPRE au démarrage (git status vide). HEAD = 452e5c9 « feat: la vue agenda refondue » (story 36.11, statut review)."
---

# Story 36.12 : L'Agenda du MJ, options dépliées et scellement

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

Épic 36 « Calendrier — lisibilité » · Palier 9 · porte **FR-56** (avec la 36.11) [Source: `epics.md:1909`] · classée **« Front — dépend de Q-25 »** par `epics.md:1928`.

> **Aucun octet ne change côté serveur.** Les deux écritures existent déjà et sont intactes : `PATCH /parties/:id/poll/:pollId/choose` (sceller, MJ seul via `getOwned`) et le chemin de création de vote de la 36.10. Ce que cette story change, c'est **l'unité d'affichage de la vue Agenda** : la ligne cesse d'être une option de vote et redevient **un vote**, qui se déplie quand il est mûr.

---

## 🔓 Q-25 EST TRANCHÉE — lire ceci avant tout le reste

La story était **bloquée par Q-25** (`epics.md:2422`, `prd.md:481`, `contrat-ui-calendrier.html:509`). Elle ne l'est plus.

**Décision de l'utilisateur, 2026-08-23. Un vote ouvert est MÛR si l'une des deux conditions est vraie :**

| # | Condition | Comment elle se calcule, sans un octet de serveur |
| --- | --- | --- |
| **A** | **Tout le monde a répondu** | `min(respondedCount(option))` sur toutes les options `=== membersCount`, avec `membersCount > 0`. Strictement équivalent à `getMissingVoters()` vide, mais dérivable des seuls **agrégats** — donc valable aussi en calendrier personnel, où aucune identité de votant ne transite (AD-9). |
| **B** | **Une option réunit la majorité absolue** | `max(option.yes) * 2 > membersCount`. Un seul créneau suffit ; c'est le signal « le groupe a convergé ». |

🚨 **Le troisième critère du PRD — « l'échéance approche » — est ABANDONNÉ, et pour une raison de fait, pas de goût :**

- `SessionPoll.expiresAt` est **nullable** (`schema.prisma:287`) et **n'est écrit nulle part** : l'unique création (`poll.service.ts:63-76`) ne le renseigne pas. Il vaut `null` sur **tous** les votes existants et futurs.
- Il n'existe même pas sur `MyCalendarPollEntry` (`shared:685-694`), donc le calendrier personnel ne pourrait pas le lire.
- L'implémenter ferait de cette story une story serveur, que `epics.md:1928` classe « Front ».

⚠️ **À répercuter par `bmad-ux` et `bmad-pm`** : Q-25 (PRD `:481`), le point ouvert 13 (`EXPERIENCE.md:776`) et l'annotation 23 de la planche (`contrat-ui-calendrier.html:509`) doivent porter la définition ci-dessus. La planche est régénérable ; **son dessin ne change pas**, seule son annotation « la définition de « mûr » reste à écrire » devient caduque.

---

## 🚨 Encadré n°1 — LE CŒUR DE LA STORY : la ligne redevient UN VOTE, pas une option

**Lire ceci avant d'écrire la moindre ligne.** C'est ce que la story change vraiment, et c'est ce qu'une lecture pressée des six AC ne montre pas.

Aujourd'hui, l'Agenda rend **une ligne par option de vote**. Ce n'est pas un choix de la 36.11 : c'est l'héritage mécanique de l'éclatement par option de la 36.6 (`calendar-view.ts:404-436`), qui existait pour que **la grille** marque tous les créneaux proposés, et qui a débordé sur la liste.

Le contrat dit l'inverse, aux **deux** rôles :

- **Joueur** (`contrat-ui-calendrier.html:331`) — une seule ligne : *« Les Cendres d'Ashal · Vote ouvert · 28 ou 29 août · 2 sur 4 ont répondu »*, **un** badge « Réponds au vote ».
- **MJ** (`:483-493`) — la **même** ligne, avec ses options dépliées **dessous** quand le vote est mûr.

Le coût de ne pas le faire est déjà mesuré et consigné : *« constaté à l'œil, « Ça t'attend » porte **21 lignes** sur le seul jeu de développement, **toutes des options d'un même vote** »* [Source: `deferred-work.md:23`].

**Donc :**

1. 🚨 **Le regroupement se fait À L'AFFICHAGE, dans le composant d'Agenda** — jamais dans `allCalendarEntries()`. L'éclatement par option y reste **intact** : le Mois, la Semaine et le rail en dépendent pour marquer chaque créneau proposé. Le défaire casse trois surfaces livrées. C'est exactement le patron que la 36.8 puis la 36.11 ont déjà appliqué (filtrer/retirer à l'affichage, jamais à la source).
2. ⚠️ **C'est un changement de comportement livré il y a un jour** (36.11, commit `452e5c9`). Les tests de `calendar-agenda-view.spec.ts` qui comptent une ligne par option deviennent **caducs** et sont **remplacés**, pas contournés.
3. La clé de regroupement est **`entry.vote.pollId`**. Elle est renseignée dans les deux contextes (`calendar-view.ts:423` en partie, `:531` en personnel) — c'est précisément ce que la 36.7 a rendu obligatoire.
4. Les entrées d'un même vote **n'ont pas toutes la même date** : la date du groupe est la **plus proche** de ses options. Elle sert au tri, jamais à un en-tête (AC2 de la 36.11 reste vraie).

---

## 🚨 Encadré n°2 — « SE DÉPLIENT D'OFFICE » N'EST PAS « SE DÉPLIENT SEULS »

Le piège qui coûterait la story, et une régression visible chez tous les joueurs.

`EXPERIENCE.md:355` dit : *« Le dépliement est **conditionné à la maturité** du vote, pas systématique : trois votes ouverts feraient sinon une page interminable. »*

Lu comme un verrou, cela veut dire : **un vote non mûr n'a pas d'options à l'écran**. Or, depuis la 36.11, la ligne d'option est **le seul chemin de réponse et de retrait depuis l'Agenda** (AC13 de la 36.11, `EXPERIENCE.md:571` « Répondre à un vote · Tap sur la bande → sélecteur »). Supprimer les options d'un vote non mûr **supprimerait la possibilité de répondre à un vote non mûr** — c'est-à-dire à tous les votes auxquels on attend justement une réponse. L'absurdité est complète : l'Agenda est « ce qu'on attend de moi ».

**Tranché (D-3) : la maturité gouverne l'état PAR DÉFAUT du dépliement, jamais la possibilité de déplier.**

- Vote **mûr** → la ligne est rendue **dépliée** d'emblée.
- Vote **non mûr** → la ligne est rendue **compacte**, et **activer la ligne la déplie** (puis la replie).
- Le geste est un **`aria-expanded`** sur le bouton de ligne, pas une navigation. Il ne touche à aucune donnée, n'émet aucun appel, ne persiste rien.

C'est la lecture littérale de « d'office » (= par défaut) et la seule qui laisse le système debout.

---

## 🚨 Encadré n°3 — LE SCELLEMENT : où il vit déjà, et ce qu'il ne faut surtout pas dupliquer

**L'écriture existe, elle est complète, et elle n'est pas à réécrire.**

| Couche | Ce qui existe | À faire |
| --- | --- | --- |
| API | `PATCH /parties/:id/poll/:pollId/choose` — `PollService.choose()` (`poll.service.ts:170-212`). Ferme le vote (`status: CLOSED`), pose `chosenDate`/`chosenSlot`, met à jour `Partie.nextSessionDate/Slot`, remet `reminderSentAt` à `null` **si la date change réellement**, émet `partieTopic` **et** `notifyPartieSignalsChanged`. MJ seul, garanti par `getOwned()`. | **Rien.** |
| Contrôleur | Recalcule `nextSessionDate` en best-effort après le scellement. | **Rien.** |
| Client | `PollService.chooseDate(partieId, pollId, { optionId })` (`poll.service.ts:70-74`). | **L'appeler.** |
| Fiche de scénario | `seance-list.ts:157-169` (`onChoose`) + `<app-poll-status>` complet, avec son bouton « Sceller ce créneau ». **Seul chemin de scellement du projet depuis la 36.9.** | 🚨 **Ne pas y toucher.** Cette story **ajoute** un second chemin, elle n'en déplace aucun. |

🚨 **`onChooseDate()` avait été retiré de `CalendarView` par la 36.9**, avec le panneau qui l'appelait — un commentaire l'annonce explicitement à `calendar-view.ts:1600-1607` : *« La story 36.12 rendra le scellement à l'Agenda, avec son propre chemin. »* Le rétablir signifie l'écrire **neuf**, à sa place, avec la garde `pollActionPending()` du patron `onClosePoll()` — pas ressusciter un ancien.

**Le patron d'écriture du fichier, à suivre à la lettre** (`onClosePoll()`, `calendar-view.ts:1585-1598`) : garde `pollActionPending()` → `set(true)` → appel service → `await this.loadScenarios(id)` → `catch` qui pose `this.error` → `finally` qui relâche la garde. `PollService.chooseDate()` renvoie `void`, **donc le rechargement n'est pas optionnel** : sans lui, la ligne resterait affichée comme un vote ouvert (défaut réel déjà payé une fois, `deferred-work.md:848`).

---

## 🚨 Encadré n°4 — « LANCER UN VOTE » RÉUTILISE LA COMPOSITION DE LA 36.10, INTÉGRALEMENT

**Décision de l'utilisateur, 2026-08-23 (D-5).** Le bouton **bascule sur la vue Mois et arme le mode de composition** sur la séance visée. Le MJ compose ensuite ses créneaux sur la grille, et la barre persistante valide — exactement le parcours de la 36.10.

Pourquoi, et ce que cela interdit :

- Un `SessionPoll` **exige** une `Seance` depuis la 8.8. Le seul chemin de création est `ScenariosService.createSeancePoll(seanceId, options)` — il n'existe **aucune** route générique.
- Un vote exige **2 à 40 créneaux** (borne serveur, `composeCanConfirm()`). Un bouton d'agenda ne peut pas les produire seul.
- FR-52 a **supprimé** le sélecteur « Planifier un vote pour : » de l'Oracle (36.10, AC9). 🚨 **Ne pas le réintroduire sous forme de dialogue d'agenda** : ce serait rendre exactement ce que l'épic a retiré.

**L'extension minimale à écrire** — et rien de plus :

```ts
// calendar-view.ts:126 — aujourd'hui
export type ComposeTarget = { kind: 'poll'; pollId: string } | { kind: 'new' };
// demain
export type ComposeTarget = { kind: 'poll'; pollId: string } | { kind: 'new'; seanceId?: string };
```

Puis `composeSeanceChoices()` (`:794-800`) se **restreint à cette séance** quand `seanceId` est posé. Effet de bord voulu et gratuit : `ComposeConfirmDialog` pré-remplit déjà son sélecteur quand il n'y a **qu'une** séance (`compose-confirm-dialog.ts:59-61`) — **le dialogue n'a donc pas une ligne à changer**, et le MJ n'a pas à redésigner la séance qu'il vient de désigner.

🚨 Le point d'entrée doit passer par **`startCompose()`**, pas écrire `composing`/`composeTarget`/`composedCells` à la main : `startCompose()` porte la garde `canCompose()` et la logique « un vote mis en avant par la Destinée se MODIFIE ». Prévoir un paramètre optionnel plutôt qu'un second chemin d'armement.

---

## 🚨 Encadré n°5 — TROIS FRONTIÈRES DE CONTEXTE, à ne jamais confondre

| Ce qui est rendu | Calendrier de **partie**, mode **MJ** | Calendrier de **partie**, mode joueur | Calendrier **personnel** (`/profile/calendar`) |
| --- | --- | --- | --- |
| Ligne de vote groupée, avec son compteur | ✅ | ✅ | ✅ |
| Options dépliées, piste par option, **ma réponse** | ✅ | ✅ | ✅ |
| Bouton **Sceller** | ✅ | ❌ (AC6) | ❌ **(D-4)** |
| Méta « il manque Léa, Tom » | ✅ | ❌ | ❌ **structurellement** |
| Ligne « Aucune date proposée » + **Lancer un vote** | ✅ | ❌ | ❌ **structurellement** |

**Pourquoi le calendrier personnel n'a ni scellement ni lancement, et pourquoi ce n'est pas un oubli :**

1. `mode` est un **`input` du composant** (`calendar-view.ts:160`), et il vaut `'personal'` sur `/profile/calendar`. **Aucune donnée n'y dit de quelle partie je suis MJ** : `MyCalendarPollEntry` (`shared:685-694`) ne porte ni rôle, ni `mjId`. Un bouton *Sceller* y serait un bouton qui échoue en 403 pour la moitié des lignes.
2. La liste des membres n'existe qu'en mode MJ (`calendar-view.ts:1170`), et le calendrier personnel est **anonyme par conception** (AD-9/AD-2) : *« n'y ajouter jamais un `userId`, un `pseudo` ni un `displayName` »* (`shared:665-670`). « Il manque Léa, Tom » y est donc interdit, pas juste absent.
3. `eligibleSeances()` (`calendar-view.ts:316-329`) dérive de `scenarios()`, qui n'est chargé qu'en contexte de partie. Une séance sans date n'atteint jamais le calendrier personnel.

**Ces trois asymétries partent en `deferred-work.md` et en question à l'utilisateur — elles ne se « réparent » pas ici.**

---

## 🚨 Encadré n°6 — CE QUI NE DOIT PAS ÊTRE TOUCHÉ, SOUS AUCUN PRÉTEXTE

1. 🚨 **`allCalendarEntries()`** (`calendar-view.ts:361-568`) — quatre consommateurs : Mois, Semaine, rail, Agenda. **L'éclatement par option y reste**. Le regroupement vit en aval (encadré n°1).
2. 🚨 **`seance-list.html` / `<app-poll-status>`** — le panneau complet et son « Sceller ce créneau ». La 36.9 a déjà écrit noir sur blanc de ne pas y propager la réduction du calendrier ; l'inverse vaut aussi (`calendar-view.html:183-186`).
3. **`<app-poll-track>`**, `poll-track.utils.ts` (`counterLabel`, `answerLabel`, `participationAriaLabel`, `trackSegments`, `respondedCount`) — livrés par la 36.6, **réutilisés tels quels**. Ne pas réécrire une piste ni un compteur.
4. **`onVoteOptionActivated()`** et le `cdkConnectedOverlay` du sélecteur (`calendar-view.html:293-319`) — **unique** sélecteur des quatre surfaces (36.7). Les options dépliées l'ouvrent par l'`output` `voteOptionActivated` **existant**.
5. **`onScenarioActivated(target: RailTarget)`** (`calendar-view.ts:1240`) — unique navigation vers le scénario. Aucun second `router.navigate`.
6. **`getMissingVoters()`** (`core/poll/poll.util.ts`) — définition unique de « manquant », partagée avec `PollMissingPanel` et la fiche de scénario. Une seconde définition sur le même écran divergerait.
7. **`badgeFor()` / `sectionIdFor()`** (`agenda-badge.utils.ts`) — étendus, jamais réécrits. Les trois sections et les six badges de la 36.11 restent.
8. **Les 143 erreurs de lint pré-existantes** — hors périmètre.

---

## Story

As a **MJ**,
I want **trancher un vote depuis l'agenda**,
so that **je n'aie pas à changer de vue pour faire ce qu'on attend de moi**.

[Source: `epics.md:2416-2420`]

---

## Acceptance Criteria

Les AC1 à AC6 sont **verbatim** d'`epics.md:2424-2456`. Les AC7+ verrouillent ce que le verbatim laisse ouvert.

### AC1 — Un vote mûr déplie ses options, triées par faveur (verbatim)

**Given** un vote ouvert et mûr
**When** l'agenda est rendu pour le MJ
**Then** ses options se déplient dans la ligne
**And** elles sont triées par faveur

*« Mûr » = définition Q-25 ci-dessus. « Par faveur » = `yes` décroissant, puis `maybe` décroissant, puis la date croissante en départage stable.*

### AC2 — Un vote qui n'est pas mûr reste compact (verbatim)

**Given** un vote ouvert qui n'est pas mûr
**When** l'agenda est rendu
**Then** la ligne reste compacte

### AC3 — Une option dépliée porte sa piste et son scellement (verbatim)

**Given** une option dépliée
**When** elle est rendue
**Then** elle porte sa piste de participation
**And** un moyen de la sceller

### AC4 — Le favori est mis en avant sans masquer les autres (verbatim)

**Given** l'option la plus favorable
**When** les options sont rendues
**Then** elle est mise en avant
**And** les autres restent accessibles et scellables

### AC5 — Une séance sans date propose de lancer un vote (verbatim)

**Given** une séance sans date proposée
**When** l'agenda est rendu pour le MJ
**Then** la ligne propose de lancer un vote

### AC6 — Le joueur voit la même structure, sans scellement (verbatim)

**Given** un joueur
**When** le même agenda est rendu
**Then** il voit la même structure de ligne et son propre choix
**And** aucun moyen de sceller

### AC7 — 🚨 Une ligne = un vote, dans les deux contextes et pour les deux rôles

**Given** un vote ouvert à N options dont au moins une est visible dans l'agenda
**When** l'agenda est rendu
**Then** il produit **une seule** ligne pour ce vote, jamais N
**And** cette ligne nomme le scénario (contexte de partie) ou la partie (contexte personnel), comme aujourd'hui
**And** sa méta dit **« Vote ouvert »**, les créneaux proposés et **« n sur M ont répondu »**
**And** la règle vaut identiquement en calendrier personnel et en calendrier de partie, en mode MJ comme en mode joueur

⚠️ *Renverse le rendu par option livré par la 36.11 **dans l'Agenda uniquement**. Le Mois, la Semaine et le rail continuent de recevoir une entrée par option (encadré n°1).*

### AC8 — 🚨 Le dépliement est un défaut, pas un verrou

**Given** un vote **non mûr**
**When** j'active sa ligne
**Then** ses options se déplient
**And** une seconde activation les replie

**Given** un vote **mûr**
**When** l'agenda est rendu
**Then** ses options sont déjà dépliées, sans aucun geste

**Given** une ligne de vote, dépliée ou non
**When** elle est rendue
**Then** son bouton porte `aria-expanded` reflétant l'état
**And** aucun appel réseau n'est émis par le dépliement ni par le repliement
**And** l'état de dépliement **n'est pas persisté** — ni en compte, ni en `localStorage`, ni dans l'URL

### AC9 — 🚨 Le sélecteur de réponse survit au regroupement

**Given** une option dépliée, quel que soit mon rôle
**When** je l'active
**Then** le **même** sélecteur de réponse que les grilles et le rail s'ouvre, ancré sur l'option
**And** « Retirer ma réponse » y reste atteignable
**And** aucun second chemin de réponse ou de retrait n'apparaît dans l'Agenda

*(Sans cela, le regroupement supprimerait la seule façon de répondre à un vote depuis l'Agenda. C'est la régression que l'encadré n°2 existe pour empêcher.)*

### AC10 — 🚨 Sceller : MJ, contexte de partie, une seule fois

**Given** le MJ en contexte de partie, sur une option dépliée
**When** il active *Sceller*
**Then** `PATCH …/poll/:pollId/choose` est appelé **une seule fois** avec l'`optionId` de cette option
**And** les scénarios sont rechargés à la réussite
**And** la ligne quitte « Ça t'attend » et la séance apparaît dans « C'est programmé », à la date scellée

**Given** une requête de scellement ou de clôture déjà en vol (`pollActionPending()`)
**When** j'active *Sceller* à nouveau
**Then** rien n'est envoyé — la garde anti-double-clic du fichier s'applique

**Given** un échec de la requête
**When** il survient
**Then** un message d'erreur s'affiche
**And** l'agenda reste tel quel, sans état fantôme

### AC11 — 🚨 Le scellement est irréversible : il se confirme

**Given** le MJ qui active *Sceller* sur une option
**When** l'action est déclenchée
**Then** une confirmation le précède, nommant **la date et le créneau** qui vont être retenus
**And** renoncer n'écrit rien

*(`choose()` passe le vote à `CLOSED` et pose `Partie.nextSessionDate` : il n'y a pas de retour en arrière côté produit. Le projet confirme déjà les pertes chiffrées — `ComposeConfirmDialog`, 36.10, AC6.)*

### AC12 — 🚨 Aucun scellement possible hors du seul contexte qui l'autorise

**Given** le calendrier personnel (`/profile/calendar`)
**When** l'agenda est rendu, y compris pour un utilisateur MJ d'une des parties agrégées
**Then** **aucun** bouton *Sceller* n'est rendu, sur aucune ligne
**And** **aucune** ligne « Aucune date proposée » n'est rendue

**Given** le mode joueur d'un calendrier de partie
**When** l'agenda est rendu
**Then** idem — la structure de ligne est la même, les deux actions sont absentes

**And** l'absence est **structurelle** : pas de `[disabled]`, pas de bouton du tout (même règle que l'AC12 de la 36.11)

### AC13 — 🚨 « Lancer un vote » arme la composition, il n'ouvre aucun formulaire

**Given** le MJ en contexte de partie, sur une ligne « Aucune date proposée »
**When** il active *Lancer un vote*
**Then** la vue bascule sur **Mois**
**And** le mode de composition de la 36.10 est armé, **ciblé sur cette séance**, avec zéro créneau composé
**And** la barre persistante de composition s'affiche
**And** à la validation, la séance **n'est plus redemandée** — c'est celle de la ligne

**Given** une séance déjà porteuse d'un vote (ouvert ou clos) ou d'une date validée
**When** l'agenda est rendu
**Then** elle ne produit **aucune** ligne « Aucune date proposée » (même règle qu'`eligibleSeances()`)

### AC14 — 🚨 Ce que dit la méta d'une ligne de vote, et pour qui

**Given** une ligne de vote, quel que soit le rôle
**When** elle est rendue
**Then** sa méta porte, dans cet ordre : « Vote ouvert », les créneaux proposés, le compteur « n sur M ont répondu »
**And** les créneaux sont **énumérés jusqu'à deux** (« 28 ou 29 août »), au-delà résumés (« 4 créneaux proposés »)

**Given** le MJ en contexte de partie, sur un vote auquel il manque des réponses
**When** la ligne est rendue
**Then** la méta nomme **qui manque**, via `getMissingVoters()` — jamais une seconde définition
**And** au-delà de trois noms, elle en nomme trois et compte le reste

⚠️ *Écart assumé avec la planche : la méta joueur du contrat (`contrat-ui-calendrier.html:331`) montre une **petite piste** en ligne. Elle **n'est pas rendue** ici, et c'est un choix : une piste au niveau du VOTE devrait agréger `yes`/`maybe`/`no` de plusieurs options, or un membre peut répondre différemment sur chacune — la piste affirmerait un avis que personne n'a exprimé. C'est exactement le défaut fondateur que la 36.6 existe pour corriger (`poll-track.utils.ts:11-20`). **Le compteur, lui, est rendu en toutes lettres.** Les pistes vivent sur les options, où elles sont vraies. À répercuter par `bmad-ux`.*

### AC15 — 🚨 Le badge d'une ligne de vote dépend du lecteur ET de la maturité

**Given** un vote mûr, rendu pour le MJ en contexte de partie
**When** son badge est rendu
**Then** il dit **« À sceller »**, teinte `todo`

**Given** tout autre cas — vote non mûr, ou lecteur joueur, ou calendrier personnel
**When** le badge est rendu
**Then** les libellés de la 36.11 s'appliquent inchangés : « Réponds au vote » (`todo`) sans ma réponse, « Vote en cours » (`live`) une fois répondue

**And** « ma réponse » à un vote groupé = **avoir répondu à toutes ses options** — la même définition que `getMissingVoters()`, jamais « au moins une »

### AC16 — 🚨 Les libellés nouveaux existent dans les TROIS thèmes

**Given** les clés de ton ajoutées par cette story
**When** un thème quelconque est actif
**Then** aucune ne rend `undefined`

*Clés : `calendar.agenda.badge_to_seal`, `calendar.agenda.action_launch_poll`, `calendar.agenda.no_date_proposed`, `calendar.agenda.poll_open`, `calendar.agenda.responded_count`, `calendar.agenda.missing_voters`, `calendar.agenda.seal_confirm_title`, `calendar.agenda.action_seal`.*

**⚠️ Amendement post-livraison (revue de code, 2026-08-23) : `cta.choose_date` n'est PAS réutilisé pour le bouton *Sceller* d'une option dépliée — écart assumé et gardé.** L'AC prescrivait initialement de réutiliser `cta.choose_date` (« Sceller ce créneau » / « Planter le drapeau de la clairière » / « Verrouiller l'engrenage de la date »). À la vérification visuelle réelle, ce libellé — répété sur **chaque option d'un vote déplié**, jusqu'à quarante fois sur un même vote — passait sur deux lignes et cassait la mise en page (contrairement au bouton unique du contexte fiche-scénario pour lequel `cta.choose_date` a été conçu). Une clé dédiée `calendar.agenda.action_seal` a donc été créée dans les trois thèmes, avec une contrainte de longueur (≤14 caractères, testée dans `theme-tone.service.spec.ts`) que `cta.choose_date` ne respecte pas. Décision utilisateur : garder la clé dédiée plutôt que dégrader l'UI ou retravailler le CSS pour absorber le texte long.

### AC17 — 🚨 Zéro appel réseau nouveau, zéro changement serveur

**Given** l'ouverture de l'agenda, tout dépliement, tout repliement
**When** ils surviennent
**Then** **aucun** appel HTTP n'est émis — toute la matière vient d'`agendaEntries()` et de `members()`, déjà chargés

**Given** cette story dans son ensemble
**When** elle est livrée
**Then** aucun fichier de `apps/api/` ni de `packages/shared/` n'est modifié
**And** aucune migration Prisma n'est créée

*Seul le scellement écrit, et il réutilise une route existante.*

### AC18 — 🚨 Le tri et les sections de la 36.11 restent debout

**Given** l'agenda après regroupement
**When** il est rendu
**Then** les trois sections, leur ordre, leur effacement à vide et le message d'agenda vide sont **inchangés**
**And** « Ça t'attend » range toujours ce qui réclame une action **avant** le reste, la date départageant ensuite
**And** la date d'un groupe de vote, pour ce tri, est celle de sa **plus proche** option
**And** les lignes « Aucune date proposée », sans date, se rangent **en fin** de section (même convention que les inscriptions ouvertes)

---

## Tasks / Subtasks

### 0. Baseline (obligatoire, avant toute modification)

- [x] `docker compose exec web pnpm test` — relever fichiers/tests verts (**111 / 2043** à la fin de la 36.11) et le consigner. Toute comparaison de fin se fait contre ce chiffre.
- [x] `docker compose exec web pnpm lint` — relever les erreurs **pré-existantes** (**142** à la 36.11). Aucune erreur **nouvelle** sur les fichiers touchés n'est acceptable.
- [x] `git status` propre, noter le SHA de HEAD (attendu : `452e5c9`).

### 1. La maturité et le regroupement, en fonctions pures (AC1, AC2, AC7, AC15, AC18)

- [x] Étendre **`agenda-badge.utils.ts`** — ne pas créer un troisième fichier d'utilitaires d'agenda :
  - `groupVoteEntries(entries: AgendaEntry[]): AgendaVoteGroup[]` — regroupe par `entry.vote.pollId`, conserve l'ordre des options par date, expose `{ pollId, label, options: AgendaEntry[], nearestDate, membersCount }`.
  - `isPollMature(group, membersCount): boolean` — **critères A et B de Q-25, et rien d'autre**. Documenter sur place pourquoi le critère d'échéance est absent (`expiresAt` jamais écrit).
  - `pollRespondedCount(group): number` — `min(respondedCount(option))`, la seule définition dérivable des agrégats. Réutiliser `respondedCount()` de `poll-track.utils.ts`.
  - `favouriteOptionOrder(options): AgendaEntry[]` — `yes` décroissant, `maybe` décroissant, date croissante. Départage **stable**, jamais dépendant de l'ordre d'entrée.
  - `hasAnsweredAll(group): boolean` — toutes les options portent un `vote.myAnswer` non nul.
- [x] 🚨 Garder les gardes de `poll-track.utils.ts` : `membersCount` peut valoir `0` ou arriver `undefined` d'une API en retard (`safeCount`). **Un vote à effectif nul n'est jamais mûr** — sinon `0 >= 0` le déclarerait mûr et déplierait tout.
- [x] 🚨 `entry.vote` peut être `undefined` en contexte personnel dégradé (`calendar-view.ts:519-521`). Une entrée `votes-en-cours` sans `vote` ne peut pas être groupée : la ranger seule, sans piste, jamais la perdre.

### 2. Le rendu groupé et le dépliement (AC1 à AC4, AC7 à AC9, AC14)

- [x] `calendar-agenda-view.ts` : `sections()` cesse de pousser une entrée de vote par option. Il pousse un **groupe**, dont les options sont un sous-tableau. Deux formes de ligne, **un seul gabarit de corps** (patron `ng-template #body` déjà en place).
- [x] Signal local `expanded = signal<ReadonlySet<string>>(new Set())` — des `pollId`, **jamais des index** (piège de la 36.9 : `activePolls()` est reconstruit à chaque rechargement temps réel). Un groupe est déplié si `isPollMature()` **ou** `expanded().has(pollId)`.
- [x] Le bouton de ligne porte `[attr.aria-expanded]` et bascule l'ensemble. 🚨 **Il ne navigue pas** : une entrée de vote n'a jamais été ouvrable (`openTarget()` rend `null` dès qu'`entry.vote` existe) — cette garde reste et devient le point d'accroche du dépliement.
- [x] Chaque option dépliée : sa date + créneau, `<app-poll-track>` **tel quel**, `counterLabel()`, `answerLabel()`, et le bouton du sélecteur (`voteOptionActivated`) déjà en place. **Aucune imbrication de boutons** — l'option est une `<li>` avec ses boutons frères, jamais un bouton dans le bouton de ligne.
- [x] Le **favori** (première option du tri) porte une classe de mise en avant. 🚨 **Les autres restent scellables** (AC4) : ne pas conditionner le bouton *Sceller* au rang.
- [x] `metaLine()` s'étend pour les groupes (AC14) : « Vote ouvert · 28 ou 29 août · 2 sur 4 ont répondu », plus « il manque … » côté MJ. 🚨 Le littéral `'sans date'` déjà signalé en revue de la 36.11 (`calendar-agenda-view.ts:255`) reste hors registre — **le corriger au passage** puisque cette méthode est réécrite.

### 3. Le scellement (AC3, AC10, AC11, AC12)

- [x] Nouvel `input` `canSeal = input(false)` sur `CalendarAgendaView`, câblé à `isMjMode() && partieId() !== null` dans `calendar-view.html`. 🚨 **Les deux conditions**, jamais `isMjMode()` seul.
- [x] Nouvel `output` `sealRequested = output<{ partieId: string; pollId: string; optionId: string; dateLabel: string }>()`. Le composant **signale**, il n'écrit pas (même séparation que `voteOptionActivated`/`scenarioActivated`).
- [x] Dans `CalendarView`, écrire `onSealRequested()` **neuf**, à l'emplacement du commentaire de la 36.9 (`calendar-view.ts:1600-1607`) — remplacer ce commentaire par la méthode qu'il annonce. Patron **exact** d'`onClosePoll()` : garde `pollActionPending()`, `set(true)`, dialogue de confirmation (AC11), `pollSvc.chooseDate()`, `await loadScenarios(id)`, `catch` → `this.error`, `finally` → relâche.
- [x] Confirmation (AC11) : réutiliser `MatDialog`, déjà injecté pour `ComposeConfirmDialog`. 🚨 **Ne pas étendre `ComposeConfirmDialog`** — ses deux faces sont documentées comme exclusives ; une troisième face en ferait un dialogue fourre-tout. Un `MatDialog` de confirmation simple suffit, ou un composant frère minimal.
- [x] 🚨 Revérifier `pollActionPending()` **après** la fermeture du dialogue : le MJ peut lire pendant qu'une clôture part d'ailleurs (leçon de revue de la 36.10, `confirmCompose()`).

### 4. « Lancer un vote » (AC5, AC13)

- [x] Nouveau type d'entrée `'seances-sans-date'` dans `AgendaEntryType`, produit par `allCalendarEntries()` **uniquement si `partieId()` et `isMjMode()`**, depuis `eligibleSeances()` : `date: ''`, `label` = titre du scénario, `partieId`/`scenarioId`/`seanceId` renseignés. Précédent exact : `inscriptions-ouvertes`, déjà « agenda-only et sans date ».
- [x] 🚨 `agendaEntries()` (`:573-590`) : **exempter ce type du filtre par couche**, comme `inscriptions-ouvertes` — ce n'est pas une clé de `CALENDAR_LAYER_KEYS` et il serait sinon filtré à coup sûr. Commenter le pourquoi sur place.
- [x] 🚨 **Ne rien ajouter à `MEANINGFUL_TYPES`** (`day-detail.utils.ts:125`) : une entrée sans date ne doit pas pouvoir devenir le jour au repos du rail.
- [x] `sectionIdFor()` : le nouveau type va dans `'awaiting'`. `badgeFor()` : aucun badge — la ligne porte une **action**, pas un libellé d'état.
- [x] Nouvel `output` `pollLaunchRequested = output<string>()` (le `seanceId`). Dans `CalendarView` : `this.view.set('month')` puis `startCompose({ seanceId })`.
- [x] Étendre `ComposeTarget` en `{ kind: 'new'; seanceId?: string }` et restreindre `composeSeanceChoices()` en conséquence (encadré n°4). **Ne pas toucher `ComposeConfirmDialog`.**
- [x] ⚠️ Écart assumé et à consigner : la planche fait de « Lancer un vote » un **badge** (`contrat-ui-calendrier.html:496`), alors que **D-6 de la 36.11** pose que *« les badges sont des libellés d'état, jamais des actions »*. Ici c'est une **action** : un bouton, pas un badge — quitte à en emprunter la forme visuelle.

### 5. Les libellés thématisés (AC16)

- [x] Sept clés nouvelles dans **les trois** thèmes de `tones.ts` (piège n°12 de la 36.9 : une clé posée dans un seul thème rend `undefined` dans les deux autres).
- [x] 🚨 **Réutiliser `cta.choose_date`** pour le bouton *Sceller*, il existe déjà partout.
- [x] Étendre le test de garde de `theme-tone.service.spec.ts` que la 36.11 a ajouté (les neuf clés d'agenda) aux sept nouvelles — c'est le seul filet, aucun test de composant ne tourne hors du thème par défaut.

### 6. Tests — Web (Vitest, zoneless)

`agenda-badge.utils.spec.ts` (unitaires purs, sans TestBed) :

- [x] `isPollMature` : critère A (toutes les options à `respondedCount === membersCount`) ; critère B (`yes * 2 > membersCount`, tester `2/4` faux et `3/4` vrai) ; **`membersCount: 0` ⇒ jamais mûr** ; `membersCount` absent/`NaN` ⇒ jamais mûr.
- [x] `favouriteOptionOrder` : deux options à `yes` égal départagées par `maybe`, puis par date ; ordre **stable**.
- [x] `groupVoteEntries` : deux votes entrelacés → deux groupes ; une entrée `votes-en-cours` **sans `vote`** n'est pas perdue.
- [x] `pollRespondedCount` : min sur les options, jamais la somme.
- [x] `hasAnsweredAll` : répondu à 2 options sur 3 ⇒ faux (AC15).

`calendar-agenda-view.spec.ts` — **les tests par option sont remplacés** :

- [x] AC7 : un vote à 3 options → **une** ligne ; le nombre de lignes ne dépend plus du nombre d'options.
- [x] AC1/AC2 : mûr → options rendues sans geste ; non mûr → options absentes du DOM.
- [x] AC8 : clic sur une ligne non mûre → options rendues, `aria-expanded="true"` ; second clic → repliées.
- [x] AC4 : le favori porte la classe de mise en avant ; **les trois** options portent un bouton *Sceller* quand `canSeal` est vrai.
- [x] AC6/AC12 : `canSeal = false` → **aucun** bouton *Sceller* dans le DOM, ni désactivé ni masqué ; la structure de ligne et les options restent identiques.
- [x] AC9 : activer une option dépliée émet `voteOptionActivated` avec le bon triplet et la bonne ancre.
- [x] AC15 : mûr + `canSeal` → « À sceller » ; mûr + joueur → « Réponds au vote »/« Vote en cours » ; répondu à une option sur deux → « Réponds au vote ».
- [x] AC14 : deux créneaux énumérés, quatre résumés ; « il manque … » présent avec `missingNames`, absent sans.
- [x] AC5/AC13 : une entrée `seances-sans-date` rend un bouton qui émet `pollLaunchRequested` avec le `seanceId` ; aucun badge d'état sur cette ligne.
- [x] AC18 : les trois sections, l'effacement à vide, le message d'agenda vide et le spinner **inchangés** (tests de la 36.11 conservés, adaptés au nouveau DOM).

`calendar-view.spec.ts` :

- [x] AC10 : `sealRequested` → **un seul** `PATCH …/choose` avec le bon `optionId` ; `loadScenarios` rappelé ; erreur → message posé, pas d'état fantôme.
- [x] AC10 : garde anti-double-clic — deux émissions rapprochées, **un seul** appel.
- [x] AC11 : renoncer au dialogue → **aucun** appel HTTP.
- [x] AC12 : en mode `'personal'`, `canSeal` passé au composant vaut `false` et **aucune** entrée `seances-sans-date` n'est produite.
- [x] AC13 : `pollLaunchRequested` → `view()` vaut `'month'`, `composing()` vrai, `composeTarget()` = `{ kind:'new', seanceId }`, `composedCells()` vide ; puis `composeSeanceChoices()` ne contient **que** cette séance.
- [x] AC17 : aucun appel HTTP supplémentaire au passage en vue agenda ni au dépliement (compteur sur le `HttpTestingController` déjà utilisé par ce spec).
- [x] Non-régression : la vue Mois et le rail reçoivent toujours **une entrée par option** — assertion explicite sur `calendarEntries()`.

**Rappels plateforme (mémoire projet, payés en 36.11)** :

- 🚨 **jsdom répond `matches: false` à toute media query** : le `BreakpointObserver` du spec est mocké **desktop par défaut**. Ne pas le défaire — 9 tests étaient tombés d'un coup en 36.11.
- Angular **zoneless**, pas de zone.js : `whenStable()` seul ne suffit pas pour un `ngOnInit` asynchrone. Réutiliser la **boucle de ticks** déjà établie dans `calendar-view.spec.ts`.
- Un nouvel `input`/`output` **obligatoire** casserait les fixtures existantes (piège n°18 de la 36.9, n°11 de la 36.10, n°20 de la 36.11) : `canSeal` a une valeur par défaut.

### 7. Qualité

- [x] `docker compose exec web pnpm test` — comparer à la tâche 0. **Aucune régression.**
- [x] `docker compose exec web pnpm lint` — aucune erreur **nouvelle**.
- [x] `packages/shared` non modifié ⇒ typecheck API non requis (AC17). S'il l'était, l'API le serait aussi (`apps/api` typecheck gap).

### 8. 🚨 Vérification visuelle réelle (obligatoire)

Discipline établie par les 36.9 à 36.11, non négociable.

- [x] **Chrome MCP (`claude-in-chrome`), session de test déjà connectée** — jamais le navigateur interne.
- [x] Calendrier d'une partie en **compte MJ** puis en **compte joueur**, **et** `/profile/calendar`.
- [x] Un vote **mûr** et un vote **non mûr** côte à côte : le premier déplié d'office, le second compact puis déplié au clic.
- [x] Le favori mis en avant, **les trois** boutons *Sceller* présents. Sceller pour de vrai, et vérifier que la ligne **change de section**.
- [x] Une ligne « Aucune date proposée » → *Lancer un vote* → la vue bascule sur Mois, la barre de composition apparaît, la validation **ne redemande pas** la séance.
- [x] Les **trois thèmes** : contraste du badge « À sceller », lisibilité des options dépliées, largeur des pistes.
- [x] **375 px** : les options dépliées ne débordent pas ; le bouton *Sceller* reste atteignable au doigt (≥ 44 px).
- [x] ⚠️ Le jeu de données de développement porte les valeurs posées par la 36.5 — **s'en servir, ne rien écrire de nouveau en base**. Pour fabriquer un vote mûr, muter le signal côté client (`window.ng`), comme la 36.11.

### 9. Clôture

- [x] Consigner dans `deferred-work.md` : les trois asymétries du calendrier personnel (encadré n°5), l'écart de piste en méta (AC14), l'écart badge/action de « Lancer un vote » (tâche 4), et **refermer** l'entrée « la liste Agenda non bornée, aggravée par l'éclatement par option » — le regroupement la ramène d'une ligne par option à une ligne par vote.
- [x] ⚠️ Consigner pour `bmad-ux`/`bmad-pm` : Q-25 close, point ouvert 13 d'`EXPERIENCE.md` clos, annotation 23 de la planche caduque.
- [x] Remplir Dev Agent Record (File List, Completion Notes, Change Log).
- [x] 🚨 Rappeler à l'utilisateur `/code-review` puis **`/security-review`** — **non optionnel sur cet épic** (`epics.md:335`) et **en dette depuis la 36.4**. Cette story **ajoute une écriture** : la dette n'est plus seulement formelle.

### Review Findings

- [x] [Review][Decision] ⚠️ AC16 violée : clé de scellement dédiée créée au lieu de réutiliser `cta.choose_date` — **Résolu 2026-08-23** : décision utilisateur de garder `calendar.agenda.action_seal` (le libellé `cta.choose_date` répété jusqu'à 40× sur un vote déplié cassait la mise en page). AC16 amendée en conséquence.
- [x] [Review][Decision] Tâche 8 cochée mais scellement réel jamais exercé à l'écran — **Résolu 2026-08-23, vérifié pour de vrai via Chrome MCP** : sur la partie « Les Veilleurs du Pont », vote 14 créneaux déplié manuellement (AC8), favori mis en avant (AC4), scellement confirmé via le dialogue (AC11), écriture réelle effectuée — la ligne « bibou » est passée de « Ce qui t'attend » à « Ce qui est prévu » avec la date scellée « jeudi 24 septembre, après-midi ». Le libellé dédié « Planter » (AC16, cf. décision #1) s'affiche correctement, court, sans casser la mise en page.
- [x] [Review][Decision] ~~Tâche 9 cochée mais `deferred-work.md` / `sprint-status.yaml` non modifiés dans le diff~~ — **Faux positif, vérifié 2026-08-23** : `_bmad-output/` est gitignoré (mémoire projet), donc `git diff HEAD` ne peut par construction jamais montrer ses modifications. La section « Deferred from: dev-story of 36-12-... » est bien présente dans `deferred-work.md` avec les quatre points requis par la tâche 9. Rien à faire.
- [x] [Review][Decision] Ligne de vote dégradée (`ungrouped`, sans agrégats) affiche un badge « Réponds au vote » sans aucun bouton de réponse — **Corrigé 2026-08-23** : `badgeFor()` retourne désormais `null` quand `entry.vote` est absent sur une entrée `votes-en-cours` [agenda-badge.utils.ts:158-162].
- [x] [Review][Decision] `startCompose(seanceId)` écrase silencieusement une composition en cours — **Corrigé 2026-08-23** : le clic est ignoré si `composing()` est vrai et `composedCells()` non vide, évitant l'écrasement silencieux [calendar-view.ts:921-927].
- [x] [Review][Decision] `missingByPoll` : effectif non rafraîchi, ambiguïté chargement/vide, et MJ absent de `GET /parties/:id/members` — **Corrigé partiellement 2026-08-23** : (1) `members()` est désormais rechargé via `loadMembers()`, rappelée depuis l'effet `scenariosSvc.changed()` déjà scopé `partie:{id}` [calendar-view.ts] ; (2) nouveau signal `membersLoaded` distingue « personne ne manque » de « pas encore chargé » dans `missingByPoll`. (3) MJ absent de `GET /parties/:id/members` : **reporté** — dette serveur pré-existante, déjà documentée en commentaire au-dessus de `missingByPoll` (« dette connue, héritée de la 36.6 »), hors périmètre Front (AC17). 2113 tests verts après correctif, aucune régression.
- [x] [Review][Decision] ~~`onPollLaunchRequested()` : ordre `onViewChange('month')` puis `startCompose(seanceId)` non garanti sans effet de bord~~ — **Rejeté 2026-08-23, vérifié** : `onViewChange()` (`calendar-view.ts:1508-1512`) est purement synchrone (`closePicker()` + `this.view.set(...)`), aucun appel réseau ni effet de bord asynchrone susceptible d'écraser `composeTarget`/`composing`. Pas un bug réel.
- [x] [Review][Patch] `discloseLabel()` code en dur "Replier"/"Déplier" au lieu du registre de thème [calendar-agenda-view.ts] — thématisé via deux nouvelles clés `action_expand`/`action_collapse` dans les trois thèmes.
- [x] [Review][Patch] Bouton "Renoncer" du dialogue de scellement non thématisé [seal-confirm-dialog.html] — réutilise `account.cancel_btn`, déjà thématisé.
- [x] [Review][Patch] Risque de double ouverture du dialogue de scellement [calendar-view.ts:onSealRequested] — `pollActionPending` posé AVANT l'ouverture du dialogue au lieu d'après confirmation ; test étendu pour vérifier `dialog.open` appelé une seule fois.
- [x] [Review][Patch] Résumé de dates (`optionDates()`/`pollMeta()`) ignore le créneau (`slot`) [calendar-agenda-view.ts] — inclut désormais le créneau et déduplique sur `date+slot`, tri chronologique du jour (nouvel `SLOT_ORDER`) ; test dédié ajouté.
- [x] [Review][Patch] Test de longueur de libellé (≤14 caractères) ne couvre que `action_seal`, pas `action_launch_poll` [tones.spec.ts] — garde ajoutée (≤20 caractères, aligné sur le maximum actuel).
- [x] [Review][Patch] `pollBadge(row.group)` recalculé deux fois par passage dans le template [calendar-agenda-view.html] — mémoïsé via `@if (...; as b)`, comme pour les lignes non groupées.
- [x] [Review][Patch] Garde `if (!option.vote) continue` dans `pollRespondedCount()` [agenda-badge.utils.ts] — gardée (défensive), commentaire clarifié pour expliquer pourquoi ce n'est pas du code mort.
- [x] [Review][Patch] Docstring de `SealConfirmDialog.cancel()` inexacte [seal-confirm-dialog.ts] — corrigée pour décrire le comportement réel (`!confirmed` côté appelant, pas une garantie du dialogue).
- [x] [Review][Patch] `missingByPoll` ne revérifiait pas `partieId() !== null` [calendar-view.ts] — garde alignée sur `canSeal`.
- [x] [Review][Patch] `membersCount` dérivé uniquement du `.total` de la première option triée [agenda-badge.utils.ts:groupVoteEntries] — dérivé du MAXIMUM sur toutes les options du groupe.

**Vérification après application des 10 patchs (2026-08-23) :** `docker compose exec web pnpm test` — 2117 tests verts (+4 depuis la baseline post-story, aucune régression) · `docker compose exec web pnpm lint` — 142 erreurs, identique à la baseline, aucune erreur nouvelle.
- [x] [Review][Defer] `nearestDate` retombe silencieusement sur `''` si toutes les options d'un groupe sont sans date [agenda-badge.utils.ts] — deferred, pre-existing pattern (même traitement que les autres entrées sans date, non testé pour ce cas précis)

---

## Hors périmètre

- **La barre repliée « ☰ Affichage », la légende et les préférences** — story **36.14**.
- **« Sceller ce créneau » depuis la barre de sélection** (`contrat-ui-calendrier.html:376`, `EXPERIENCE.md:577`) — toujours **sans story porteuse** (`deferred-work.md:35, 39`). Cette story livre le scellement **depuis l'Agenda**, ce que ses AC demandent, et rien d'autre. La question de la barre reste posée à l'utilisateur.
- **Tout changement serveur** : `expiresAt` à la création d'un vote, rôle ou identité sur `MyCalendarPollEntry`, plage de `GET /me/calendar` (AC17).
- **Toucher au panneau complet de la fiche de scénario** (`seance-list`, `<app-poll-status>`).
- **Défaire l'éclatement par option** dans `allCalendarEntries()`.
- **La virtualisation / pagination** de la liste — le regroupement réduit fortement le volume, il ne referme pas la question.
- **Extraire un `StatusBadge` partagé** avec le dashboard.
- **Les 143 erreurs de lint pré-existantes.**

---

## Ce qui doit continuer de fonctionner

Une story doit laisser le système entier debout, pas seulement satisfaire ses AC.

1. **Les vues Mois et Semaine, à l'identique** — elles consomment `calendarEntries()` (non filtré, **une entrée par option**), que cette story ne touche pas.
2. **Le rail de détail** (36.1) — il consomme `allCalendarEntries()`. Toute modification de la source le casse silencieusement.
3. **Le sélecteur de réponse de vote** (36.7) depuis les **quatre** surfaces, retrait compris.
4. **Le mode de composition** (36.10) armé depuis « Ajouter des dates », avec ou sans Destinée — le nouveau point d'entrée s'ajoute, il ne remplace pas.
5. **Le mode Destinée** (36.9), y compris sa mort quand le vote courant disparaît — **un scellement fait disparaître un vote** : vérifier que la Destinée le supporte.
6. **La fiche de scénario** : son panneau complet, son « Sceller ce créneau », son « Lancer le vote » (`seance-list`).
7. **Les trois sections, le tri et l'effacement à vide** de la 36.11 (AC18).
8. **Le défaut mobile** (36.11, AC6/AC15) : l'agenda sur téléphone, sans verrou.
9. **La bascule de couches** et la pastille « Affichage filtré » — cinq interrupteurs, sans faux positif.
10. **Le rechargement temps réel** (`scenariosSvc.changed()`) : une réponse d'un autre membre peut **rendre un vote mûr en direct** ; la ligne doit se déplier d'elle-même, sans geste.

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Regrouper dans `allCalendarEntries()`** au lieu de l'affichage — casse le Mois, la Semaine et le rail (encadré n°1).
2. **Prendre « d'office » pour un verrou** et supprimer les options d'un vote non mûr — supprime le seul chemin de réponse depuis l'Agenda (encadré n°2).
3. **Rendre un bouton *Sceller* désactivé** au lieu de ne pas le rendre (AC12) — même règle que l'AC12 de la 36.11.
4. **Câbler `canSeal` sur `isMjMode()` seul** — le calendrier personnel n'a pas de mode MJ mais un utilisateur peut y être MJ ailleurs ; c'est `partieId() !== null` qui tranche (encadré n°5).
5. **Sceller sans confirmation** — `choose()` ferme le vote et pose `Partie.nextSessionDate`, sans retour arrière produit (AC11).
6. **Oublier `await loadScenarios()`** après le scellement — `chooseDate()` renvoie `void` ; la ligne resterait « vote ouvert ». Défaut réel déjà payé (`deferred-work.md:848`).
7. **Un `pollId` remplacé par un index** dans l'état de dépliement — `activePolls()` est reconstruit à chaque événement temps réel (piège fondateur de la 36.9).
8. **Déclarer mûr un vote à effectif nul** — `0 >= 0` déplierait tout. `membersCount > 0` est une précondition, pas un détail.
9. **Sommer les `respondedCount` des options** au lieu d'en prendre le **min** — un vote à 3 options répondues par une personne afficherait « 3 sur 4 ont répondu ».
10. **Agréger une piste au niveau du vote** — elle affirmerait un avis que personne n'a exprimé (AC14, `poll-track.utils.ts:11-20`).
11. **Imbriquer le bouton *Sceller* ou le sélecteur dans le bouton de ligne** — HTML invalide, navigation clavier cassée (piège n°9 de la 36.11).
12. **Conditionner *Sceller* au rang de l'option** — l'AC4 exige que les autres restent scellables.
13. **Réintroduire un formulaire de création de vote** dans l'Agenda — FR-52 l'a supprimé (encadré n°4).
14. **Écrire `composing`/`composeTarget` à la main** au lieu de passer par `startCompose()` — contourne `canCompose()`.
15. **Oublier d'exempter `seances-sans-date` du filtre par couche** — la ligne n'apparaîtrait jamais, et rien ne le dirait.
16. **Ajouter `seances-sans-date` à `MEANINGFUL_TYPES`** — le rail se poserait sur un jour vide.
17. **Poser une clé de ton dans un seul thème** — `undefined` rendu dans les deux autres (piège n°12 de la 36.9).
18. **Créer une clé « Sceller » alors que `cta.choose_date` existe** dans les trois thèmes.
19. **Construire des `Date` pour comparer des jours** — comparer les clés `YYYY-MM-DD`. Le piège UTC/local a déjà coûté la story 1-8.
20. **Un `new Date()` dans le composant** au lieu du `todayKey` injecté — aucun test déterministe (piège n°14 de la 36.11).
21. **Rendre un nouvel `input`/`output` obligatoire** sans réparer les fixtures — piège payé trois stories de suite.
22. **Écrire en base de développement** pour se fabriquer un vote mûr — muter le signal côté client, comme la 36.11.

### Décisions arrêtées par cette story

- **D-1 — Q-25 est close** : mûr = *tout le monde a répondu* **ou** *une option réunit la majorité absolue*. Le critère d'échéance est abandonné, `expiresAt` n'étant jamais écrit. ⚠️ À répercuter dans le PRD, `EXPERIENCE.md` et la planche.
- **D-2 — Une ligne d'agenda = un vote**, aux deux rôles et dans les deux contextes. Le regroupement est **à l'affichage** ; l'éclatement par option reste la source des grilles et du rail. ⚠️ Renverse le rendu livré par la 36.11.
- **D-3 — La maturité gouverne le dépliement PAR DÉFAUT, pas la possibilité de déplier** (encadré n°2). Sans quoi répondre à un vote non mûr deviendrait impossible depuis l'Agenda.
- **D-4 — Ni scellement ni lancement dans le calendrier personnel**, quel que soit le rôle réel de l'utilisateur : la donnée qui l'autoriserait n'existe pas et ne doit pas y transiter (AD-9). Asymétrie consignée.
- **D-5 — « Lancer un vote » bascule sur Mois et arme la composition de la 36.10**, ciblée sur la séance. Aucun second chemin de création, aucun formulaire ressuscité. *(Décision utilisateur, 2026-08-23.)*
- **D-6 — Le scellement se confirme** (AC11), en nommant la date et le créneau. Irréversible côté produit.
- **D-7 — Pas de piste au niveau du vote**, seulement le compteur en toutes lettres (AC14). ⚠️ Écart assumé avec la planche.
- **D-8 — « Lancer un vote » est un bouton, pas un badge.** ⚠️ Écart avec la planche, et exception explicite à D-6 de la 36.11 : ici l'action *est* le contenu de la ligne.
- **D-9 — « Avoir répondu » à un vote groupé = avoir répondu à TOUTES ses options** — la définition de `getMissingVoters()`, réutilisée plutôt que redoublée.

### Décisions laissées à l'implémentation

- **La forme de `AgendaVoteGroup`** : un type à part, ou une `AgendaEntry` portant `options?: AgendaEntry[]`. *Recommandation : un type à part — `AgendaEntry` est déjà chargé de neuf champs optionnels, et un groupe n'est pas une entrée.*
- **Le rendu des options** : `<ul>` imbriquée ou `<div role="group">`. *Recommandation : `<ul>` — la liste reste une liste, patron déjà retenu par la 36.11.*
- **Le composant de confirmation du scellement** : `MatDialog` générique ou composant frère minimal. *Recommandation : un composant frère de `ComposeConfirmDialog`, pour ne pas ajouter une troisième face à un dialogue dont les deux faces sont documentées comme exclusives.*
- **Le gabarit de « il manque … »** au-delà de trois noms (« Léa, Tom, Zoé et 2 autres »).
- **Le nom des classes SCSS** — suivre le préfixe `agenda-` existant.

### Notes de plateforme

- **Web** : Angular 22 **zoneless**, Material + CDK 22.0.2, Vitest 4.0.8, TypeScript 6.0.2. `@if` / `@for`, signals, `input()` / `output()`, `standalone: true`, `import type` pour `@master-jdr/shared`.
- **Aucune dépendance nouvelle, aucune migration, aucun changement d'API.**
- **Exécution : tout par Docker** — `docker compose exec web pnpm <…>`. Jamais d'outil Node sur l'hôte.
- **Context7 (MCP)** avant d'écrire du code framework-spécifique — en particulier pour un `signal` d'état d'expansion et les motifs `aria-expanded` en Angular 22.
- `packages/shared` **n'est pas** modifié ⇒ `pnpm typecheck` API non requis.

### Évaluation SSE (obligatoire, checklist projet)

**Verdict : aucun câblage nouveau, ni serveur ni client. Mais une vérification de plus qu'à la 36.11.**

- Le scellement **écrit**, et le serveur émet déjà pour lui : `PollService.choose()` fait `realtimeEvents.emit(partieTopic(partieId))` **et** `parties.notifyPartieSignalsChanged()` (`poll.service.ts:207-211`). Rien à ajouter côté serveur.
- Côté client, `CalendarView` est déjà rebranché sur `scenariosSvc.changed()` (`calendar-view.ts:1029-1044`), qui recharge les scénarios **et** ferme le sélecteur ouvert. Le regroupement se recompose donc sans code supplémentaire.
- 🚨 **À vérifier de visu (tâche 8), c'est nouveau** : la réponse d'un autre membre peut faire **franchir le seuil de maturité** à un vote pendant qu'il est à l'écran. La ligne doit se déplier **d'elle-même**. C'est un `computed` sur des signaux déjà réactifs — mais un `expanded` mal écrit (par exemple un état copié une fois dans un `effect`) le casserait.
- Écarts SSE **existants et inchangés** : `heatmap` non câblée, `GET /me/calendar` non câblé (`deferred-work.md`).

[Source: `CLAUDE.md` ; `docs/checklist.md`]

### Sécurité

🚨 **`/security-review` est NON OPTIONNEL sur cet épic** (`epics.md:335`) et **en dette depuis la 36.4**. Cette story **ajoute une écriture** — la dette cesse d'être formelle.

- **Autorisation : le serveur reste la garde.** `PollService.choose()` appelle `getOwned(partieId, userId)` — un non-MJ reçoit 403/404 quoi que fasse le client. `canSeal` est une affaire d'**interface**, jamais de sécurité : ne jamais raisonner comme si l'absence de bouton protégeait quoi que ce soit.
- **Le triplet d'identité vient de la donnée, pas de la route** : `partieId` est porté par `VoteParticipation` (36.7). En calendrier personnel il désigne une **autre** partie que celle affichée — c'est précisément pourquoi D-4 y interdit le scellement plutôt que de composer une URL au jugé.
- **Aucune donnée nouvelle n'est exposée.** Les options, les agrégats et ma réponse sont déjà rendus par la même liste aujourd'hui ; cette story les **regroupe**. « Il manque Léa, Tom » vient de `members()`, déjà chargé en mode MJ et déjà rendu par `<app-poll-missing>` sur le même écran.
- 🚨 **Aucune identité ne doit rejoindre le calendrier personnel** : `MyCalendarPollOption` est anonyme par conception (`shared:665-670`). Ne rien y recomposer, ne rien y déduire.
- **XSS** : titres de scénario, noms de partie et noms affichés sont du texte libre. Interpolation `{{ }}` uniquement — jamais `[innerHTML]`, jamais `bypassSecurityTrust*`, y compris dans les `aria-label` composés.
- **Double soumission** : la garde `pollActionPending()` couvre le scellement comme la clôture. Une écriture irréversible déclenchée deux fois est un défaut, pas une redondance.

### Dette refermée par cette story

- **L'Agenda du MJ inactionnable** — `contrat-ui-calendrier.html:721` le classe « Neuf ». C'est le motif de la story.
- **Le calendrier sans aucun chemin de scellement depuis la 36.9** (`deferred-work.md:39`) — refermé **pour l'Agenda**. La barre de sélection reste ouverte.
- **Q-25** (`prd.md:481`, `EXPERIENCE.md:776`, planche annotation 23) — close par D-1.
- **La liste Agenda gonflée par l'éclatement par option** (`deferred-work.md:23, 75, 82`) — 21 lignes deviennent une poignée. La question de la **borne** reste ouverte.
- **Le littéral `'sans date'` hors registre de thème** (revue de code de la 36.11) — corrigé au passage, `metaLine()` étant réécrite.

### Dette explicitement NON refermée

- ⚠️ **Ni scellement ni « Lancer un vote » en calendrier personnel** (D-4, encadré n°5) — demande un rôle sur `MyCalendarPollEntry`, donc du serveur.
- ⚠️ **« Il manque … » ne peut pas nommer le MJ** : `GET /parties/:id/members` ne le renvoie pas, alors qu'il peut voter (dette de la 36.6, redite par `PollMissingPanel`). Le **compte** reste juste.
- ⚠️ **`SessionPoll.expiresAt` n'est jamais écrit** — le critère d'échéance de Q-25 reste inatteignable tant qu'une story serveur ne le pose pas.
- ⚠️ **« Sceller ce créneau » depuis la barre de sélection** — toujours sans story porteuse.
- ⚠️ **« C'est passé » vide en contexte personnel** (36.11, encadré n°2).
- ⚠️ **Une inscription ouverte du calendrier personnel n'est pas ouvrable** (pas de `scenarioId`).
- ⚠️ **La piste en méta de ligne de vote** dessinée par la planche, non rendue (AC14, D-7).
- **La liste Agenda non bornée**, `heatmap` sans SSE, `GET /me/calendar` sans SSE, « Soirée »/« Soir », budget de bundle web, `loading` du rail sans `slotsLoading`, contraste `.agenda-badge--done` en Steampunk.

### References

- [Source: `_bmad-output/planning-artifacts/epics.md:2416-2456`] — les six AC, verbatim · [`:1909, 1928`] — FR-56, portée « Front — dépend de Q-25 » · [`:335`] — `/security-review` non optionnel · [`:1932-1938`] — convention de lecture du contrat d'UI.
- [Source: `prds/prd-jdr-master-2026-08-01/prd.md:481`] — Q-25 et sa proposition d'origine · [`:359-364`] — FR-56.
- [Source: `ux-designs/ux-jdr-master-2026-08-04/EXPERIENCE.md:352-357`] — l'Agenda du MJ, le dépliement conditionné, « Lancer un vote », la structure unique aux deux rôles · [`:571-585`] — table des actions, *Sceller depuis l'Agenda*, *Lancer un vote depuis l'Agenda*, la destination d'une séance activée · [`:776`] — point ouvert 13.
- [Source: `ux-designs/…/mockups/contrat-ui-calendrier.html:476-514`] — planche 5, l'Agenda côté MJ, annotations 22 à 24 · [`:324-356`] — planche 3, l'Agenda joueur, **une ligne par vote** · [`:721`] — « Agenda du MJ — options dépliées + Sceller : Neuf » · [`:731`] — Q-25 dernier point ouvert de la planche.
- [Source: `apps/web/.../calendar-agenda-view/calendar-agenda-view.ts:33-100`] — `AgendaEntryType`, `AgendaEntry` · [`:190-224`] — `sections()` · [`:250-262`] — `metaLine()` (et le littéral `'sans date'` de `:255`) · [`:311-314`] — `openTarget()`, la garde anti-imbrication.
- [Source: `apps/web/.../agenda-badge.utils.ts:122-165`] — `sectionIdFor()`, `badgeFor()`, à étendre.
- [Source: `apps/web/.../calendar-view/calendar-view.ts:126`] — `ComposeTarget` · [`:160, 292`] — `mode`, `isMjMode` · [`:301-329`] — `activePolls`, `eligibleSeances` · [`:361-568`] — `allCalendarEntries`, l'éclatement par option · [`:573-590`] — `agendaEntries` et son exemption · [`:764-800`] — l'état de composition · [`:837-861`] — `startCompose()` · [`:900-980`] — `confirmCompose()` · [`:1170`] — `members()` en mode MJ seul · [`:1240`] — `onScenarioActivated` · [`:1585-1598`] — `onClosePoll()`, le patron d'écriture · [`:1600-1607`] — le commentaire qui annonce cette story.
- [Source: `apps/web/.../calendar-view.html:104-115`] — le câblage de l'agenda · [`:180-195`] — `<app-poll-missing>` et l'avertissement sur la fiche de scénario.
- [Source: `apps/web/.../poll-track.utils.ts:11-20`] — la règle fondatrice de la piste · [`:96-160`] — `respondedCount`, `trackSegments`, `counterLabel`, `answerLabel`, `participationAriaLabel`, et les gardes `safeCount`.
- [Source: `apps/web/.../compose-confirm-dialog/compose-confirm-dialog.ts:5-61`] — `ComposeSeanceChoice`, le pré-remplissage à une seule séance.
- [Source: `apps/web/src/app/core/poll/poll.service.ts:70-74`] — `chooseDate` · [`:86-108`] — `setPollOptions` · `core/poll/poll.util.ts` — `getMissingVoters`.
- [Source: `apps/web/.../features/scenarios/seance-list/seance-list.ts:157-169`] — `onChoose()`, le patron d'écriture et le chemin de scellement existant.
- [Source: `apps/api/src/poll/poll.service.ts:170-212`] — `choose()`, `getOwned`, les deux émissions temps réel · [`:63-76`] — la création, qui n'écrit **pas** `expiresAt` · `poll.controller.ts:75-95` — la route et le recalcul best-effort.
- [Source: `packages/shared/src/index.ts:725-745`] — `SessionPollDto`, `membersCount`, `expiresAt` · [`:663-694`] — `MyCalendarPollOption`/`MyCalendarPollEntry`, anonymes et sans échéance · [`:799-801`] — `ChooseDateDto`.
- [Source: `apps/api/prisma/schema.prisma:280-296`] — `SessionPoll`, `expiresAt` nullable.
- [Source: `_bmad-output/implementation-artifacts/36-11-…md`] — le rendu par option, les six badges, les pièges de plateforme · [`36-10-…md`, `36-9-…md`] — la composition, le mode, la discipline de vérification visuelle.
- [Source: `_bmad-output/implementation-artifacts/deferred-work.md:23, 35, 39, 75, 82, 848`] — la liste non bornée, le scellement sans story, le défaut de rechargement après `chooseDate`.
- [Source: `_bmad-output/project-context.md`, `CLAUDE.md`, `docs/checklist.md`] — Docker, conventions, SSE, rappels de fin de palier.

---

## Questions pour l'utilisateur (elles ne bloquent pas l'implémentation)

1. **La méta d'une ligne de vote ne portera pas de piste** (D-7, AC14), contrairement au dessin de la planche joueur : une piste au niveau du vote agrégerait des avis exprimés sur des créneaux différents et affirmerait un consensus que personne n'a formulé. Le compteur « 2 sur 4 ont répondu » est rendu en toutes lettres. **Confirmez-vous ?**
2. **Le calendrier personnel n'aura ni *Sceller* ni *Lancer un vote***, même pour un MJ (D-4) : rien dans `GET /me/calendar` ne dit de quelle partie je suis MJ, et y faire transiter cette information contredirait l'anonymat de conception. Acceptez-vous cette asymétrie, ou voulez-vous une story serveur ?
3. **« Sceller ce créneau » depuis la barre de sélection** reste sans story porteuse (`deferred-work.md:35, 39`) — la question vous est posée pour la **troisième** fois depuis la 36.9. Après cette story, le calendrier aura **un** chemin de scellement (l'Agenda) mais toujours **aucun depuis la grille**. Story dédiée, rattachement à la 36.14, ou abandon ?
4. **Le scellement demandera une confirmation** (D-6). Sur la fiche de scénario, aujourd'hui, il n'en demande **aucune**. Voulez-vous l'harmonisation dans l'autre sens (aucune confirmation nulle part), ou l'ajout de la confirmation aussi sur la fiche de scénario — auquel cas c'est une story à part ?

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (Claude Code, `bmad-dev-story`)

### Debug Log References

**Baseline (tâche 0, arbre propre, HEAD `452e5c9`)** — web **111 fichiers / 2043 tests** verts · lint web **142 erreurs pré-existantes** · `git status` vide.

**Final** — web **111 fichiers / 2113 tests** verts (**+70 tests**, aucune régression, aucun fichier de test nouveau : la matière est allée dans les trois specs existants) · lint web **142 = baseline exactement** · **aucun fichier de `apps/api/` ni `packages/shared/`** (AC17, vérifié par `git status`) · aucune migration, aucune dépendance.

*Pas de `pnpm typecheck` côté web : le script n'existe pas dans `apps/web/package.json` — c'est la compilation du bundle par `ng test` qui joue ce rôle, et elle est propre. Côté API il n'est pas requis, `packages/shared` n'étant pas modifié.*

**Quatre échecs traversés, et ce qu'ils ont appris :**

1. **Un test de maturité qui ne testait pas ce qu'il croyait.** La fixture du critère A (« une option incomplète suffit à rendre le vote non mûr ») posait `yes: 4` sur quatre membres — ce qui déclenchait le **critère B**, majorité absolue. Le test passait par le mauvais chemin. Corrigé en donnant à l'option complète une répartition **sans majorité** (1 oui, 1 peut-être, 2 non). *Leçon générale : quand deux critères suffisent séparément, une fixture qui satisfait les deux ne prouve rien.*
2. **Trois tests de la 36.11 sont tombés, exactement ceux que l'encadré n°1 annonçait caducs.** Ils décrivaient une ligne par option. Deux d'entre eux ont été **réécrits sur le nouveau contrat** (la ligne déplie au lieu d'ouvrir ; la piste vit sur l'option) ; le troisième, un test d'ordre, avait deux fixtures partageant le **même `pollId`** — elles fusionnaient désormais en une ligne et le test ne mesurait plus rien. Deux `pollId` distincts.

### Completion Notes List

**Ce qui est livré.** L'Agenda cesse de rendre **une ligne par option de vote** et rend **une ligne par vote**, aux deux rôles et dans les deux contextes. Un vote **mûr** déplie ses créneaux d'office, triés par faveur, chacun avec sa piste et — pour le MJ d'une partie — un bouton de scellement. Une séance sans date proposée porte « Lancer un vote », qui bascule sur le Mois et arme la composition de la 36.10 sur cette séance. **Front pur : aucun changement serveur, aucune migration, aucun appel réseau nouveau ; le scellement réutilise `PATCH …/poll/:pollId/choose`, intact.**

**L'effet du regroupement, mesuré à l'écran.** Sur le calendrier personnel du jeu de développement, « Ça t'attend » passe de **21 lignes** (toutes des options de deux votes) à **3**. La ligne « Les Veilleurs du Pont » résume ses **14 créneaux** en une phrase. C'est le défaut consigné dans `deferred-work.md:23` qui se referme.

**Les décisions de la story, toutes tenues :**

- **D-1 (Q-25)** — mûr = *tout le monde a répondu à toutes les options* **ou** *une option réunit la majorité absolue*. Le critère d'échéance est absent, et le code le dit sur place : `expiresAt` n'est écrit nulle part.
- **D-2** — le regroupement vit **à l'affichage**. `allCalendarEntries()` garde son éclatement par option ; un test dédié vérifie que `calendarEntries()` (Mois, Semaine, rail) reçoit toujours **deux entrées pour un vote à deux options**. Vérifié aussi à l'œil : la grille du Mois marque toujours chaque créneau proposé.
- **D-3** — la maturité gouverne l'état **par défaut** du dépliement. 🚨 L'état retenu est une **intention explicite du lecteur** (`Map<pollId, boolean>`), pas une inversion de la maturité : avec une inversion, un vote déplié à la main qui devient mûr en direct (SSE) se **refermerait tout seul** sous les yeux du lecteur. Cinq tests couvrent les quatre combinaisons.
- **D-4** — ni scellement ni lancement en calendrier personnel : `canSeal` porte **les deux** conditions (`isMjMode() && partieId() !== null`). Vérifié à l'écran sur `/profile/calendar` — aucun bouton, ni actif ni désactivé.
- **D-5** — « Lancer un vote » réutilise `startCompose(seanceId)`. `ComposeTarget` gagne un `seanceId?` et `composeSeanceChoices()` se restreint ; **`ComposeConfirmDialog` n'a pas changé d'une ligne**, il pré-remplit déjà quand il n'y a qu'un choix. Vérifié à l'écran : la vue bascule sur Mois, la barre de composition apparaît armée à zéro créneau.
- **D-6** — confirmation avant scellement, dans un composant frère de `ComposeConfirmDialog` plutôt qu'une troisième face ajoutée à celui-ci. Elle nomme le vote **et** le créneau (« bibou — jeu. 24 sept., après-midi »).
- **D-7** — aucune piste au niveau du vote, le compteur en toutes lettres. Le compteur est le **minimum** sur les options : « 0 sur 2 ont répondu » là où une somme aurait dit « 1 sur 2 » sur un vote dont une seule option a une réponse.
- **D-8/D-9** — « Lancer un vote » est un bouton, pas un badge ; « avoir répondu » = avoir répondu à **toutes** les options.

**Vérification visuelle réelle — faite, et elle a trouvé deux défauts qu'aucun test ne voyait.**

Chrome MCP (session de test connectée), calendrier **personnel** et calendrier de **partie en mode MJ**, sans **aucune écriture** en base.

1. 🚨 **Le compteur et ma réponse étaient rendus DEUX FOIS par option.** `<app-poll-track>` émet déjà `.cnt` et `.mine` (36.6) ; mes deux `<span>` les redoublaient. Retirés — la doctrine du projet est que *les surfaces ne reformulent jamais*. Les deux tests concernés interrogent désormais `app-poll-track .cnt` / `.mine`, ce qui les rattache au bon propriétaire.
2. 🚨 **Le libellé de scellement était une phrase, répétée quatorze fois.** La story prescrivait de réutiliser `cta.choose_date` — à l'écran, « Planter le drapeau de la clairière » passait à la ligne sous **chaque** option et doublait sa hauteur (65 px au lieu de 39 px), transformant un vote à 14 créneaux en mur. **Écart assumé avec la story** : une clé dédiée `calendar.agenda.action_seal` (« Sceller » / « Planter » / « Verrouiller »), qui est ce que porte la planche contractuelle. La phrase longue reste sur le bouton du **dialogue**, où il n'y en a qu'un. Un test de garde borne la clé à 14 caractères pour qu'une relecture éditoriale (35.3) ne puisse pas la rallonger sans le voir.

Vu et conforme : une ligne par vote · le vote mûr déplié d'office (« Chroniques de la Guilde », 6 options) · le vote non mûr compact puis déplié au clic · le favori en tête, mis en avant, **et les 14 options scellables** · « il manque Alice » · le dialogue nommant date et vote · « Lancer un vote » → Mois + barre de composition · aucun bouton de scellement en calendrier personnel · **contraste du bouton *Sceller* mesuré à 5,84 / 6,50 / 7,92 dans les trois thèmes**, au-dessus d'AA · à **360 px**, une ligne par option, zéro débordement (ma réponse passe de la phrase au mot, règle posée dans `poll-track.scss` où elle appartient, sur un conteneur **nommé** `agenda-list`).

✅ **EXERCÉ À L'ÉCRAN — l'écriture du scellement elle-même, confirmée le 2026-08-23 pendant la revue de code, avec le consentement de l'utilisateur.** Le vote MJ du jeu de développement sur « Les Veilleurs du Pont » (14 créneaux, favori « jeu. 24 sept., après-midi ») a été scellé pour de vrai : dialogue ouvert, confirmé, écriture réelle via `PATCH …/poll/:pollId/choose`, et la ligne est passée de « Ce qui t'attend » à « Ce qui est prévu » avec la date scellée affichée. ⚠️ **Ce vote MJ de 14 créneaux du jeu de développement est désormais consommé** (fermé, irréversible) — toute vérification visuelle future nécessitant un vote MJ mûr non scellé devra en recréer un (mutation client `window.ng`, comme pour `isPollMature`, ou un nouveau vote via la composition 36.10).

❌ **NON EXERCÉ — le franchissement du seuil de maturité en direct (SSE).** Il demande un second compte votant pendant que l'écran est ouvert. `isExpanded()` lit des signaux déjà réactifs et l'intention du lecteur est stockée séparément (D-3, c'est précisément le piège que cette forme évite), mais la démonstration reste due.

**Ce qui reste dû, non négociable :** ❌ **`/security-review`** — non optionnel sur cet épic (`epics.md:335`), en dette depuis la 36.4, et **cette story ajoute une écriture**. ❌ **`/code-review`** des stories **36-8**, **36-10**, **36-11** et de celle-ci.

**Les quatre questions de la story restent posées.** La n°4 gagne du poids : le scellement demande maintenant une confirmation dans l'Agenda et **aucune** sur la fiche de scénario.

### File List

**Nouveaux :**

- `apps/web/src/app/features/calendar/seal-confirm-dialog/seal-confirm-dialog.ts`
- `apps/web/src/app/features/calendar/seal-confirm-dialog/seal-confirm-dialog.html`

**Modifiés :**

- `apps/web/src/app/features/calendar/agenda-badge.utils.ts`
- `apps/web/src/app/features/calendar/agenda-badge.utils.spec.ts`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.ts`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.html`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.scss`
- `apps/web/src/app/features/calendar/calendar-agenda-view/calendar-agenda-view.spec.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.ts`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.html`
- `apps/web/src/app/features/calendar/calendar-view/calendar-view.spec.ts`
- `apps/web/src/app/features/calendar/poll-track/poll-track.scss`
- `apps/web/src/app/core/theme/tones.ts`
- `apps/web/src/app/core/theme/theme-tone.service.spec.ts`
- `_bmad-output/implementation-artifacts/deferred-work.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `_bmad-output/implementation-artifacts/36-12-lagenda-du-mj-options-depliees-et-scellement.md`

### Change Log

**2026-08-23 — Story 36.12 « L'Agenda du MJ, options dépliées et scellement » implémentée (FR-56).** L'Agenda cesse de rendre une ligne par **option** de vote et rend une ligne par **vote** — 21 lignes deviennent 3 sur le jeu de développement — aux deux rôles et dans les deux contextes, le regroupement vivant **à l'affichage** pour ne pas priver la grille et le rail de l'éclatement dont ils dépendent. **Q-25 est close** : un vote est mûr si tout le monde a répondu ou si une option réunit la majorité absolue ; le critère d'échéance du PRD est abandonné, `SessionPoll.expiresAt` n'étant jamais écrit. Un vote mûr déplie ses créneaux **d'office**, triés par faveur, le favori mis en avant **sans cesser de rendre les autres scellables** ; un vote non mûr reste compact mais **se déplie au clic**, sans quoi répondre depuis l'Agenda deviendrait impossible. Le MJ d'une partie scelle un créneau depuis la ligne, après une confirmation qui **nomme la date** ; une séance sans date porte « Lancer un vote », qui bascule sur le Mois et arme la composition de la 36.10 **ciblée sur elle**. Ni scellement ni lancement en calendrier personnel, faute d'y connaître le rôle — et sans y faire transiter la moindre identité. **Front pur : aucun changement serveur, aucune migration.** Web 111 fichiers / 2113 tests verts (baseline 111/2043), lint 142 = baseline.
