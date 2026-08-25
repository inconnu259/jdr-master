# Review adversarial — ARCHITECTURE-SPINE Palier 7 (SSE)

**Lens :** attaquer la colonne vertébrale en construisant deux unités (stories) qui respectent chaque AD à la lettre mais qui, prises ensemble, ne s'assemblent pas.

**Verdict : DEMANDE DE RÉVISION.** Le spine ferme bien le risque le plus visible (format de clé de topic, signature `notifyChanged()`), mais laisse trois zones où deux stories parallèles peuvent chacune être « conformes » et produire un résultat incompatible ou une régression silencieuse. La plus grave est une vraie race condition de refetch obsolète, exactement le scénario que la review devait vérifier.

---

## Finding 1 (Critique) — AD-2 autorise deux ordres d'émission incompatibles, race de refetch obsolète

**Preuve de code :** `apps/api/src/scenarios/scenarios.service.ts`, `poll.service.ts`, `character.service.ts`, `homme-dragon.service.ts`, `invitations/invite-links.service.ts` utilisent tous `$transaction` (Prisma) dans au moins une méthode de mutation — confirmé par grep. Ce sont exactement les 5 services visés par AD-2.

**Rule actuelle (AD-2) :** *« appelle explicitement `this.realtimeEvents.emit(topic)` juste avant son `return` (**ou dans le même bloc que l'écriture Prisma si transactionnel**) »*.

- **Unité A** (ex. story FR-1 sur `PollService.castVote`, qui est déjà dans une `$transaction`) lit la parenthèse comme une autorisation explicite et place `emit()` **à l'intérieur** du callback `$transaction(async (tx) => { ...write...; this.realtimeEvents.emit(topic); })`, avant que Prisma n'ait effectivement validé le COMMIT.
- **Unité B** (ex. story FR-1 sur `CharacterService.levelUp`) place `emit()` **après** l'`await this.prisma.$transaction(...)`, une fois le commit confirmé.

Les deux respectent AD-2 à la lettre. Mais dans le cas A, un client SSE peut recevoir l'événement, déclencher son refetch HTTP, et lire une base encore dans l'état pré-commit (fenêtre entre l'exécution du callback et la validation effective de la transaction) — exactement le « refetch obsolète » que la question posait. C'est un trou d'architecture, pas un détail d'implémentation : AD-2 devrait trancher une règle unique (« toujours après confirmation du commit, jamais à l'intérieur du callback `$transaction` ») au lieu de laisser le choix « ou ».

**Correctif proposé :** durcir AD-2 en supprimant la clause parenthétique et en imposant : « `emit(topic)` est toujours appelé après la résolution (await) de l'écriture Prisma — y compris quand celle-ci est un `$transaction` — jamais à l'intérieur du callback transactionnel. »

---

## Finding 2 (Élevé) — Le « mapping topic → services » de AD-3 n'a pas de signature d'API fixée : deux formes incompatibles de `RealtimeService`

**Rule actuelle (AD-3) :** *« il appelle `notifyChanged()` du ou des services de domaine concernés par ce topic (mapping topic → services, fixé dans `RealtimeService`, pas dans chaque composant) »*. Le Structural Seed ne donne aucune signature de méthode publique pour `RealtimeService` (juste un commentaire « connexion EventSource, mapping topic -> notifyChanged() »).

- **Unité A** (story FR-4, `PartieDetail`) peut légitimement lire AD-3 comme « la table topic→services est interne et globale » et implémenter `realtimeService.connect(topic: string): void`, où `RealtimeService` a un unique switch/`Record` codé en dur associant `partie:*` à la liste complète des 7 services de domaine.
- **Unité B** (story FR-9, `CharacterSheet`), écrite en parallèle sans voir le code de A, peut tout aussi légitimement lire la même phrase comme « chaque appelant doit dire ce qui l'intéresse » et implémenter `realtimeService.connect(topic: string, services: DomainService[]): void`.

Ce sont deux signatures publiques différentes de la même classe. La première story qui merge fixe l'API ; la seconde doit soit la contourner (mauvaise abstraction dupliquée), soit casser la compatibilité de la première. AD-3 ferme le *principe* (pas de mapping par composant) mais ne ferme pas la *forme* de l'API que 8 stories indépendantes (FR-4 à FR-13, hors FR-11) doivent appeler à l'identique.

**Correctif proposé :** ajouter dans le Structural Seed la signature exacte, ex. `connect(topic: string): void` sans second paramètre — et documenter explicitement la table statique complète `topic-prefix → services[]` comme faisant partie de l'AD (pas laissée à la première story qui la touche), pour éviter qu'une story ajoute une entrée par écrasement plutôt que par extension.

---

## Finding 3 (Moyen) — Construction de la clé de topic laissée à chaque composant : risque de divergence de format malgré AD-7

AD-7 fixe le *format* (`partie:{partieId}` / `user:{userId}`) mais ne dit pas *qui* construit la chaîne. Le Structural Seed montre 8 composants frontend distincts (`partie-detail.ts`, `scenario-editor.ts`, `character-sheet.ts`, `homme-dragon-sheet.ts`, `dashboard.ts`, `scenario-drafts.ts`, `scenario-one-shot-tab.ts`, `announcement-form.ts`) qui « ouvrent » chacun une connexion — sans qu'un helper partagé de construction de topic soit prévu.

- **Unité A** interpole directement `` `partie:${route.snapshot.params['id']}` `` (string du router, jamais casté).
- **Unité B** utilise un `id: number` provenant d'un signal typé et interpole `` `partie:${partieId}` `` — même rendu final en JS, mais deux sources de vérité différentes (param de route brute vs modèle typé), un risque réel si l'un des deux composants est monté avant que l'ID de Partie soit résolu (topic `partie:undefined`).

Rien n'empêche ce cas aujourd'hui car aucun helper `partieTopic(id)`/`userTopic(id)` n'est mentionné dans le Structural Seed ni dans les Consistency Conventions.

**Correctif proposé :** ajouter une fonction exportée unique (ex. `topics.ts` : `partieTopic(id: string)`, `userTopic(id: string)`) que les 8 composants routés doivent importer, au lieu de chacun interpoler la chaîne — et le mentionner dans Consistency Conventions.

---

## Finding 4 (Faible, à noter) — FR-15 (convention documentée) n'a pas d'AD propre malgré binds explicite

Le PRD (FR-15) et la Capability Map notent que ce FR n'a « pas de décision d'architecture ». C'est cohérent avec le fait que c'est de la documentation, pas du code — pas un vrai risque de divergence de builders, donc pas un vrai trou à combler ici, mais à surveiller si une future story tente d'automatiser cette vérification (lint/CI) sans repasser par une révision d'architecture.

---

## Non-trouvé (vérifié, pas de trou)

- **Signature `notifyChanged()` frontend** : AD-4 fixe `(): void` + `_changed.update(v => v+1)` de façon suffisamment stricte — confirmé cohérent avec le pattern déjà en place dans `apps/web/src/app/core/scenarios/scenarios.service.ts` (lu). Faible risque de divergence ici.
- **FR-6 `SeanceList`** : pas un service manquant — les méthodes séance (`addSeance`, `inscrire`, etc.) vivent déjà dans `ScenariosService`, donc couvert par AD-2/AD-4 sans besoin d'un AD séparé.

---

## Recommandation

Avant de lancer les stories FR-4 à FR-13 en parallèle, amender AD-2 (Finding 1, priorité haute) et compléter AD-3 (Finding 2) avec une signature d'API concrète + table statique documentée. Finding 3 est un ajout à moindre coût (un fichier `topics.ts` partagé) qui peut être glissé dans le Structural Seed sans nouvel AD.
