# Revue adversariale — ARCHITECTURE-SPINE.md (Palier 9)

- **Cible :** `_bmad-output/planning-artifacts/architecture/architecture-jdr-master-2026-08-04/ARCHITECTURE-SPINE.md`
- **Contexte :** PRD Palier 9 (`prd.md` + `addendum.md`), code brownfield lu (schema Prisma, `character.service.ts`, `mode.service.ts`, `realtime.service.ts` web + api, `theme-tone.service.ts`, `availability.service.ts`, `game-system.service.ts`, `packages/shared/src/index.ts`)
- **Méthode :** construction de **paires de stories** qui respectent chacune *toutes* les AD à la lettre et construisent quand même de façon incompatible. Une paire qui tient = un trou de la spine, pas un défaut de story.
- **Date :** 2026-08-04

## Verdict

La spine est solide sur ses interdits (elle empêche bien les quatre stockages de préférences, le fan-out par partie, le filtrage en contrôleur), mais elle **fixe systématiquement le *lieu* d'une décision sans en fixer la *forme*** : la carte de signaux (AD-3), la fiche filtrée (AD-7), les DTO d'identité (AD-2) sont désignés par leur point d'application, jamais par leur contrat. Treize paires divergentes tiennent ; trois sont bloquantes et une AD (AD-14) est, en l'état du câblage SSE existant, **inapplicable telle qu'écrite**.

Récapitulatif :

| # | Titre | AD visées | Gravité |
|---|---|---|---|
| P-1 | `PartySignalsService` sur le préfixe `partie:` — inapplicable sans ressusciter le fan-out | AD-14, AD-3 | **Bloquant** |
| P-2 | Forme d'un champ verrouillé : clé absente vs clé nulle | AD-7 | **Bloquant** |
| P-3 | Forme de la carte de signaux non spécifiée | AD-3 | **Bloquant** |
| P-4 | `sheetSchema.fields` déjà utilisé — sens inversé entre deux lectures d'AD-7 | AD-7 | Élevée |
| P-5 | `displayName` NOT NULL sans défaut vs `AuthService.register()` hors périmètre | AD-1, AD-2 | Élevée |
| P-6 | Deux propriétaires du thème actif, deux chemins d'écriture | AD-13, AD-1, AD-14 | Élevée |
| P-7 | Indisponibilité dérivée : déclaration synthétique vs surcharge post-agrégation | AD-9 | Élevée |
| P-8 | Deux sources de « prochaine séance » : `Partie.nextSessionDate` vs dérivation | AD-3, AD-8 | Élevée |
| P-9 | Forme de l'identité dans les DTO : champs plats vs objet imbriqué | AD-2 | Moyenne |
| P-10 | `hideFinishedParties` : filtrage serveur vs client (intentions contradictoires *dans* la spine) | AD-1, AD-3, AD-8 | Moyenne |
| P-11 | `closedAt` × signaux : suppression ou non des signaux d'action | AD-8, AD-3 | Moyenne |
| P-12 | Deux demandes de changement d'e-mail en vol | AD-5 | Moyenne |
| P-13 | Thème supprimé du catalogue / valeur de compte orpheline | AD-13, AD-1 | Basse |
| P-14 | Retrait de vote après datation de la séance | AD-10, AD-9 | Basse |

---

## P-1 — `PartySignalsService` câblé sur `partie:` : AD-14 est inapplicable sans ressusciter le fan-out qu'AD-3 interdit

**Gravité : bloquant.** C'est le seul constat où les deux AD ne peuvent pas être satisfaites simultanément.

### Le fait brownfield

Le transport SSE n'est pas un bus global : `RealtimeService.connect(topic)` ouvre **un `EventSource` par topic**, et `urlForTopic()` ne connaît que deux URLs — `/parties/{id}/events` et `/users/me/events`. Un handler enregistré au préfixe `partie:` ne se déclenche **que si une connexion sur ce `partie:{id}` précis est ouverte**, c'est-à-dire uniquement quand l'utilisateur est *sur la page de cette partie*. Le commentaire de `realtime.service.ts` documente d'ailleurs le bug de production qui a fait **reculer** `ModeService` du préfixe `partie:` vers `user:`.

### La paire

- **Story A (« Signalétique temps réel, câblage minimal »)** enregistre `{ prefix: 'partie:', notifyChanged: () => this.partySignals.notifyChanged() }` dans la table de `RealtimeService`. Conforme mot pour mot à AD-14. Résultat : sur l'écran *liste des parties*, aucune connexion `partie:{id}` n'est ouverte — le handler ne se déclenche jamais. Les badges restent périmés jusqu'au rechargement : **exactement la régression qu'AD-14 dit prévenir**, et le code ajouté est mort.
- **Story B (« Signalétique temps réel, réellement vivante »)** lit la même phrase (« se rafraîchit sur les deux préfixes `partie:` et `user:` ») comme une exigence de résultat et ouvre, depuis la liste, une connexion `partie:{id}` **par partie affichée**. Résultat : N `EventSource` simultanés, N requêtes de rafraîchissement à chaque mutation — le fan-out réseau proportionnel au nombre de parties, littéralement le mécanisme qu'AD-3 interdit et qui a déjà coûté deux bugs de production.

Les deux stories respectent AD-14 à la lettre. L'une est inerte, l'autre reproduit le bug fondateur du palier.

### Le trou

AD-14 raisonne en *topics logiques* alors que le transport est en *connexions physiques ouvertes*. Aucune AD ne dit d'où arrive le signal de rafraîchissement **quand l'utilisateur n'est sur aucune partie**.

### AD à resserrer — AD-14, dernier paragraphe

