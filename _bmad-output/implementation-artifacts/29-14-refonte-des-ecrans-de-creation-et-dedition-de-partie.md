---
baseline_commit: 10764c2564fa2e1e70928ab663f24f05e6cf1206
---

# Story 29.14 : Refonte des écrans de création et d'édition de partie

Status: done

Epic: 29 — Navigation et listes
Porte : **Q-1** (question ouverte du SPEC/PRD, arbitrée le 2026-08-13 — voir § Arbitrage)

---

## Story

As a MJ,
I want créer et modifier ma partie sur des écrans aussi soignés que le reste de l'application,
So that le premier geste que je fais ne soit pas le plus négligé.

---

## 🚨 Encadré n°1 — Cette story ferme un trou de données, pas seulement un défaut visuel

`PartiesService.update()` fait `data: { ...dto }` ([parties.service.ts:341](../../apps/api/src/parties/parties.service.ts)) et `UpdatePartieDto` accepte les trois `PartieKind`. **Les six transitions de type passent aujourd'hui sans aucune vérification ni réparation**, alors que le `kind` gouverne des invariants dans quatre services. Trois transitions produisent un état que le reste du code déclare impossible, dont une **irrécupérable par l'interface** (campagne sans scénario convertie en one-shot : `ScenariosService.create()` refuse d'en créer un, et la création automatique n'a lieu qu'à `PartiesService.create()`).

L'ordre de travail est donc : **la garde de conversion d'abord, la mise en forme ensuite**. Écrire le nouveau formulaire avant la garde, c'est refaire l'écran qui déclenche le bug.

## 🚨 Encadré n°2 — Le troisième thème s'appelle toujours `medieval-steampunk`

`DESIGN.md` le nomme « Atelier Cuivré », mais la clé réelle reste `medieval-steampunk` dans les trois endroits qui la déclarent (`packages/shared`, `tones.ts`, `styles.scss`). Le renommage et la migration de `User.theme` appartiennent à la **story 35.1**. Cette story ajoute des clés de tons dans les **trois** entrées existantes de `TONE_MAP` sans toucher à leur nom. Piège déjà consigné en 29.10 et 29.11.

---

## Arbitrage Q-1 — périmètre arrêté avec l'utilisateur le 2026-08-13

Le SPEC (`Q-1`), le PRD (§ Questions ouvertes) et la spine (`ARCHITECTURE-SPINE.md:490`) exigeaient tous trois que la question soit reposée au démarrage de cette story. Elle l'a été. Décisions :

**Retenu — « Mise en forme + parcours »**
- Hiérarchie visuelle des deux écrans, mobile d'abord, aucun contenu tronqué.
- Même grammaire en création et en édition.
- Dépôt de l'image de couverture possible **dès la création** (aujourd'hui réservé à l'édition).
- Libellés des champs passés au vocabulaire thématisé.
- Les trois items optionnels retenus : indicateur de chargement du dépôt, validation cliente taille/type, états d'erreur véridiques.
- **Plus la garde de conversion de type** (changement serveur, signalé et approuvé explicitement).

**Écarté — rapatriement des actions de gestion.** Clôturer/Rouvrir/Supprimer ([partie-detail.html:385-397](../../apps/web/src/app/features/parties/partie-detail/partie-detail.html)) et l'onglet Invitations restent où ils sont. Motif : l'épic 32 refait ce terrain (32.2 « Réorganisation de la vue de partie », 32.1 « Autocomplétion des invitations ») — les déplacer maintenant serait défait par 32.2. **Ne pas les toucher dans cette story.**

**Modèle de données inchangé.** Aucun champ Prisma ajouté ni retiré. Le seul changement de contrat d'API est une nouvelle route de conversion (voir Task 3).

---

## La matrice de conversion (contrat exécutable)

État lu au moment de la conversion : `scenarioCount`, `courantCount` (scénarios au statut `COURANT`), `isClosed` (`closedAt !== null`).

| # | Transition | Règle | Effet transactionnel |
| --- | --- | --- | --- |
| 1 | `ONE_SHOT` → `CAMPAGNE_LINEAIRE` | **Autorisée** sans condition | Aucun |
| 2 | `ONE_SHOT` → `CAMPAGNE_EPISODIQUE` | **Autorisée** | Les membres actuels (`Membership`) sont inscrits comme `ScenarioParticipant` de **chaque** scénario existant |
| 3 | `CAMPAGNE_LINEAIRE` → `ONE_SHOT` | **Refusée si `scenarioCount >= 2`**. Autorisée à 0 ou 1 | Si `scenarioCount === 0` : création d'un scénario (`title` = nom de la partie, statut `BROUILLON`) **et** de sa séance |
| 4 | `CAMPAGNE_LINEAIRE` → `CAMPAGNE_EPISODIQUE` | **Autorisée** | Même réparation qu'au cas 2 |
| 5 | `CAMPAGNE_EPISODIQUE` → `ONE_SHOT` | **Refusée si `scenarioCount >= 2`**. Autorisée à 0 ou 1 | Même création qu'au cas 3 si `scenarioCount === 0` |
| 6 | `CAMPAGNE_EPISODIQUE` → `CAMPAGNE_LINEAIRE` | **Autorisée même à plusieurs `COURANT`.** Si `courantCount >= 2`, le MJ doit désigner celui qui reste Courant | Les autres `COURANT` repassent `A_VENIR`. Séances, votes et dates **conservés intacts** |

### Les trois règles transverses

**Règle A — rien n'est jamais effacé.** En quittant l'épisodique, `ScenarioParticipant`, `Inscription` et les capacités `Seance.inscriptionMin/Max` restent dormants en base (jamais lus hors épisodique — c'est déjà le comportement actuel). La conversion est ainsi réversible sans perte. La réparation des cas 2 et 4 est un `upsert` **idempotent**, exactement comme `ScenariosService.participate()`.

**Règle B — le serveur est l'autorité, le formulaire l'écho.** La validation vit côté serveur. Le formulaire désactive les choix impossibles **et affiche la raison** — jamais un bouton grisé muet (NFR-4). Les deux consomment **la même fonction pure** ; il n'existe pas deux tables de règles.

**Règle C — aucune conversion sur une partie clôturée.** `closedAt !== null` → refus, avec un message qui dit d'abord la rouvrir.

### Pourquoi la réparation des cas 2/4 n'est pas une invention

`homme-dragon.service.ts:378-379` écrit déjà, en clair : *« pour `ONE_SHOT`/`CAMPAGNE_LINEAIRE` (undefined), tous les membres actuels sont réputés [participer] »*. Inscrire les membres actuels comme participants ne fait qu'expliciter ce que le code tient déjà pour vrai. Sans cette réparation, la conversion viderait silencieusement les notes de rétrospective (`loadRetrospectiveNotes` filtre les non-participants) et ferait refuser les associations de journal (`character.service.ts:1597`).

---

## Acceptance Criteria

Les cinq premiers sont repris verbatim d'`epics.md#Story 29.14`. Les suivants découlent de l'arbitrage.

**AC1 — Given** le formulaire de création d'une partie
**When** je l'ouvre sur téléphone
**Then** sa hiérarchie visuelle est lisible et aucun contenu n'est tronqué

**AC2 — Given** le formulaire d'édition
**When** je l'ouvre
**Then** il suit la même grammaire que celui de création — pas deux écrans à apprendre

**AC3 — Given** une partie que je viens de créer
**When** elle apparaît dans ma liste
**Then** elle porte déjà son identité visuelle et sa signalétique d'état
**And** je peux y déposer une image de couverture depuis l'édition

**AC4 — Given** un nom de partie affiché sur ces écrans
**When** il est rendu
**Then** il suit la convention d'identité établie à l'épic 28

**AC5 — Given** le périmètre de la refonte
**When** la story démarre
**Then** la question a été reposée à l'utilisateur et l'arbitrage est consigné ici
**And** aucun champ n'est ajouté ni retiré du modèle sans cette décision

**AC6 — Given** une tentative de conversion de type
**When** elle est soumise au serveur
**Then** elle est évaluée contre la matrice ci-dessus
**And** un refus porte un message qui nomme la cause réelle et le nombre en jeu

**AC7 — Given** une conversion vers `ONE_SHOT` d'une partie sans aucun scénario
**When** elle aboutit
**Then** un scénario `BROUILLON` et sa séance ont été créés dans la même transaction
**And** la partie n'est jamais laissée dans l'état « one-shot sans scénario », qu'aucun chemin d'interface ne sait réparer

**AC8 — Given** une conversion vers `CAMPAGNE_EPISODIQUE`
**When** elle aboutit
**Then** les membres actuels participent à chacun des scénarios existants
**And** rejouer la même conversion ne crée aucun doublon

**AC9 — Given** une conversion vers `CAMPAGNE_LINEAIRE` d'une partie ayant deux scénarios `COURANT` ou plus
**When** le MJ a désigné celui qui reste Courant
**Then** les autres sont repassés `A_VENIR`
**And** leurs séances, votes et dates sont inchangés

**AC10 — Given** une conversion refusée par la matrice
**When** le serveur la traite
**Then** aucune écriture n'a eu lieu — ni sur `Partie`, ni sur `Scenario`, ni sur `ScenarioParticipant`

**AC11 — Given** le formulaire d'édition ouvert sur une partie
**When** il s'affiche
**Then** les types impossibles à atteindre sont désactivés et la raison est visible sans action supplémentaire

**AC12 — Given** je crée une partie en ayant choisi une image de couverture
**When** je valide
**Then** la partie est créée puis l'image déposée dessus
**And** si le dépôt échoue, le message ne laisse jamais croire que la partie n'a pas été créée

**AC13 — Given** un dépôt d'image de couverture en cours
**When** le serveur traite le fichier
**Then** un indicateur de progression est visible, pas seulement un bouton désactivé

**AC14 — Given** un fichier trop lourd ou d'un type non accepté
**When** je le choisis
**Then** il est rejeté avant tout envoi réseau
**And** le plafond appliqué côté client n'est jamais plus permissif que celui du serveur

**AC15 — Given** un échec d'enregistrement sur ces écrans
**When** le message s'affiche
**Then** il distingue les causes au lieu d'un texte unique (NFR-4)

---

## Tasks / Subtasks

### Backend — la garde de conversion (à faire en premier)

- [x] **Task 1 — Fonction pure partagée de la matrice** (AC6, AC11 · Règle B)
  - [x] Dans `packages/shared/src/index.ts` : `checkPartieKindTransition(from, to, state)` où `state = { scenarioCount, courantCount, isClosed }`.
  - [x] Retourne un verdict discriminé portant : autorisé/refusé, le motif de refus (union fermée de codes, pas une chaîne libre — le libellé est thématisable côté front), les effets à appliquer (`CREATE_SCENARIO` / `SEED_PARTICIPANTS` / `DEMOTE_EXTRA_COURANTS`) et si un choix de scénario Courant est requis.
  - [x] `from === to` → autorisé, aucun effet (le formulaire renvoie toujours `kind`, y compris inchangé).
  - [x] **Aucune dépendance à Prisma, Angular ou Nest** — fonction pure, testable isolément. C'est le point de dérivation unique de la matrice ; personne ne réimplémente ces conditions ailleurs.

- [x] **Task 2 — Tests de la fonction pure** (AC6)
  - [x] Les 6 transitions × les états limites : `scenarioCount` 0/1/2/5/7/9, `courantCount` 0/1/2/5, `isClosed` vrai/faux. 30 tests dans `apps/web/src/app/core/parties/partie-kind-transition.spec.ts`.
  - [x] Les 3 transitions identité (`from === to`) sont autorisées sans effet.
  - [x] Trois invariants transverses balayés par boucle : aucun choix de Courant vers l'épisodique, `requiresCourantChoice` ⇔ effet `DEMOTE_EXTRA_COURANTS`, et un refus ne porte jamais d'effet.

- [x] **Task 3 — Route de conversion dédiée** (AC6, AC7, AC8, AC9, AC10)
  - [x] `PATCH /parties/:id/kind`, corps `{ kind, courantScenarioId? }`, MJ-only via `getOwned()` (garde existante — rien à écrire).
  - [x] Tout dans **une seule** `$prisma.$transaction` : lecture de l'état (`scenario.count`, `scenario.count({ status: 'COURANT' })`), évaluation par la fonction pure, refus → exception **avant toute écriture** (AC10), sinon écriture du `kind` puis des effets.
  - [x] `courantScenarioId` : vérifié comme appartenant à cette partie et réellement `COURANT` — sinon 400, également avant toute écriture.
  - [x] Émission temps réel (AD-14) via `emitPartieAndMembersSafe()` — patron de la Story 29.6, un échec d'émission ne transforme jamais un commit réussi en 500.
  - [x] Renvoie un `PartieDto` projeté par `toPartieDto()` (AD-15), comme `update()`.

- [x] **Task 4 — Verrouiller `update()` contre le changement de type silencieux** (AC6)
  - [x] Dans `PartiesService.update()` : si `dto.kind` est présent **et diffère** du `kind` courant → 400 renvoyant vers la conversion dédiée.
  - [x] Un `kind` **identique** reste accepté sans effet — le test existant `partie-form.spec.ts` (partie épisodique ré-enregistrée avec son `kind`) reste vert.
  - [x] `kind` conservé dans `UpdatePartieDto` : la validation `@IsIn` reste utile et aucun appelant n'est cassé.

- [x] **Task 5 — Tests backend de la conversion** (AC6 à AC10)
  - [x] 21 tests dans `parties.service.spec.ts`, exerçant la **vraie** matrice (aucun verdict simulé : l'état est posé dans les mocks Prisma).
  - [x] **AC10 explicitement** : après chaque refus, `expectNoWrites()` vérifie qu'aucune des cinq tables concernées n'a été écrite — pas seulement que l'exception est levée.
  - [x] AC8 : `skipDuplicates` vérifié explicitement, plus le produit cartésien scénarios × membres et le cas « aucun membre » (pas d'appel à vide).
  - [x] AC7 : conversion vers `ONE_SHOT` à 0 scénario → `scenario.create` **et** `seance.create` appelés.
  - [x] AC9 : la rétrogradation n'écrit que `status`, aucune séance touchée.
  - [x] Règle C : conversion sur partie clôturée refusée, et la clôture prime sur le refus par nombre de scénarios.

### Frontend — le parcours

- [x] **Task 6 — Le formulaire connaît l'état de la partie** (AC11)
  - [x] En mode édition, la liste des scénarios est chargée via `ScenariosService.listAll(partieId)` (route existante, aucun statut filtré côté serveur — AD-20). Un seul appel, pour une seule partie : NFR-6 n'est pas en cause.
  - [x] `scenarioCount` / `courantCount` en sont dérivés, `checkPartieKindTransition()` est appelée pour chacun des trois types, les impossibles sont désactivés **avec leur raison affichée**.
  - [x] En mode création : les trois types sont libres, aucun appel.
  - [x] Un échec du chargement des scénarios ne bloque pas l'édition (matrice permissive côté client, le serveur restant l'autorité) — testé.

- [x] **Task 7 — Choix du scénario Courant** (AC9)
  - [x] La conversion vers `CAMPAGNE_LINEAIRE` avec plusieurs `COURANT` bascule sur un panneau d'arbitrage qui remplace le formulaire (une décision à la fois), listant les scénarios `COURANT`.
  - [x] La soumission est bloquée tant qu'aucun n'est choisi ; `Annuler` restaure le type enregistré.

- [x] **Task 8 — Ordonner conversion et enregistrement** (AC6, AC15)
  - [x] La conversion passe **en premier** — vérifié par un test qui enregistre l'ordre réel des appels.
  - [x] Une conversion refusée laisse les autres champs non enregistrés (testé) et relaie le message serveur, qui nomme la cause réelle.

- [x] **Task 9 — Dépôt de couverture dès la création** (AC3, AC12)
  - [x] Le fichier choisi est retenu localement, puis `create()` → `setCoverImage(nouvelId, fichier)` → `refreshMjParties()` → navigation.
  - [x] Aucune route serveur nouvelle pour la couverture : `PUT /parties/:id/cover` (Story 29.12) est réutilisée telle quelle.
  - [x] Aperçu de la bannière **générée** dès la création, remplacé par l'aperçu du fichier une fois choisi.
  - [x] Échec du dépôt après création : message disant que la partie **est** créée, formulaire basculé en mode édition sur son identifiant, aucune navigation — testé.

- [x] **Task 10 — Indicateur de chargement et validation cliente** (AC13, AC14)
  - [x] `mat-progress-bar` + libellé `aria-live` pendant le dépôt.
  - [x] Rejet local avant envoi : type hors `image/jpeg|png|webp`, taille > plafond. Borne inclusive testée (exactement 5 Mo accepté, comme le serveur).
  - [x] Plafond client commenté comme **troisième déclaration**, pointant `party-cover.controller.ts` et la décision de non-factorisation de la Story 29.12.

- [x] **Task 11 — Mise en forme des deux écrans** (AC1, AC2)
  - [x] Titre posé via `ContextualNavService.set()` (patron 29.4), avec le nom de la partie en sous-titre à l'édition ; `mat-card-title` redondant retiré (leçon 29.5 appliquée sans attendre un retour).
  - [x] Sélecteur de type passé en **vertical** : « Campagne épisodique » ne tient pas sur une ligne de 375 px et y était tronqué. Point dur d'AC1.
  - [x] Marge basse de la carte réservant `--shell-nav-bar-height` (variable partagée de la Story 29.3), plus `flex-wrap` sur les actions.
  - [x] Même gabarit en création et en édition, la seule différence étant l'immédiateté du dépôt de couverture (AC2).

- [x] **Task 12 — Libellés thématisés** (AC2, AC4)
  - [x] 22 clés ajoutées dans les **trois** entrées de `TONE_MAP`, sans toucher au nom `medieval-steampunk` (encadré n°2).
  - [x] AC4 : vérifié plutôt qu'appliqué de force — ces deux écrans n'affichent **aucun nom de personne** (nom de partie, système, type, description, couverture). La convention d'identité n'a donc aucune surface ici ; le composant `shared/identity/` n'est pas câblé, délibérément.

- [x] **Task 13 — États d'erreur véridiques** (AC15)
  - [x] Quatre causes distinguées : rejet local de fichier (type / taille), échec de dépôt, refus de conversion (message serveur relayé tel quel), échec d'enregistrement.

- [x] **Task 14 — Tests frontend**
  - [x] `partie-form.spec.ts` porté à 30 tests ; les tests existants de la Story 29.12 (gardes anti-double-clic, dépôt/retrait) et le test anti-régression du `kind` épisodique sont conservés et verts.
  - [x] Couvre : types désactivés + raison (AC11), partie clôturée, arbitrage du Courant (AC9), ordre conversion→champs (AC8), création→dépôt (AC12), rejets locaux et borne inclusive (AC14), indicateur (AC13).

- [x] **Task 15 — Vérification de non-régression**
  - [x] API 54/54 suites, 1158 tests ; `pnpm typecheck` propre ; web 96/96 fichiers, 1473 tests ; lint propre sur tous les fichiers touchés.
  - [x] Conteneur `api` réellement redémarré : `Nest application successfully started` et `Mapped {/parties/:id/kind, PATCH} route` vérifiés dans les logs.
  - [x] Budget de bundle mesuré des deux côtés (`git stash`) : 1,30 Mo avant / 1,32 Mo après — seul échec du build, pré-existant depuis la Story 29.4.

### Review Findings

- [x] [Review][Patch] Nom de partie périmé si renommage + conversion soumis dans le même envoi — décision utilisateur (2026-08-14) : inverser l'ordre, `update()` (nom/système/description) s'exécute désormais AVANT `convertKind()`. Risque assumé : un refus de conversion peut laisser le nouveau nom enregistré sans le changement de type (rare, resoumission possible). Corrigé, tests réécrits (`AC8 (révisé)`, nouveau test dédié au message de conversion échouée après enregistrement). [apps/web/src/app/features/parties/partie-form/partie-form.ts, `submit()`]
- [x] [Review][Patch] Assertion non-null dangereuse `keptCourantId!` dans l'effet `DEMOTE_EXTRA_COURANTS` — corrigée par une garde explicite qui lève si jamais `null` à cet endroit, au lieu de laisser `{ not: null }` matcher (et rétrograder) TOUS les scénarios COURANT. [apps/api/src/parties/parties.service.ts, `convertKind()`]
- [x] [Review][Patch] `refusalMessage()`/`refusalLabel()` et la boucle d'effets non exhaustifs — corrigé : `switch` sur les effets (au lieu d'une chaîne de `if`) avec `default`/garde `never`, et un `default`/garde `never` ajouté à `refusalMessage()`. Un futur membre ajouté à `PartieKindTransitionRefusal`/`PartieKindTransitionEffect` échoue désormais bruyamment au lieu de silencieusement. [apps/api/src/parties/parties.service.ts]
- [x] [Review][Patch] `convertKind()` réussi puis `update()` en échec laissait le type déjà converti côté serveur sans message dédié — sans objet après l'inversion d'ordre ci-dessus (c'est désormais `update()` qui s'exécute en premier) ; nouveau message dédié `partie.fields_saved_but_convert_failed` ajouté pour le cas symétrique (`update()` réussi, `convertKind()` en échec), avec le même précédent qu'AC12. [apps/web/src/app/features/parties/partie-form/partie-form.ts, `submit()`]
- [x] [Review][Patch] ~~`transformIgnorePatterns` de `apps/api/package.json` ajoute `"\\.pnp\\.[^\\/]+$"` — bric-à-brac Yarn PnP sans effet~~ **Finding invalidé par les tests, cause racine différente trouvée en le corrigeant.** Retirer cette ligne a fait échouer 25/54 suites API (`Unexpected token 'export'` sur `packages/shared/src/index.ts`) — pas un problème de cache, reproduit après `--clearCache`, `pnpm install --force` et redémarrage du conteneur. Cause réelle : `apps/api/tsconfig.json` utilise `module`/`moduleResolution: "nodenext"`, qui fait émettre `ts-jest` en ESM natif pour tout fichier dont le `package.json` le plus proche déclare `"type": "module"` (le cas de `packages/shared`), **indépendamment de** `transformIgnorePatterns`/`roots`/`isolatedModules` (les trois testés séparément, aucun effet). Le contournement de la story (ligne `.pnp`) était un faux positif qui ne corrigeait rien — la vraie fragilité qu'il masquait n'a été révélée qu'en tentant de la « nettoyer ». Corrigé en forçant `ts-jest` à compiler en CommonJS pour Jest exclusivement, sans toucher au `tsconfig.json` de production (qui doit rester `nodenext`) : `"transform": { "^.+\\.(t|j)s$": ["ts-jest", { "tsconfig": { "module": "commonjs", "moduleResolution": "node", "resolvePackageJsonExports": false } }] }`. Revérifié : API 54/54 suites, 1158/1158 tests, `pnpm typecheck` propre. [apps/api/package.json]
- [x] [Review][Patch] URL de blob (`pendingCoverPreview`) jamais révoquée sur `cancel()` en mode création avec fichier en attente, ni après un dépôt réussi (`create()` + `setCoverImage()`) — corrigé aux deux endroits (`clearPendingCover()` appelé après succès du dépôt, et dans `cancel()`). [apps/web/src/app/features/parties/partie-form/partie-form.ts]
- [x] [Review][Defer] Lecture de `partie` (kind/closedAt) hors transaction avant `$transaction`, sans verrou ni isolation renforcée — deux appels concurrents (double-clic, deux onglets) pourraient tous deux valider contre un état devenu périmé [apps/api/src/parties/parties.service.ts, `convertKind()`] — deferred, pre-existing pattern identique à `close()`/`reopen()` dans le même service, pas une régression propre à cette story
- [x] [Review][Defer] Fichier de couverture perdu (jamais retenu pour un nouvel essai) quand le dépôt échoue juste après la création d'une partie — l'utilisateur doit resélectionner le fichier en mode édition [apps/web/src/app/features/parties/partie-form/partie-form.ts, `submit()`] — deferred, friction UX mineure, chemin de récupération déjà fonctionnel (dépôt en mode édition)
- [x] [Review][Defer] Panneau d'arbitrage du scénario Courant utilise la liste capturée à l'ouverture, jamais rafraîchie avant confirmation [apps/web/src/app/features/parties/partie-form/partie-form.ts, `confirmCourantChoice()`] — deferred, la validation serveur de `courantScenarioId` (existence + statut réel) empêche toute corruption, au pire un message d'erreur tardif

---

## Dev Notes

### 🚨 Pièges qui coûteraient une reprise

1. **Ne pas injecter `ScenariosService` dans `PartiesService`.** `ScenariosService` injecte déjà `PartiesService` ([scenarios.service.ts:42](../../apps/api/src/scenarios/scenarios.service.ts)) — l'inverse crée un cycle, que le module a déjà dû traiter par `forwardRef()` en Story 8.8 pour `PollModule`. La conversion lit et écrit `Scenario` **directement via `this.prisma`**, précédent établi par `hasScenario()` (ligne ~185) qui fait déjà exactement ça.

2. **La transition `COURANT` → `A_VENIR` n'existe nulle part.** `markCourant()` ne fait que `A_VENIR` → `COURANT`, `close()` mène à `PASSE`. Le cas 6 en a besoin : la garder **interne à la transaction de conversion**, ne pas exposer une route « démarquer ». L'épic 32 refait la chronologie et voudra peut-être définir cette action autrement — ne pas préempter.

3. **Ne pas dupliquer la matrice.** Serveur et formulaire consomment la même fonction pure de `@master-jdr/shared`. Deux tables de règles divergent toujours, et c'est précisément ce genre de chemin parallèle qu'`AD-17` existe pour empêcher.

4. **`update()` doit rester tolérant au `kind` identique.** Le formulaire envoie toujours les quatre champs. Rejeter un `kind` égal casserait l'enregistrement d'un simple changement de nom, et `partie-form.spec.ts:91` le verrait immédiatement.

5. **Le refus doit précéder toute écriture.** Évaluer la matrice *après* avoir écrit le `kind` laisserait une partie convertie puis une exception — le pire des deux mondes. AC10 est là pour ça.

6. **Ne pas toucher `bannerParams()` ni la dérivation de la bannière.** La dérogation ouverte en 29.11 est close depuis 29.12 : toute modification du flux de tirage change l'apparence de **toutes** les parties existantes. Cette story ne fait qu'afficher `PartyBanner`, jamais modifier ses règles.

7. **`mat-tab-group` et animations dans les specs** : si un onglet ou une animation Material est introduit, `provideNoopAnimations()` est nécessaire pour que le contenu s'attache au DOM sous jsdom (piège documenté en 29.5). `partie-form.spec.ts` utilise déjà `provideAnimationsAsync()`.

### Ce qui doit continuer de fonctionner

- Les 8 tests de `partie-form.spec.ts` (3 types proposés, création avec chacun, `refreshMjParties()`, préservation du `kind` épisodique à l'édition, et les 6 tests de couverture de 29.12 dont les deux gardes anti-double-clic).
- `PUT`/`DELETE /parties/:id/cover` et leur cache-busting par `coverImageVersion` (29.12) — inchangés.
- Les actions de gestion de `PartieDetail` (Modifier / Clôturer / Rouvrir / Supprimer, onglet Invitations) — **hors périmètre, ne pas déplacer**.
- `ScenariosService.create()` continue de refuser un second scénario sur un `ONE_SHOT` — la garde de conversion la complète, ne la remplace pas.

### Hors périmètre

- Rapatriement des actions de gestion de partie (épic 32).
- Toute modification du modèle Prisma.
- Renommage `medieval-steampunk` → `atelier-cuivre` (story 35.1).
- Purge des données épisodiques dormantes (règle A : conservées délibérément).
- Alignement du dépôt de **portrait** sur la validation cliente ajoutée ici — même lacune, mais autre écran ; à tracer dans `deferred-work.md` si l'occasion ne se présente pas.

### Décisions à trancher en implémentation (non tranchées par les ACs)

- **Route dédiée vs champ dans `update()`.** Tranché en amont : route dédiée `PATCH /parties/:id/kind`. Motif : la conversion n'est pas une édition de champ mais une opération à effets (création de scénario, semis de participants, rétrogradation de statuts) qui a besoin d'un paramètre transitoire (`courantScenarioId`) n'ayant rien à faire dans un DTO d'édition générique. Alternative écartée : élargir `UpdatePartieDto`.
- **Forme de la confirmation de conversion.** Une conversion à effets (cas 2, 4, 6) mérite une confirmation énumérant ce qui va se passer. Le projet a déjà `confirm-dialog` dans `features/parties/`. Recommandation : le réutiliser, ne pas en écrire un second.
- **Portée du composant d'identité pour AC4.** Le composant livré par l'épic 28 vit dans `apps/web/src/app/shared/identity/` et porte la convention *joueur vs personnage*. Un nom de **partie** n'entre pas dans cette dichotomie. Lire le composant avant de l'appliquer de force ; si AC4 ne vise en pratique que le nom du MJ affiché sur ces écrans, s'y limiter et le consigner.
- **Présentation de l'échec de dépôt en création.** Recommandation : rester sur le formulaire avec un message disant que la partie est créée et que seule l'image a échoué, plus un chemin explicite vers la partie. Documenter le choix retenu.

### Notes de plateforme

- **API : Jest 30 + ts-jest.** `ts-jest` ne type-vérifie pas d'un fichier à l'autre (`isolatedModules`). Cette story ajoute un export à `@master-jdr/shared` consommé des deux côtés — **lancer `pnpm typecheck` en plus des tests**.
- **`@master-jdr/shared` en ESM** : un spec API important `shared` au runtime (pas seulement en type) exige `jest.mock()`, sinon « Unexpected token export ». `checkPartieKindTransition()` est un import **runtime** — vérifier les specs concernés.
- **Web : Vitest 4, zoneless.** `ng test` type-vérifie aussi les specs. **Aucun champ ajouté à `PartieDto` par cette story** — donc aucune fixture à réparer, contrairement à 29.9/29.10/29.12 (jusqu'à 62 tests tombés d'un coup). Si l'implémentation en ajoute un malgré tout, s'attendre à la casse.
- **Exécution** : tout par Docker.
- **Build web** : échoue déjà sur le budget de bundle pré-existant (~1,28 Mo, constant depuis 29.4). Mesurer des deux côtés avant de conclure à une régression.

### Project Structure Notes

- **Nouveaux** : la fonction pure de matrice dans `packages/shared/src/index.ts` (+ sa spec) ; éventuellement un composant de sélection du scénario Courant si Task 7 ne tient pas dans le formulaire.
- **Backend modifiés** : `apps/api/src/parties/parties.service.ts` (conversion + garde dans `update()`), `apps/api/src/parties/parties.controller.ts` (+1 route), un DTO de conversion dans `apps/api/src/parties/dto/`, `parties.service.spec.ts`.
- **Frontend modifiés** : `apps/web/src/app/features/parties/partie-form/` (les 4 fichiers), `apps/web/src/app/core/parties/parties.service.ts` (+ méthode de conversion), `apps/web/src/app/core/theme/tones.ts` (nouvelles clés ×3).
- **Non touchés** : `partie-detail.*`, `party-cover.controller.ts`, `party-banner.util.ts`, `scenarios.service.ts` (lecture seule par `prisma` depuis `PartiesService`), `image-upload.util.ts`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 29.14] — Story et 5 premiers ACs, repris verbatim ; note exigeant l'arbitrage de Q-1.
- [Source: _bmad-output/specs/spec-palier9-refonte-ui/SPEC.md#Open Questions] — Q-1 : *« quel périmètre pour la refonte de création/édition de partie ? L'utilisateur demande qu'on lui repose la question »*.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-2026-08-01/prd.md:377] — Q-1 retenue dans le palier 9 le 2026-08-05.
- [Source: ARCHITECTURE-SPINE.md:490] — Q-1 listée comme question à reposer au démarrage du chantier.
- [Source: ARCHITECTURE-SPINE.md#AD-15] — `PartiesService` projette explicitement vers `PartieDto`, jamais d'objet Prisma brut.
- [Source: ARCHITECTURE-SPINE.md#AD-14] — Toute mutation modifiant un signal émet `partie:{id}` et `user:{id}` pour chaque membre.
- [Source: ARCHITECTURE-SPINE.md#AD-17] — Chemins parallèles interdits : une seule dérivation, réutilisée.
- [Source: ARCHITECTURE-SPINE.md#AD-20] — `findAllForPartie` ne filtre aucun statut — le formulaire reçoit bien tous les scénarios, brouillons compris.
- [Source: epics.md#NFR-4] — Un message d'erreur ne ment jamais sur la cause.
- [Source: epics.md#NFR-5] — Rien de silencieux côté serveur ; toute évolution découverte est remontée avant d'être codée. **Fait : la garde de conversion a été signalée et approuvée explicitement.**
- [Source: epics.md#NFR-6] — Aucun appel réseau proportionnel au nombre de parties. L'appel de Task 6 porte sur **une** partie.
- [Source: DESIGN.md#4 Layout & Spacing] — Barre de navigation basse ~50 px + zone sûre : contrainte de la zone d'actions en bas de formulaire.
- [Source: DESIGN.md#7.8 DetailSurface] — Le dépliant en place reste un motif d'exception, décidé écran par écran, jamais par habitude.
- [Source: apps/api/src/parties/parties.service.ts:125-160] — `create()` : patron exact de création du scénario + séance pour `ONE_SHOT` (cas 3 et 5 de la matrice).
- [Source: apps/api/src/parties/parties.service.ts:253-258] — `getOwned()` : garde MJ-only déjà en place, rien à écrire.
- [Source: apps/api/src/parties/parties.service.ts:335-352] — `update()` : le `data: { ...dto }` non gardé, origine du trou.
- [Source: apps/api/src/parties/parties.service.ts:355-380] — `close()`/`reopen()` : patron d'émission `emitPartieAndMembersSafe()` à reproduire.
- [Source: apps/api/src/scenarios/scenarios.service.ts:55-61] — `ONE_SHOT` refuse un second scénario : l'invariant que les cas 3 et 5 protègent.
- [Source: apps/api/src/scenarios/scenarios.service.ts:330-352] — Verrou « un seul COURANT » pour `CAMPAGNE_LINEAIRE` uniquement, appliqué aux nouveaux passages seulement — il ne répare pas l'existant, d'où le cas 6.
- [Source: apps/api/src/scenarios/scenarios.service.ts:430-445] — `participate()` : `upsert` idempotent, patron exact du semis des cas 2 et 4.
- [Source: apps/api/src/scenarios/scenarios.service.ts:459-479] — `addSeance()` : seul `PASSE` bloque. Un scénario `A_VENIR` peut porter des séances.
- [Source: apps/api/src/scenarios/scenarios.service.ts:599-627] — `createSeancePoll()` : seul `PASSE` bloque. Confirme qu'un scénario futur peut être daté — le cas 6 ne perd donc aucune capacité d'organisation.
- [Source: apps/api/src/scenarios/scenarios.service.ts:968-980] — `participants` n'est projeté sur `ScenarioDto` que pour `CAMPAGNE_EPISODIQUE` : c'est ce champ qui fait basculer le front.
- [Source: apps/api/src/characters/character.service.ts:1590-1608] — `setNoteScenario()` refuse l'association si le personnage ne participe pas — conséquence directe d'une conversion vers l'épisodique sans réparation.
- [Source: apps/api/src/homme-dragon/homme-dragon.service.ts:378-379] — *« Pour ONE_SHOT/CAMPAGNE_LINEAIRE, tous les membres actuels sont réputés participer »* — fondement de la réparation des cas 2 et 4.
- [Source: apps/api/src/parties/party-cover.controller.ts:33] — `MAX_COVER_SIZE = 5 * 1024 * 1024`, non factorisable (décorateurs) : référence du plafond client de Task 10.
- [Source: apps/web/src/app/features/parties/partie-form/partie-form.ts] — Composant unique création+édition ; `onCoverFileSelected()`/`removeCoverImage()` et leurs gardes anti-double-clic à préserver.
- [Source: apps/web/src/app/features/parties/partie-form/partie-form.spec.ts] — 8 tests existants encodant des régressions déjà payées.
- [Source: apps/web/src/app/core/navigation/contextual-nav.service.ts] — `set()`/`clear()` : patron de titre contextuel (29.4), `clear()` sur `NavigationStart`.
- [Source: apps/web/src/app/core/scenarios/scenarios.service.ts] — `listAll(partieId)` : l'appel de Task 6.
- [Source: apps/web/src/app/core/theme/tones.ts:72-74] — `partie.new_title` / `partie.edit_title` / `partie.save_btn` déjà thématisés ; les libellés de champs ne le sont pas.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:718-720] — Historique du 3ᵉ `PartieKind` : bug de rabattement de `kind` à l'édition, déjà corrigé — la garde ne doit pas le réintroduire.
- [Source: _bmad-output/implementation-artifacts/deferred-work.md:883-884] — Les deux items différés repris en Task 10.
- [Source: _bmad-output/implementation-artifacts/29-12-image-de-couverture-de-partie.md] — Story précédente : contrat de la couverture, cache-busting, plafond non factorisable.

---

## Dev Agent Record

### Agent Model Used

claude-opus-5 (bmad-dev-story)

### Debug Log References

- **Diagnostic de la chaîne ESM/Jest** — quatre expériences successives, chacune infirmant une hypothèse : (1) `moduleNameMapper` seul → toujours non transformé ; (2) surcharge `tsconfig` inline `module: commonjs` scopée à `packages/shared` → sans effet ; (3) retrait de `"type": "module"` de `packages/shared` → sans effet ; (4) import par **chemin relatif** → **fonctionne**. La cause était donc la résolution du paquet, pas la transformation : `transformIgnorePatterns` exclut tout ce qui transite par `node_modules`, où pnpm place les liens symboliques des paquets du workspace. Les changements (1) à (3) ont tous été annulés.
- **Suite API en échec sur 24 suites** après l'ajout de l'import runtime — recensées d'un coup par une exécution complète plutôt qu'une par une, ce qui a montré que le problème était structurel (toute suite atteignant `PartiesService`) et non local.

### Completion Notes List

**La garde de conversion est le cœur de la story, et elle est complète.** Les six transitions sont évaluées par une fonction pure unique, consommée telle quelle par le serveur et par le formulaire. Aucun champ Prisma ajouté ni retiré, aucune migration.

**Correction d'infrastructure faite à la racine plutôt que contournée — à signaler.** L'ajout du premier import *runtime* de `@master-jdr/shared` dans `PartiesService` a cassé 24 suites API d'un coup (« Unexpected token 'export' »). Deux issues existaient : coller un `jest.mock('@master-jdr/shared')` dans 24 fichiers, ou corriger la cause. **`packages/shared` n'a pas été modifié** (son `"type": "module"` est intact), et le paquet est désormais importable au runtime depuis les specs API. Cela rend obsolète le contournement `jest.mock()` documenté dans les mémoires projet et dans plusieurs specs existants — ces mocks restent en place, inoffensifs, et pourront être retirés à l'occasion.
>
> **Correction apportée par la revue de code du 2026-08-14 : le diagnostic initial ci-dessus (une ligne manquante dans `transformIgnorePatterns`) était un faux positif.** Retester cette ligne isolément (`--clearCache`, `pnpm install --force`, redémarrage du conteneur, `transformIgnorePatterns` vidé, `roots` élargi, `isolatedModules` de ts-jest activé — chacun testé séparément) n'a reproduit AUCUNE amélioration ni régression : l'échec des 24 suites persistait à l'identique dans tous les cas. La cause réelle : `apps/api/tsconfig.json` utilise `module`/`moduleResolution: "nodenext"`, qui fait émettre `ts-jest` en ESM natif pour tout fichier dont le `package.json` le plus proche déclare `"type": "module"` (le cas de `packages/shared`), indépendamment des trois options testées. Corrigé en forçant `ts-jest` à compiler en CommonJS pour Jest exclusivement (sans toucher au `tsconfig.json` de production) : `"transform": { "^.+\\.(t|j)s$": ["ts-jest", { "tsconfig": { "module": "commonjs", "moduleResolution": "node", "resolvePackageJsonExports": false } }] }` dans `apps/api/package.json`. Mémoire projet corrigée en conséquence (`jdr-game-rules-esm-jest-mock.md`).

**Conséquence directe sur la qualité des tests :** la conception initiale prévoyait de tester la matrice côté web et de *mocker* le verdict côté API. La correction rendant l'import réel possible, ce compromis a été abandonné — `parties.service.spec.ts` exerce la **vraie** matrice, les états étant posés dans les mocks Prisma. Aucun test ne passe à côté de son sujet.

**Décisions d'implémentation non dictées par la story :**
1. **Route dédiée `PATCH /parties/:id/kind`** (déjà tranchée en amont), et `update()` rejette un `kind` *différent* tout en tolérant un `kind` identique. Sans cette tolérance, l'enregistrement d'un simple changement de nom casserait, le formulaire renvoyant toujours les quatre champs.
2. **`createMany({ skipDuplicates: true })`** pour le semis des participants, plutôt qu'une boucle d'`upsert` : une seule requête, idempotence garantie par la contrainte `@@unique([scenarioId, userId])` existante.
3. **Le semis ne concerne que les `Membership`**, donc les joueurs — le MJ n'est jamais un `Membership` et n'a pas de personnage dont les notes seraient filtrées. Conforme au commentaire de `homme-dragon.service.ts` qui fonde la réparation.
4. **L'arbitrage du scénario Courant remplace le formulaire** au lieu de s'y ajouter : une décision à la fois, et le formulaire ne peut pas être soumis dans un état intermédiaire.
5. **Sélecteur de type vertical.** Le débordement d'AC1 n'était pas corrigeable par du `flex-wrap` : trois options dont « Campagne épisodique » sur 375 px tronquent quoi qu'il arrive.

**AC4 vérifiée, non appliquée de force.** Ces deux écrans n'affichent aucun nom de personne — le composant d'identité de l'épic 28 n'a donc aucune surface ici et n'est délibérément pas câblé. La story invitait à vérifier avant d'appliquer ; c'est le résultat de cette vérification.

**Piège rencontré (non anticipé par la story) :** `ContextualNavService` s'abonne à `Router.events` dans son constructeur. Le mock objet `{ navigate }` de `partie-form.spec.ts` ne l'expose pas, et les 30 tests tombaient d'un coup dès que le composant a injecté le service. Corrigé en adoptant `provideRouter([])` avec espionnage du vrai `Router` — convention déjà en place dans `my-characters.spec.ts`. **À réutiliser pour tout composant qui adopte le bandeau contextuel.**

**NON VÉRIFIÉ VISUELLEMENT** (session authentifiée requise) : le rendu réel des deux écrans sur téléphone, le panneau d'arbitrage et l'indicateur de dépôt restent à valider à l'œil. Les tests vérifient la présence et le câblage des éléments, jamais leur apparence.

**Suites finales :** API 54/54 suites, 1158/1158 tests (baseline 1133, +25), typecheck propre. Web 96/96 fichiers, 1473/1473 tests (baseline 1409, +64), lint propre sur tous les fichiers touchés. Build web : échoue uniquement sur le budget de bundle pré-existant, mesuré des deux côtés (1,30 Mo avant / 1,32 Mo après).

- Revue de code (bmad-code-review, 2026-08-14, 3 couches Blind Hunter/Edge Case Hunter/Acceptance Auditor) : 1 decision-needed, 6 patches appliqués (dont la décision une fois tranchée), 3 différés, 9 écartés comme bruit. Décision utilisateur : renommage + conversion de type dans le même envoi pouvait titrer un scénario auto-créé (AC7) avec un nom déjà périmé — `update()` s'exécute désormais avant `convertKind()` (inversion de l'ordre documenté par la Task 8 initiale), avec un nouveau message dédié (`partie.fields_saved_but_convert_failed`) pour le cas où les champs sont enregistrés mais la conversion échoue ensuite. Autres patches : assertion non-null `keptCourantId!` remplacée par une garde explicite (évite une rétrogradation silencieuse de tous les scénarios COURANT si l'invariant casse un jour) ; `switch` exhaustif avec garde `never` sur les effets et les motifs de refus (au lieu d'un `if`/`switch` non exhaustif) ; fuites d'URL de blob corrigées (`cancel()`, dépôt de couverture réussi en création). **Découverte majeure au passage** : le contournement Jest documenté par cette story elle-même (`transformIgnorePatterns` + ligne `.pnp`) s'est révélé être un faux positif en tentant de le nettoyer — la vraie cause (`module: nodenext` + `"type": "module"` de `packages/shared`) et son vrai correctif (override `tsconfig` de `ts-jest` forçant `commonjs`) sont documentés dans Dev Notes et dans la mémoire projet `jdr-game-rules-esm-jest-mock.md`. 3 items différés dans `deferred-work.md` (pattern de lecture hors-transaction déjà présent dans `close()`/`reopen()`, fichier de couverture perdu au retry, panneau d'arbitrage non rafraîchi — les trois avec un filet de sécurité existant ou une convention déjà établie). 9 écartés comme bruit (asymétrie de création de scénario conforme à la matrice, `courantScenarioId` ignoré si non applicable, 400 vs 409 conforme à la convention existante, coût de transaction d'une conversion no-op inatteignable via l'UI réelle, resynchronisation post-commit conforme à `close()`/`reopen()`, etc.). Suite finale revérifiée : API 54/54 suites (1158/1158 tests), typecheck propre ; Web 96/96 fichiers (1475/1475 tests), lint propre. Statut passé à `done`.

### File List

**Modifiés — partagé**
- `packages/shared/src/index.ts` (matrice de conversion : types, verdict, `checkPartieKindTransition()`)

**Modifiés — API**
- `apps/api/package.json` (revue de code : `transform` de `ts-jest` reconfiguré avec un override `tsconfig` forçant `module: commonjs` — corrige à la racine l'incompatibilité `nodenext`/`"type": "module"` des paquets du workspace, remplace le contournement `transformIgnorePatterns` d'origine qui n'agissait pas)
- `apps/api/src/parties/parties.service.ts` (`convertKind()`, garde de `update()`, `refusalMessage()` ; revue de code : `switch` exhaustif avec garde `never` sur les effets et les motifs de refus, garde explicite remplaçant `keptCourantId!`)
- `apps/api/src/parties/parties.controller.ts` (route `PATCH :id/kind`)
- `apps/api/src/parties/parties.service.spec.ts` (+21 tests de conversion, mocks Prisma étendus)
- `apps/api/src/parties/parties.controller.spec.ts` (+2 tests de routage)

**Nouveaux — API**
- `apps/api/src/parties/dto/convert-partie-kind.dto.ts`

**Modifiés — Web**
- `apps/web/src/app/core/parties/parties.service.ts` (`convertKind()`)
- `apps/web/src/app/core/theme/tones.ts` (22 clés × 3 thèmes ; revue de code : + `partie.fields_saved_but_convert_failed` × 3 thèmes)
- `apps/web/src/app/features/parties/partie-form/partie-form.ts` (revue de code : ordre `update()`/`convertKind()` inversé, fuites d'URL de blob corrigées)
- `apps/web/src/app/features/parties/partie-form/partie-form.html`
- `apps/web/src/app/features/parties/partie-form/partie-form.scss`
- `apps/web/src/app/features/parties/partie-form/partie-form.spec.ts` (8 → 32 tests, dont 2 réécrits par la revue de code pour le nouvel ordre)

**Nouveaux — Web**
- `apps/web/src/app/core/parties/partie-kind-transition.spec.ts` (30 tests, table de vérité)

**Non touchés, délibérément** : `partie-detail.*` (actions de gestion — épic 32), `party-cover.controller.ts`, `party-banner.util.ts`, `scenarios.service.ts`, `packages/shared/package.json`.

### Change Log

- 2026-08-13 — **Story implémentée (bmad-dev-story), 15 tâches, TDD.** Garde de conversion de type d'abord (matrice partagée dans `@master-jdr/shared`, route dédiée `PATCH /parties/:id/kind`, verrou sur `update()`), refonte des deux écrans ensuite (bandeau contextuel, sélecteur vertical, dépôt de couverture dès la création, indicateur de progression, validation cliente, libellés thématisés ×3, erreurs véridiques). Correction d'infrastructure signalée : `transformIgnorePatterns` de l'API corrigé à la racine (une ligne) au lieu de disséminer `jest.mock('@master-jdr/shared')` dans 24 specs — `packages/shared` reste intact et devient importable au runtime côté API, ce qui a permis d'exercer la vraie matrice dans les tests serveur. API 1158 tests, web 1473 tests, typecheck et lint propres. Rendu visuel non validé à l'œil.
- 2026-08-13 — Story créée (bmad-create-story). Q-1 arbitrée avec l'utilisateur : périmètre « Mise en forme + parcours », plus la garde de conversion de type (changement serveur signalé et approuvé). Matrice des 6 transitions arrêtée, amendée par l'utilisateur sur trois points : création automatique d'un scénario lors d'une conversion vers `ONE_SHOT` à 0 scénario (cas 3 et 5, au lieu d'un refus), et conversion vers `CAMPAGNE_LINEAIRE` autorisée à plusieurs `COURANT` moyennant le choix de celui qui reste Courant (cas 6, au lieu d'un refus). Rapatriement des actions de gestion écarté pour recouvrement avec l'épic 32.