> **Rule (remplacement du bloc « Côté front » d'AD-14) :** `PartySignalsService` expose `notifyChanged()` (P7-AD-4) et est câblé dans `RealtimeService` **sur le seul préfixe `user:`** — c'est la seule connexion ouverte en permanence par le Shell, et donc le seul canal qui atteint l'utilisateur quel que soit l'écran affiché. Ouvrir un `EventSource` par partie depuis la liste est explicitement interdit (AD-3). Corollaire côté serveur : **toute mutation qui change un signal d'une partie émet, en plus de `partie:{id}`, un `emit(userTopic(u))` pour chaque membre concerné** (MJ + membres), en fin de méthode et hors transaction (P7-AD-2) — les destinataires sont déjà résolus par `PartiesService.resolveParticipants()`, aucune requête supplémentaire. Sont concernées : clôture (AD-8), configuration de visibilité (AD-7), création/suppression de personnage, ouverture/clôture de vote, datation de séance, publication d'annonce. Lorsque l'utilisateur est sur la page d'une partie, le handler `partie:` existant de `PartiesService` couvre déjà le détail : `PartySignalsService` n'y est pas dupliqué.

---

## P-2 — AD-7 fixe le point d'application du filtrage, jamais la forme de la fiche filtrée

**Gravité : bloquant.** La fiche filtrée est la donnée partagée la plus consommée du palier (écran de consultation FR-22, composant d'identité AD-12, trois exports PDF).

### La paire

`toDto()` (`character.service.ts:1581`) renvoie `sheetData` tel quel. Deux stories implémentent AD-7 :

- **Story A (« Filtrage par omission »)** supprime les clés verrouillées : `delete filtered.narrative.age`, et retire `narrative` entièrement si la clé est verrouillée en bloc. Conforme : « un champ verrouillé ne transite jamais dans une réponse d'API ».
- **Story B (« Filtrage par neutralisation »)** conserve la structure et met la valeur à `null` : `narrative.age = null`. Tout aussi conforme — la valeur ne transite pas.

Les consommateurs, écrits par des stories tierces, cassent de façon asymétrique :

| Consommateur | Story A (omission) | Story B (null) |
|---|---|---|
| Gabarit fiche compagnon | clé absente → `@if (sheetData.narrative?.age)` masque proprement | affiche « null » ou une ligne vide selon l'écriture |
| Composant d'identité (AD-12) | `narrative.name` absent → nom de personnage `undefined` | nom `null` |
| `RyuutamaPdfService.fillCharacterPdf()` | champ PDF laissé vide | écrit littéralement `null` dans le champ AcroForm |
| Typage `CharacterSheetData` de `packages/shared` | exige `Partial<>` / clés optionnelles | exige `| null` sur chaque champ |

Les deux stories imposent au type partagé deux mutations **incompatibles**, et une story de front écrite contre l'une échoue silencieusement contre l'autre — sans erreur, avec une fiche qui affiche `null` à un joueur.

### Le trou

AD-7 dit *où* filtrer, et *quelle unité* est verrouillable. Elle ne dit rien de la **forme sur le fil** ni de la **signalétique du verrou** : le lecteur doit-il seulement savoir qu'un champ existe mais est masqué (pour afficher un cadenas, ce que FR-23 suggère) ou ne rien en savoir du tout ?

### AD à resserrer — AD-7, nouvelle contrainte de forme (4)

> **(4) Forme sur le fil.** Un champ verrouillé est **omis de `sheetData`** — jamais présent à `null`, jamais à une valeur vide : deux représentations d'« invisible » se traiteraient différemment écran par écran. `CharacterDto` porte en outre `lockedKeys: string[]` — la liste des clés (et sous-clés, notation pointée `narrative.age`) effectivement retirées **pour ce lecteur**, calculée dans le même `toDto()`. C'est la seule source du cadenas à l'affichage : aucun écran ne déduit un verrou de l'absence d'une clé, et un champ simplement non renseigné reste distinguable d'un champ verrouillé. `lockedKeys` est **toujours vide** pour le propriétaire et pour le MJ. Les types de `packages/shared` sont ajustés en conséquence (clés de `sheetData` optionnelles), jamais en ajoutant `| null`.

---

## P-3 — AD-3 fixe le nombre d'appels, jamais le contenu de la carte

**Gravité : bloquant.** AD-3 est l'AD la plus citée du palier (FR-12, FR-10, FR-3, FR-44) et son contrat est vide.

### La paire

« Une carte `partieId` → signaux » admet au moins deux formes défendables :

- **Story A (« Signaux booléens »)** — `Record<string, { needsCharacter: boolean; openPoll: boolean; noScenario: boolean; noMembers: boolean; missingReport: boolean; nextSessionDate: string | null }>`. Un booléen par situation, MJ et joueur mélangés (celui qui ne s'applique pas vaut `false`).
- **Story B (« Signaux énumérés »)** — `Record<string, { role: 'MJ' | 'PLAYER'; signals: PartySignalCode[]; status: 'UPCOMING' | 'RUNNING' | 'CLOSED' }>`, `PartySignalCode` étant une union de chaînes.

Les deux respectent AD-3 intégralement : un appel, requêtes groupées, rôle dérivé à la lecture. Mais la carte de B porte le **rôle** et le **statut**, celle de A non — or FR-8 (rôle par partie) et FR-10 (filtre par statut) doivent bien être servis par quelque chose. Avec la Story A, une troisième story les recalcule côté front depuis `mjParties`/`playerParties` et depuis `closedAt` du `PartieDto` ; avec la Story B, elle les lit dans la carte. Les deux écrans de liste construits en parallèle divergent, et le badge de rôle peut afficher deux résultats différents pendant le laps où l'une des deux sources est plus fraîche que l'autre — l'incohérence exacte qu'AD-3 dit prévenir (« un double calcul pour un utilisateur à la fois MJ et joueur »).

Trois questions restent en outre sans réponse et se répondront différemment story par story :
1. La carte couvre-t-elle **les parties clôturées** et **les parties masquées** par `hideFinishedParties` (cf. P-10) ?
2. Couvre-t-elle les parties où l'utilisateur n'a qu'une **invitation en attente** ?
3. La « date de la prochaine séance » est-elle un **signal** (booléen « date connue ») ou une **donnée** (la date elle-même, que la carte de la story A porte et pas celle de B) ?

### AD à resserrer — AD-3, ajout d'un contrat

> **Contrat de la carte (ajout à AD-3) :** `GET /me/party-signals` renvoie `Record<partieId, PartySignalsDto>`, type déclaré dans `packages/shared`, avec `PartySignalsDto = { role: 'MJ' | 'PLAYER'; status: 'UPCOMING' | 'RUNNING' | 'CLOSED'; signals: PartySignalCode[]; nextSessionDate: string | null }`. `PartySignalCode` est une **union de chaînes fermée** (`CHARACTER_MISSING`, `HOMME_DRAGON_MISSING`, `NO_MEMBERS`, `NO_SCENARIO`, `NO_DATE`, `OPEN_POLL`, `REPORT_MISSING`, `FINAL_REPORT_MISSING`) : ajouter un signal, c'est ajouter un membre à l'union, jamais un champ à l'objet. Le **rôle** (FR-8) et le **statut** (AD-8, FR-10) sont portés par cette carte et par elle seule — aucun écran ne les recalcule depuis `mjParties`/`playerParties` ni depuis `PartieDto.closedAt`. La carte couvre **toutes les parties dont l'utilisateur est MJ ou membre**, sans exception : ni la clôture ni la préférence de masquage ne réduisent son contenu (le masquage est une décision d'affichage — AD-1/P-10). Les invitations en attente n'y figurent pas : elles restent servies par `InvitationsService`.

---

## P-4 — `sheetSchema` déclare déjà `fields:` — et AD-7 lui donne le sens inverse

**Gravité : élevée.** Constat factuel, vérifiable en une lecture.

`getSchema()` (`game-system.service.ts:250`) renvoie déjà, aujourd'hui :

```ts
attributes: { type: 'object', fields: ['AGI', 'ESP', 'INT', 'VIG'] },
narrative:  { type: 'object', optional: true },   // aucun `fields`
```

AD-7 écrit : « une clé de type objet peut **en plus** déclarer ses sous-champs verrouillables individuellement — pour Ryuutama, `narrative` seul ».

- **Story A** ajoute une propriété distincte `lockableFields: [...]` sur `narrative` et laisse `fields` tranquille. Résultat conforme à l'intention : `narrative` finement verrouillable, `attributes` en bloc.
- **Story B** lit la propriété **existante** `fields` comme « sous-champs verrouillables » — lecture naturelle, AD-7 ne nomme aucune propriété. Résultat **exactement inverse** : `attributes` devient verrouillable attribut par attribut (AGI seul, VIG seul), `narrative` seulement en bloc.

L'écran de configuration MJ (FR-23) et le filtre de `toDto()` étant écrits par deux stories différentes, la combinaison A×B produit une configuration enregistrée que le filtre n'applique pas : **des cadenas posés par le MJ sans aucun effet serveur.** Défaut silencieux, sur le seul point du palier que le PRD qualifie de modèle d'autorisation.

Corollaire non couvert par AD-7 : `sheetSchema` **ne couvre pas tout `sheetData`**. `levelUps`, `eveilPowers`, l'XP, l'inventaire relationnel et surtout `derived` (les valeurs calculées : PV, PS, capacité) n'y figurent pas. Verrouiller `attributes` sans filtrer `derived` laisse fuiter l'information par le calcul.

### AD à resserrer — AD-7, contrainte (2) réécrite

> **(2) Unité déclarée par le schéma.** L'unité verrouillable est déclarée par une propriété **dédiée et nouvelle** du schéma, `lockable` : `lockable: true` sur une clé la rend verrouillable en bloc ; `lockable: { subFields: [...] }` la rend en outre verrouillable sous-champ par sous-champ. La propriété `fields` existante décrit la structure et **n'a aucun rôle d'autorisation** — la confondre avec `lockable` est explicitement interdit. Pour Ryuutama : `lockable: { subFields: ['sex','age','physicalTraits','homeTown','motivation','name','personality'] }` sur `narrative`, `lockable: true` sur les autres clés déclarées. **Ce qui n'est pas déclaré `lockable` n'est jamais verrouillable, et n'est donc jamais filtré.** Cas particulier : `CharacterDto.derived` étant calculé depuis `sheetData`, il est filtré **solidairement** — verrouiller une clé source retire les entrées de `derived` qui en dépendent, la table de dépendance étant déclarée à côté du schéma. Les clés de `sheetData` absentes de `sheetSchema` (`levelUps`, `eveilPowers`…) restent visibles ; les rendre verrouillables exige de les déclarer d'abord.

---

## P-5 — `displayName` NOT NULL sans défaut, et `AuthService.register()` n'est dans le périmètre d'aucune AD

**Gravité : élevée.** Rupture d'exécution, pas d'interprétation.

Le Structural Seed écrit `displayName String` (NOT NULL, aucun `@default`), et AD-1 précise « initialisée au `pseudo` **par la migration** ». La migration traite l'existant. **Personne ne traite les créations futures :** `AuthService.register()` (module `auth`) crée les `User`, et AD-4 confine explicitement le module `account` à l'état de compte, tandis qu'aucune AD ne mandate de modification d'`AuthService` — le PRD §5 (D-2) ne couvre que nom affiché / e-mail / mot de passe *pour un compte existant*.

- **Story A (« Migration `displayName` »)** applique AD-1 mot pour mot : colonne NOT NULL, backfill `displayName = pseudo`. Elle ne touche pas `auth`, qui n'est pas dans son périmètre. Toute inscription ultérieure lève une violation de contrainte.
- **Story B (« Écran de compte »)** consomme `displayName` en supposant qu'il est toujours peuplé — AD-2 lui interdit d'écrire le moindre repli `?? pseudo`. Sur un compte créé après la migration mais avant qu'une story ne pense à `register()`, elle affiche une chaîne vide ou plante.

Aucune des deux n'a tort. Le PRD dit d'ailleurs que l'inscription est sur invitation : le chemin `join`/`InviteLink` de `auth.service.ts:76` crée aussi des utilisateurs.

### AD à resserrer — AD-1, ajout

> **Ajout à AD-1 :** `displayName` est NOT NULL **et** initialisée par le code de création de compte, pas seulement par la migration : `AuthService.register()` (et tout chemin de création d'utilisateur, y compris l'acceptation d'un `InviteLink`) renseigne `displayName = pseudo` à l'insertion. Cette modification d'`AuthModule` est bornée à cette seule ligne et ne rouvre pas la frontière posée par AD-4. La colonne ne porte **pas** de `@default("")` : un défaut vide masquerait l'oubli au lieu de le faire échouer, et AD-2 interdit tout repli côté lecture.

---

## P-6 — Deux propriétaires du thème actif, deux chemins d'écriture, un ordre d'application non fixé

**Gravité : élevée.** C'est le cas « deux chemins de mutation concurrents pour le même état » à l'état pur.

`ThemeToneService` possède aujourd'hui `activeTheme` (signal), écrit `localStorage` et applique la classe CSS sur `document.body`. AD-1 ajoute `User.theme` ; AD-13 déclare le compte source de vérité et `localStorage` cache d'amorçage ; AD-14 range la préférence dans l'« état strictement personnel, rafraîchi localement ».

- **Story A (« Préférences de compte »)** fait du sélecteur de l'écran Compte l'appelant : `accountService.updatePreferences({ theme })` → succès → `themeToneService.setTheme(theme)`. Conforme AD-1, AD-13, AD-14.
- **Story B (« Thème persisté »)** fait de `ThemeToneService` le propriétaire unique : `setTheme()` applique la classe, écrit le cache **et** déclenche le `PATCH`. Tout aussi conforme — le compte reste la vérité, `localStorage` reste un cache.

Combinées : `setTheme()` de B est appelé par A **après** le PATCH de A, et redéclenche un second PATCH ; ou, si B rafraîchit ensuite depuis `GET /me` (AD-14, « rafraîchi localement après l'action »), la lecture rappelle `setTheme()` → boucle. À l'inverse, si seule A existe, tout autre point de changement de thème (raccourci, écran d'authentification) écrit `localStorage` sans jamais toucher le compte — et le cache remonte écraser la préférence au prochain amorçage, précisément ce qu'AD-13 interdit.

Trois cas limites que la Rule laisse ouverts :
1. **Ordre au démarrage :** le `constructor` applique la classe depuis `localStorage` ; le `GET /me` arrive plus tard. Si l'utilisateur change de thème pendant l'intervalle, la réponse du compte écrase-t-elle son geste ? Aucune règle de fraîcheur, et `ThemeToneService` n'a pas de compteur anti-course (contrairement à `ModeService`).
2. **Déconnexion :** le cache conserve-t-il le thème du compte quitté ? Sur un appareil partagé, l'écran de connexion s'affiche alors dans le thème du précédent utilisateur.
3. **Second appareil :** deux sessions modifient le thème ; AD-14 interdit toute émission SSE pour l'état personnel — la divergence entre appareils est acceptée, mais ce n'est écrit nulle part et une story pourrait « corriger » ce qu'elle prendra pour un bug.

### AD à resserrer — AD-13, bloc « Persistance » réécrit

> **Persistance (remplacement).** `ThemeToneService` est le **propriétaire unique** du thème actif côté front : il est le seul à écrire la classe sur `document.body`, le seul à écrire le cache `localStorage`, et le seul à appeler le `PATCH /me/preferences`. Aucun autre service ni composant n'écrit le thème — l'écran Compte appelle `ThemeToneService.setTheme()`, jamais `AccountService` directement. **Ordre d'application, non négociable :** (1) au démarrage, la classe est appliquée depuis le cache, avant toute requête ; (2) dès qu'une session est connue, `GET /me` écrase le signal et le cache — sauf si l'utilisateur a changé de thème depuis l'amorçage, arbitré par un compteur de séquence sur le modèle de `ModeService.mjSeq` (un échec réseau ne réinitialise jamais le thème) ; (3) un thème choisi hors session (écrans d'authentification) n'est écrit qu'en cache et est écrasé sans avertissement à la connexion. **À la déconnexion, le cache est purgé** et le thème de référence est réappliqué : un appareil partagé ne laisse pas fuiter la préférence du compte précédent. La divergence entre deux appareils connectés simultanément est **acceptée** : aucune émission SSE pour un état personnel (AD-14), le dernier écrivain gagne au prochain amorçage.

---

## P-7 — AD-9 dit « injectée dans l'agrégation », sans dire à quel étage

**Gravité : élevée.**

`AvailabilityService.computeSlotStatus()` applique une priorité stricte et documentée : `UNAVAILABLE` > `AVAILABLE` explicite > inférence positive > `UNKNOWN`, à partir d'un tableau de `DeclarationLike`.

- **Story A (« Indisponibilité synthétique »)** fabrique un `DeclarationLike` virtuel `{ kind: 'UNAVAILABLE', … }` par séance datée d'une autre partie et le concatène aux déclarations réelles avant `computeSlotStatus()`. Conforme : « injectée dans l'agrégation existante », « aucun nouveau `SlotStatus` », « jamais persistée ».
- **Story B (« Surcharge après calcul »)** appelle `computeSlotStatus()` inchangé puis force `UNAVAILABLE` sur les créneaux occupés ailleurs. Tout aussi conforme.

Elles divergent dès qu'un membre a **déclaré explicitement `AVAILABLE`** un créneau où il a une séance ailleurs : A rend `UNAVAILABLE` (la priorité l'emporte), B aussi. Mais elles divergent en sens inverse dans le cas symétrique, plus fréquent : la séance d'une autre partie tombe dans une **période récurrente déclarée disponible** — A produit `UNAVAILABLE` (priorité), B produit `UNAVAILABLE` également… tant que B écrase. Si B est écrite comme « l'occupation ne surcharge pas une disponibilité *explicite*, seulement une inférence », alors A et B donnent deux `AggregatedSlotDto` différents pour la même donnée, et **la vue MJ (`AvailableSlotDto`) et la vue joueur (`AggregatedSlotDto`), écrites par deux stories, cessent de s'accorder sur les compteurs**. Le MJ voit trois disponibles, les joueurs en voient deux.

Deux angles morts supplémentaires, factuels :

1. **Deux formes de séance datée existent.** `Seance.pollId → SessionPoll.chosenDate + chosenSlot` (date **et** créneau) et `Seance.dateValidee` (date **seule**, aucun `DaySlot` — cf. `schema.prisma:458` et `SeanceInscriptionDto.dateValidee`). AD-9 parle de « séance datée » sans trancher : une story couvre les deux et doit inventer un créneau pour `dateValidee` (journée entière ? tous les `DaySlot` ?), l'autre ne couvre que les séances issues d'un vote et laisse les campagnes épisodiques sans indisponibilité.
2. **Qui est « participant » d'une séance ?** Membres de la partie, ou seulement les `Inscription` pour une campagne épisodique (où une séance ne concerne qu'une partie des membres), ou les `ScenarioParticipant` ? Marquer tous les membres indisponibles pour une séance à laquelle ils ne sont pas inscrits est un faux négatif qui rendra la planification impossible.

### AD à resserrer — AD-9, ajout de trois précisions

> **Ajouts à AD-9.** **(a) Étage d'injection :** l'indisponibilité dérivée est fabriquée comme une `DeclarationLike` synthétique et concaténée aux déclarations réelles **avant** l'appel à `computeSlotStatus()` — jamais appliquée en surcharge après calcul. Elle est ainsi soumise à la priorité existante et à elle seule : `UNAVAILABLE` l'emporte, sans qu'aucune règle nouvelle ne soit introduite. Vue MJ et vue joueur consomment le même tableau de déclarations : elles ne peuvent pas diverger. **(b) Ce qui compte comme séance datée :** une séance dont le `SessionPoll` lié porte `chosenDate` **et** `chosenSlot`, ou dont `dateValidee` est renseigné — dans ce second cas, faute de `DaySlot`, l'indisponibilité couvre **tous les créneaux de la journée**. **(c) Qui est rendu indisponible :** le MJ de la partie concernée et les membres réellement attendus — les `Inscription` de la séance si `inscriptionMax` est défini, sinon tous les membres de la partie. Un membre non inscrit à une séance à capacité limitée n'est jamais rendu indisponible.

---

## P-8 — « Date de la prochaine séance » : `Partie.nextSessionDate` existe déjà, et contredit la convention « valeurs dérivées »

**Gravité : élevée.**

`Partie` porte déjà `nextSessionDate DateTime?` et `nextSessionSlot DaySlot?` — « Date confirmée de la prochaine séance (mise à jour par Epic 3) » (`schema.prisma:56`). C'est une valeur **dénormalisée et persistée**, en contradiction directe avec la ligne « Valeurs dérivées » des Consistency Conventions. La spine ne mentionne ce champ nulle part, alors qu'AD-3 fait de la prochaine séance un signal et qu'AD-8 fait dépendre « pas encore commencée » de l'absence de séance.

- **Story A (« Signaux serveur »)** lit `Partie.nextSessionDate` — un `findMany` sur les parties suffit, la contrainte de requêtes groupées d'AD-3 est trivialement satisfaite.
- **Story B (« Signaux serveur »)**, appliquant la convention « valeurs dérivées », recalcule la prochaine séance depuis `Scenario → Seance → SessionPoll.chosenDate` / `dateValidee`, par `groupBy` sur l'ensemble des `partieId`. Également conforme.

Elles donnent des résultats différents dès que le champ dénormalisé est en retard — ce qu'il est structurellement (« mise à jour par Epic 3 » : rien ne garantit qu'une séance datée par un autre chemin le mette à jour). Pire : le **statut** d'AD-8 en dépend. Une partie dont `nextSessionDate` est resté renseigné après annulation apparaît « en cours » chez A et « pas encore commencée » chez B, avec l'effet en cascade sur le filtre FR-10 et le masquage FR-3.

Et AD-8 elle-même laisse « pas encore commencée » sous-spécifié : « aucun scénario **ni** séance ». Un scénario créé sans séance : commencée ou non ? Un scénario `PASSE` sans aucune séance à venir sur une partie non clôturée : « en cours » ? La formulation « aucun scénario ni séance » se lit aussi bien comme un ET que comme un OU.

### AD à resserrer — AD-8, Rule complétée

> **Ajout à AD-8.** La dérivation est écrite **une seule fois**, dans `PartiesService`, exposée par une fonction pure testable, et prend cette forme exacte : `closedAt !== null` → `CLOSED` ; sinon, **au moins un `Scenario`** rattaché à la partie → `RUNNING` ; sinon → `UPCOMING`. Les séances n'entrent **pas** dans le calcul du statut (une partie peut avoir un scénario sans date, elle est commencée). La **date de la prochaine séance** (signal d'AD-3) est **dérivée** — la plus proche `SessionPoll.chosenDate` ou `Seance.dateValidee` future parmi les scénarios de la partie — et **jamais lue depuis `Partie.nextSessionDate`**, champ dénormalisé hérité d'Epic 3 dont la fraîcheur n'est garantie par aucun invariant. Ce palier ne le supprime pas et ne l'écrit pas : il cesse simplement de s'en servir comme source de vérité, et sa dépréciation est notée pour un palier ultérieur.

---

## P-9 — AD-2 exige deux champs, sans dire sous quelle forme, ni ce qu'il advient de l'e-mail déjà exposé

**Gravité : moyenne.**

AD-2 énumère les DTO concernés en finissant par « … » — les DTO existants ne sont pas énumérés exhaustivement. Ce qui est dans `packages/shared/src/index.ts` aujourd'hui :

| DTO | Identité portée | Après AD-2 ? |
|---|---|---|
| `PartieMemberDto` | `pseudo`, **`email`** | + `displayName` — et l'e-mail reste exposé à tout membre |
| `AvailableSlotDto.members[]` | `{ userId, pseudo, status }` | + `displayName` |
| `PollVoteDto` | `{ userId, pseudo, answer }` | + `displayName` |
| `SeanceInscriptionDto.inscrits[]` | `{ userId, pseudo }` | + `displayName` |
| `ScenarioDto.participants[]` | `{ userId, pseudo }` | + `displayName` |
| `HommeDragonDto.voyageursProteges[]` | `{ userId, pseudo }` | + `displayName` |
| `HommeDragonDto.historique[].participants` | **`string[]`** — chaînes nues | forme incompatible avec « deux champs » |
| `InvitationDto.inviterPseudo` | champ **plat** préfixé | `inviterDisplayName` ? `inviter: {…}` ? |
| `CharacterDto.ownerPseudo` | champ **plat** préfixé | `ownerDisplayName` ? `owner: {…}` ? |
| `XpDistributionEntryDto` | **aucune identité** (`characterId` seul) | FR-4b exige le pseudo à l'écran de distribution |
| `AnnouncementDto` | **aucun auteur** | AD-2 cite « auteurs d'annonce » — le DTO n'en porte pas, et `Announcement` n'a pas de colonne auteur |

- **Story A** ajoute des champs plats en miroir du style existant : `ownerDisplayName`, `inviterDisplayName`, `{ userId, pseudo, displayName }`.
- **Story B** introduit un `UserIdentityDto = { userId, pseudo, displayName }` réutilisable et refactore : `owner: UserIdentityDto`, `inviter: UserIdentityDto`.

Les deux respectent AD-2. Le composant d'identité partagé d'AD-12 — **écrit une seule fois, consommé partout** — ne peut pas accepter les deux : son `input` est soit un objet, soit trois entrées éclatées. Deux écrans construits en parallèle contre deux formes rendent le composant unique d'AD-12 impossible, ce qui vide AD-12 de son effet.

Deux angles morts : `AnnouncementDto` n'a **aucun auteur** (le modèle non plus) — AD-2 le cite pourtant ; et `XpDistributionEntryDto` n'a aucune identité, alors que FR-4b nomme explicitement la distribution d'XP comme écran sans personnage où le pseudo doit lever l'homonymie.

### AD à resserrer — AD-2, ajout de forme + traitement de l'e-mail

> **Ajouts à AD-2.** **(a) Forme unique :** toute identité utilisateur dans un DTO est portée par le type partagé `UserIdentityDto = { userId: string; pseudo: string; displayName: string }`, déclaré dans `packages/shared`. Les champs plats préfixés existants (`ownerPseudo`, `inviterPseudo`) sont **remplacés** par `owner: UserIdentityDto` / `inviter: UserIdentityDto` ; aucun DTO n'introduit de nouveau champ plat de type `xxxDisplayName`. C'est ce type, et lui seul, que consomme le composant d'identité d'AD-12. `HommeDragonDto.historique[].participants: string[]` devient `UserIdentityDto[]`. **(b) E-mail :** `PartieMemberDto.email` est **retiré** — AD-2 exclut l'e-mail de la recherche d'utilisateurs pour la même raison qu'il n'a rien à faire dans la liste des membres ; le MJ dispose déjà du pseudo pour désigner un membre. **(c) Périmètre :** `XpDistributionEntryDto` porte `owner: UserIdentityDto` (FR-4b le nomme). `AnnouncementDto` **ne porte pas d'auteur** : le modèle `Announcement` n'en a pas, et en ajouter un est hors périmètre du palier — la mention « auteurs d'annonce » est retirée d'AD-2.

---

## P-10 — `hideFinishedParties` : la spine motive un filtrage serveur et en interdit le seul chemin

**Gravité : moyenne.** Contradiction interne, pas seulement une ambiguïté.

AD-1 justifie la colonne typée par ceci : « un “masquer les parties terminées” et un filtre par statut devenus **non interrogeables côté base** parce que la valeur dort dans un JSON opaque ». L'argument n'a de sens que si la préférence est **utilisée dans une clause `where`** — donc appliquée côté serveur. Mais AD-3 verrouille l'inverse : « les endpoints `GET /parties?role=…` gardent leur contrat actuel **inchangé** ».

- **Story A** applique la préférence dans `PartiesService.getViewable()` (clause `where` sur `closedAt`), fidèle à l'argumentaire d'AD-1. Elle modifie de fait le comportement d'un endpoint qu'AD-3 déclare inchangé — et casse `MyPartiesService`, dont les listes ne contiennent plus tout, alors que la carte de signaux, elle, couvre toutes les parties : les cartes et les signaux cessent de s'accorder.
- **Story B** applique la préférence au filtrage front, laissant l'endpoint intact. Fidèle à AD-3, mais l'argumentaire d'AD-1 devient sans objet et rien ne justifie plus la colonne typée par rapport à un blob.

Cas limite non couvert : une partie **favorite** (AD-1) **et** terminée, avec `hideFinishedParties` actif — mise en avant ou masquée ? Deux stories, deux réponses, sur la même carte.

### AD à resserrer — AD-1 et AD-3

> **Ajout à AD-1 :** `hideFinishedParties` est une **préférence d'affichage appliquée côté front** — aucun endpoint de liste ne la lit ni ne la traduit en clause `where`. La forme « colonne typée » n'est pas justifiée par une interrogeabilité en base (elle ne l'est pas ici) mais par la règle générale de forme : préférence scalaire → colonne typée. **Résolution du conflit favori × terminée :** le favori l'emporte — une partie mise en favori est toujours affichée, même terminée, même masquage actif. Le masquage porte sur les parties terminées **non favorites**.

---

## P-11 — Une partie clôturée continue-t-elle à réclamer des actions ?

**Gravité : moyenne.** C'est l'interaction AD-8 × AD-3 que la spine ne traite pas.

FR-12 liste, côté joueur, « compte-rendu non rédigé sur une partie terminée » — donc **certains** signaux survivent à la clôture. Il liste aussi « personnage à créer », « vote en cours », « aucun scénario en cours » : ceux-là n'ont plus de sens sur une partie close, mais rien ne le dit.

- **Story A (« Signaux »)** calcule tous les signaux uniformément : une partie clôturée affiche « personnage à créer » et « aucune date » — une partie terminée réclame des actions et ressort mise en avant, alors qu'AD-8 et FR-12 la veulent « en retrait ». Les deux règles d'affichage se contredisent sur la même carte.
- **Story B (« Signaux »)** supprime tous les signaux d'action pour une partie close — et fait disparaître « compte-rendu non rédigé », le seul que FR-12 exige explicitement dans ce cas.

Deux cas limites voisins, ouverts : un **vote en cours** au moment de la clôture — reste-t-il ouvert, est-il clos en cascade ? Et la **réouverture** (`closedAt` vidé) : les signaux reviennent-ils tels quels, y compris un vote expiré entre-temps ?

### AD à resserrer — AD-8, ajout

> **Ajout à AD-8.** Sur une partie `CLOSED`, la carte de signaux (AD-3) ne porte que les signaux de **clôture** — `REPORT_MISSING`, `FINAL_REPORT_MISSING`. Tous les signaux d'action en cours (`CHARACTER_MISSING`, `OPEN_POLL`, `NO_DATE`, `NO_SCENARIO`, `NO_MEMBERS`, `HOMME_DRAGON_MISSING`) sont **omis**, pas mis à `false` : une partie terminée ne réclame rien d'autre que ses comptes rendus. La clôture **ne modifie aucun autre état** — un vote ouvert le reste, aucune cascade n'est déclenchée ; c'est un état d'affichage (AD-8) et non un événement métier. Vider `closedAt` restaure donc exactement les signaux d'avant, recalculés à la lecture, sans aucune reprise.

---

## P-12 — Deux demandes de changement d'e-mail en vol

**Gravité : moyenne.**

`EmailChangeToken` porte un `@@index([userId])` et **aucune unicité sur (userId, kind) pour les jetons non consommés**. AD-5 est muette sur la concurrence.

- **Story A (« Changement d'e-mail »)** invalide les jetons `CONFIRM` pendants du même utilisateur à chaque nouvelle demande (`updateMany usedAt: now`). Conforme.
- **Story B (« Changement d'e-mail »)** se contente d'en créer un nouveau — le pattern `PasswordResetToken` cité en référence par AD-5 est justement un pattern où plusieurs jetons peuvent coexister. Également conforme.

Avec B : l'utilisateur demande `b@x`, puis `c@x`, puis clique le **premier** lien. L'adresse devient `b@x`, et le jeton `REVERT` émis porte `previousEmail = a@x`. Il clique ensuite le second : l'adresse devient `c@x` et un second `REVERT` porte `previousEmail = b@x` — une adresse à laquelle l'utilisateur n'a peut-être jamais eu accès. Le retour arrière restaure une adresse intermédiaire, et l'avis « ancienne adresse » d'AD-5 est parti à `a@x` qui ne recevra jamais le second `REVERT`. La garantie centrale d'AD-5 — « la seule voie de récupération n'est jamais coupée » — tombe.

Trois autres cas limites que la Rule laisse ouverts :
1. **Unicité de l'adresse.** `User.email` est `@unique`. Vérifiée à la demande, elle peut être prise au moment du clic → violation de contrainte, 500 au lieu d'un message. AD-5 ne dit pas où la vérification a lieu.
2. **`REVERT` × `AD-6`.** AD-5 fait couper toutes les sessions ; AD-6 en conserve une. Aucune contradiction ici, mais le clic sur un lien `REVERT` peut être **non authentifié** : que se passe-t-il si l'utilisateur est connecté ailleurs ? La formulation « avant toute reconnexion » ne dit pas si la session courante du cliqueur survit.
3. **Changement de mot de passe pendant qu'un `CONFIRM` est en vol.** AD-6 ne dit pas si les jetons d'e-mail sont invalidés ; AD-5 non plus. Deux stories, deux réponses.

### AD à resserrer — AD-5, ajout

> **Ajouts à AD-5.** **(a) Une demande à la fois :** créer une demande de changement d'e-mail **invalide immédiatement** (`usedAt`) tout jeton `CONFIRM` non consommé du même utilisateur. Un seul `CONFIRM` peut être en vol ; l'avis envoyé à l'ancienne adresse mentionne l'invalidation de la demande précédente. **(b) `previousEmail` :** le jeton `REVERT` porte l'adresse en vigueur **au moment de la prise d'effet**, et le retour arrière est refusé si l'adresse courante n'est plus celle que le jeton prétend défaire (`newEmail`) — un `REVERT` obsolète échoue proprement au lieu de restaurer une adresse intermédiaire. **(c) Unicité :** la disponibilité de l'adresse est vérifiée **à la demande et de nouveau à la prise d'effet** ; si elle a été prise entre-temps, la confirmation est refusée par un message explicite, jamais par une violation de contrainte. **(d) Effet de bord d'AD-6 :** un changement de mot de passe en session invalide tous les jetons `CONFIRM` pendants, **jamais les jetons `REVERT`** — c'est le mot de passe compromis qui a pu produire la demande, et le `REVERT` est le filet de sécurité. **(e)** Le clic sur un `REVERT` coupe **toutes** les sessions sans exception, y compris celle du navigateur qui clique.

---

## P-13 — Un thème retiré du catalogue laisse des comptes orphelins

**Gravité : basse.** Mais FR-41/FR-43 rendent le cas probable.

`User.theme` est un `String` libre, « validé à la frontière API contre la liste des thèmes » (AD-1) — validé **à l'écriture**. Rien n'est dit de la **lecture** d'une valeur devenue invalide, ce qui arrive dès qu'un thème est renommé ou retiré par la revue FR-41/FR-43.

- **Story A (« Thèmes découpés »)** renomme un fichier de thème ; `THEMES` change. Les comptes portant l'ancienne valeur restent en base, aucune migration n'étant exigée par AD-13.
- **Story B (« Thème persisté »)** fait de `GET /me` la vérité et applique `TONE_MAP[theme]` sans garde — `undefined`, tous les libellés vides, application illisible. Ou bien elle ajoute un repli silencieux vers le thème de référence, et le `PATCH` suivant réécrit le compte : la préférence de l'utilisateur disparaît sans avertissement.

`readStoredTheme()` de l'existant a déjà ce repli pour `localStorage` ; rien d'équivalent n'est prévu côté compte.

### AD à resserrer — AD-13, ajout

> **Ajout à AD-13.** Une valeur de `User.theme` absente de `THEMES` est traitée **en lecture** comme le thème de référence (`grimoire-emeraude`), sans erreur et **sans réécriture du compte** — un thème retiré puis réintroduit retrouve ses utilisateurs. Retirer ou renommer un thème du catalogue impose une migration de données qui réaffecte les comptes concernés au thème de référence : c'est une modification de la liste, jamais un simple renommage de fichier.

---

## P-14 — Retrait d'un vote alors que la séance est déjà datée

**Gravité : basse.**

AD-10 autorise le `DELETE` d'un `PollVote` par son propriétaire, sans condition. Or `SessionPoll` porte `status: OPEN|CLOSED` et `chosenDate`, et `Seance.pollId` lie une séance au vote — un vote clos et lié a produit une date de séance, elle-même source d'indisponibilité dérivée (AD-9).

- **Story A** implémente le `DELETE` sans condition (AD-10 n'en pose aucune) : un joueur retire sa réponse sur un vote déjà clos et daté. Les compteurs de l'option retenue changent après coup, l'historique du choix devient incohérent.
- **Story B** restreint au `status: OPEN` — comportement raisonnable, mais nulle part exigé, et une story front écrite contre A affichera un bouton « retirer » qui échoue en 409.

### AD à resserrer — AD-10, ajout

> **Ajout à AD-10.** Le `DELETE` du propriétaire n'est recevable que si le `SessionPoll` est `OPEN` **et** ne porte pas de `chosenDate` ; sinon `409 Conflict`. Le front n'expose l'action de retrait que sous cette condition, lisible depuis `SessionPollDto` (`status`, `chosenDate`) sans appel supplémentaire.

---

## Constats mineurs, sans paire divergente

- **AD-7 — « les trois exports PDF » traversent `toDto()` : partiellement faux.** `exportNotesPdf` appelle bien `findOne()` (donc `toDto()`), mais le contenu du PDF vient de `getNotes(id, user.id)`, qui ne passe pas par `toDto()`. Sans incidence — les notes sont explicitement hors périmètre du verrouillage — mais la justification d'AD-7 sur ce point est inexacte et pourrait induire une story en erreur.
- **AD-7 × AD-14 — coût du rafraîchissement.** « Un changement de configuration de visibilité fait relire les fiches concernées par les joueurs de la partie » : sur la page d'une partie, `CharacterService.notifyChanged()` est déjà câblé au préfixe `partie:`. Rien à ajouter — autant l'écrire, sinon une story recâblera.
- **AD-11 — nettoyage de `localStorage`.** La clé `master-jdr.mode` disparaît du code ; elle survit dans les navigateurs. Sans effet, mais à mentionner pour éviter une story « migration » inventée.
- **AD-4 — `GET /me/characters` et le filtrage AD-7.** Restreint aux personnages de l'appelant : le filtre d'AD-7 ne s'y applique jamais (le lecteur est le propriétaire). À écrire noir sur blanc pour éviter une double application.

## Ce que la spine fait bien (et qu'il ne faut pas casser en la corrigeant)

- AD-11 est la meilleure AD du lot : elle nomme le code exact à conserver (`seq`, `notifyChanged`, câblage `user:`) au lieu de décrire une intention. C'est le modèle à suivre pour les corrections ci-dessus.
- AD-1 ferme correctement l'espace des formes possibles (deux formes, jamais une troisième) — c'est ce type de fermeture qui manque à AD-2, AD-3 et AD-7.
- AD-7 point (1) — filtrage dans `toDto()` — corrige une fuite réelle et vérifiée du code existant (`findOne` accessible aux membres, exports PDF sur `findOne`). L'attaque porte sur la forme, jamais sur le lieu, qui est juste.
