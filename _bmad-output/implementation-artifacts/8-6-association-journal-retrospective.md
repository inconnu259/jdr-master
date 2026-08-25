---
baseline_commit: aa102ce
---

# Story 8.6: Association configurable du journal à la rétrospective

Status: done

## Story

As a joueur,
I want associer tout ou partie de mon journal personnel à la rétrospective d'un scénario auquel j'ai participé, manuellement ou automatiquement selon mon choix,
So that mes entrées partagées enrichissent le souvenir collectif de la campagne sans geste répétitif si je le souhaite.

## Acceptance Criteria

1. **Given** un joueur ayant un personnage sur la Partie d'un scénario `status: PASSE` **When** il consulte la rétrospective (`ScenarioReadDialog`) **Then** il voit un switch « Association automatique » lié à `Character.journalAutoAssociate` (champ déjà en base, jamais exposé/lu/écrit avant cette story), désactivé par défaut.
2. **Given** le switch désactivé (défaut) **When** le joueur veut associer une entrée de son journal à la rétrospective de ce scénario **Then** il coche manuellement, entrée par entrée (`CharacterNote.scenarioId` — nouveau champ, persistant, indépendant du switch) — aucune entrée n'y figure sans son choix actif.
3. **Given** le switch activé (`Character.journalAutoAssociate: true`) **When** une entrée de journal du joueur est `shared: true` **et** datée dans la fenêtre du scénario (entre la date de sa première et de sa dernière séance, cf. `[ASSUMPTION]` Dev Notes sur le calcul de cette fenêtre) **Then** elle apparaît automatiquement dans la rétrospective, sans action manuelle supplémentaire — **en plus**, pas à la place, des entrées déjà associées manuellement.
4. **Given** des entrées déjà associées manuellement (`scenarioId` posé) **When** le joueur désactive ensuite le réglage d'association automatique **Then** ces entrées manuelles restent associées — désactiver le switch n'affecte jamais `CharacterNote.scenarioId`, seulement le calcul de l'ensemble « auto » côté lecture.
5. **Given** le réglage `journalAutoAssociate` d'un personnage **When** `ScenariosService` assemble le `ScenarioDto` d'un scénario `PASSE` **Then** il interroge `CharacterService` (nouvelle méthode exportée `getRetrospectiveNotes`) pour les entrées pertinentes de chaque personnage participant — jamais un accès Prisma direct à `CharacterNote`/`Character` depuis `ScenariosModule` (AD-11) ; `ScenariosModule` importe `CharacterModule` (import manquant à ce jour, à ajouter par cette story).
6. **Given** un joueur ayant plusieurs personnages dans des Parties différentes **When** il règle `journalAutoAssociate` sur l'un d'eux **Then** le réglage est scopé à ce personnage uniquement (champ sur `Character`, pas sur `User`) — pas un réglage global par compte joueur.
7. **Given** un scénario `status !== 'PASSE'` **When** `ScenariosService` assemble son `ScenarioDto` **Then** `retrospectiveNotes` (nouveau champ) est `undefined` — l'agrégation de notes ne s'exécute que pour un scénario clôturé, cohérent avec le fait que la rétrospective elle-même n'existe qu'à ce statut (Story 8.5).
8. **Given** un utilisateur qui n'est pas le propriétaire d'un personnage **When** il tente de modifier `journalAutoAssociate` ou l'association manuelle d'une note de ce personnage **Then** la requête échoue en `403 Forbidden` — même schéma que `toggleNoteShare` (propriétaire seul, jamais le MJ).

*(Source : epics.md Story 8.6, 6 ACs reformulées en Given/When/Then et complétées de 2 ACs (AC7 : `retrospectiveNotes` absent hors `PASSE`, nécessaire pour circonscrire quand l'agrégation s'exécute ; AC8 : rejet 403 non-propriétaire, non explicitement couvert par le texte d'origine mais cohérent avec `toggleNoteShare` existant) — même méthode que Stories 8.1-8.5.)*

## Tasks / Subtasks

- [x] **Task 1 — Migration Prisma : `CharacterNote.scenarioId`** (AC2)
  - [x] Nouvelle migration (ex. `character_note_scenario_link`) : `ALTER TABLE "CharacterNote" ADD COLUMN "scenarioId" TEXT; ALTER TABLE "CharacterNote" ADD CONSTRAINT ... FOREIGN KEY ("scenarioId") REFERENCES "Scenario"("id") ON DELETE SET NULL;` (via `schema.prisma` + `prisma migrate dev`, jamais écrit à la main).
  - [x] `schema.prisma` : sur `model CharacterNote`, ajouter `scenarioId String?` + `scenario Scenario? @relation(fields: [scenarioId], references: [id], onDelete: SetNull)` — nullable, `SetNull` (pas `Cascade`) : si un scénario est supprimé, la note reste, seule l'association manuelle est effacée, cohérent avec `ScenarioDocument.scenarioId`/`Announcement.scenarioId` (mêmes `onDelete`, motifs similaires).
  - [x] Sur `model Scenario`, ajouter la relation inverse `characterNotes CharacterNote[]` (mécanique, pas un choix — même remarque que les autres relations inverses ajoutées au fil du palier).
  - [x] **`[ASSUMPTION]`** : `scenarioId` est **singulier** (une note s'associe manuellement à au plus un scénario à la fois), pas une relation many-to-many. Aucune AC ne demande qu'une même entrée de journal soit associée à plusieurs rétrospectives simultanément ; cohérent avec le pattern déjà établi dans ce palier pour les FK nullables simples (`ScenarioDocument`/`Announcement`), plutôt qu'une table de jointure. Si le besoin réel émerge plus tard, migration additive facile (introduire une table de jointure sans casser ce champ).

- [x] **Task 2 — `packages/shared/src/index.ts` : types** (AC1, AC2, AC3, AC7)
  - [x] `CharacterDto` : ajouter `journalAutoAssociate: boolean;` (champ déjà en base, jamais exposé — même schéma que l'ajout de `xp`/`level` en Story 6.2/6.3).
  - [x] `CharacterNoteDto` : ajouter `scenarioId: string | null;`.
  - [x] Nouveau `export interface SetJournalAutoAssociateDto { journalAutoAssociate: boolean; }`.
  - [x] Nouveau `export interface SetNoteScenarioDto { scenarioId: string | null; }` (`null` = désassocier).
  - [x] `ScenarioDto` : ajouter `retrospectiveNotes?: CharacterNoteDto[];` juste après `participants` — **optionnel**, peuplé uniquement si `status === 'PASSE'` (AC7, même convention que `participants` peuplé seulement si `CAMPAGNE_EPISODIQUE`).

- [x] **Task 3 — `apps/api/src/characters/character.service.ts` : écriture** (AC1, AC2, AC6, AC8)
  - [x] `async setJournalAutoAssociate(characterId: string, userId: string, value: boolean): Promise<CharacterDto>` — même structure que `toggleNoteShare`/mutations propriétaire-seul : `getOwnCharacterOrThrow(characterId, userId)` (403 si non-propriétaire, AC8) → `prisma.character.update({ where: { id: characterId }, data: { journalAutoAssociate: value } })` → `findOne(characterId, userId)` (ou reconstruire le DTO directement, au choix — `findOne` déjà existant réutilisable pour resoudre `ownerPseudo`/`ownerIsMj`/`viewerIsMj`).
  - [x] `async setNoteScenario(characterId: string, userId: string, noteId: string, scenarioId: string | null): Promise<CharacterNoteDto>` — même structure exacte que `toggleNoteShare` (vérifie `note.characterId === characterId` avant d'écrire, empêche un propriétaire de manipuler la note d'un autre personnage en devinant un UUID) : `getOwnCharacterOrThrow` → `findUnique` la note → 404 si absente/n'appartenant pas à `characterId` → `prisma.characterNote.update({ where: { id: noteId }, data: { scenarioId } })` → `toNoteDto(updated)`. **Pas de vérification que `scenarioId` appartient à une Partie où ce personnage a un rôle** — non demandé par les AC, cohérent avec le style permissif déjà établi ailleurs dans ce palier (ex. `setSeanceCapacity` sans garde de statut) ; à noter comme limitation mineure, pas un blocage.
  - [x] `characters.controller.spec.ts`/`character.service.spec.ts` : tests standards (écriture réussie, 403 non-propriétaire, 404 note/personnage introuvable) pour les deux nouvelles méthodes.

- [x] **Task 4 — `apps/api/src/characters/character.service.ts` : lecture pour `ScenariosModule`** (AC3, AC5)
  - [x] `async getRetrospectiveNotes(characterId: string, scenarioId: string, windowStart: Date | null, windowEnd: Date | null): Promise<CharacterNoteDto[]>` — méthode **exportée**, pas de vérification d'autorisation interne (appelée uniquement depuis `ScenariosService`, déjà authentifiée/autorisée en amont via `getViewable` sur la Partie — même confiance inter-module que les autres méthodes `CharacterService` déjà consommées cross-module, ex. aucune n'existe encore mais le principe suit `PartiesService.getOwned`/`getViewable` déjà appelées ainsi depuis `ScenariosService`).
    - Requête Prisma unique : `prisma.characterNote.findMany({ where: { characterId, OR: [ { scenarioId }, ...(windowStart && windowEnd ? [{ shared: true, createdAt: { gte: windowStart, lte: windowEnd } }] : []) ] }, orderBy: { createdAt: 'desc' } })` — combine en une seule requête l'association manuelle (`scenarioId` correspond à ce scénario) **et** l'association automatique (si le personnage a `journalAutoAssociate: true` **et** qu'une fenêtre valide existe), déduplique naturellement (un `OR` Prisma ne renvoie jamais deux fois la même ligne).
    - **Vérifier `journalAutoAssociate` avant d'inclure la branche auto** : charger `character.journalAutoAssociate` (un seul `select` ciblé) ; si `false`, n'inclure que la branche `scenarioId` dans le `OR` (pas la branche `shared`+fenêtre) — sinon une entrée partagée dans la fenêtre apparaîtrait même réglage désactivé, violant AC2/AC4.
    - Retourne `[]` si le personnage n'a aucune note pertinente (jamais d'erreur pour ce cas, méthode d'agrégation silencieuse).
  - [x] `character.service.spec.ts` : nouveau `describe('getRetrospectiveNotes()')` — note manuelle incluse quel que soit `journalAutoAssociate` ; note partagée+datée-dans-la-fenêtre incluse **seulement si** `journalAutoAssociate: true` ; note partagée+hors-fenêtre exclue même si `journalAutoAssociate: true` ; note non-partagée jamais incluse par la branche auto (même si datée dans la fenêtre) ; note ni manuelle ni partagée jamais incluse ; `windowStart`/`windowEnd` tous deux `null` (aucune séance datée) → seule la branche manuelle s'applique.

- [x] **Task 5 — `apps/api/src/characters/characters.controller.ts` : routes** (AC1, AC2, AC6, AC8)
  - [x] `@Patch(':id/journal-auto-associate') setJournalAutoAssociate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetJournalAutoAssociateDto, @CurrentUser() user: AuthUser) { return this.characters.setJournalAutoAssociate(id, user.id, dto.journalAutoAssociate); }`.
  - [x] `@Patch(':id/notes/:noteId/scenario') setNoteScenario(@Param('id', ParseUUIDPipe) id: string, @Param('noteId', ParseUUIDPipe) noteId: string, @Body() dto: SetNoteScenarioDto, @CurrentUser() user: AuthUser) { return this.characters.setNoteScenario(id, user.id, noteId, dto.scenarioId); }` — regroupées avec les routes `notes` existantes (`addNote`/`toggleNoteShare`/`getNotes`).
  - [x] Nouveaux fichiers `apps/api/src/characters/dto/set-journal-auto-associate.dto.ts` (`@IsBoolean() journalAutoAssociate!: boolean;`) et `apps/api/src/characters/dto/set-note-scenario.dto.ts` (`@ValidateIf((o) => o.scenarioId !== null) @IsUUID() scenarioId!: string | null;` — accepte explicitement `null`, même style `ValidateIf` que `title` dans `update-scenario.dto.ts`).
  - [x] `characters.controller.spec.ts` : 2 tests de routage standards.

- [x] **Task 6 — `apps/api/src/scenarios/scenarios.module.ts`/`scenarios.service.ts` : import `CharacterModule` + agrégation** (AC3, AC5, AC7)
  - [x] `scenarios.module.ts` : ajouter `CharacterModule` à `imports: [PartiesModule, CharacterModule]` (import manquant à ce jour — `ARCHITECTURE-SPINE.md` décrit déjà cette dépendance dans son diagramme mermaid, jamais câblée en code avant cette story).
  - [x] `ScenariosService` : injecter `private readonly characters: CharacterService` au constructeur (à côté de `parties: PartiesService`).
  - [x] Nouvelle fonction `async loadRetrospectiveNotes(prisma, characters: CharacterService, scenario, partieKind): Promise<CharacterNoteDto[]>` (regroupée avec `loadParticipants`/`loadSeances`, même fichier) :
    - Ne s'exécute que si `scenario.status === 'PASSE'` (AC7) — sinon retourne `undefined` immédiatement, pas d'appel `CharacterService`.
    - Calcule la fenêtre `[windowStart, windowEnd]` à partir des `SeanceDto` déjà chargées (`loadSeances`) : pour chaque séance, date effective = `seance.poll?.chosenDate ?? seance.inscription?.dateValidee ?? null` (cf. `[ASSUMPTION]` ci-dessous) ; `windowStart` = date effective la plus ancienne, `windowEnd` = la plus récente, parmi les séances qui en ont une ; `null`/`null` si aucune séance n'a de date résolue.
    - Résout la liste des personnages concernés via `CharacterService.findByPartie(scenario.partieId, ...)` (méthode déjà existante, exportée) : pour `CAMPAGNE_EPISODIQUE`, filtrer aux `userId` de `ScenarioParticipant` (déjà chargés via `loadParticipants`) ; sinon (linéaire/one-shot), tous les personnages de la Partie (participation implicite, AD-4).
    - Pour chaque personnage retenu, `await this.characters.getRetrospectiveNotes(character.id, scenario.id, windowStart, windowEnd)`, concatène les résultats.
  - [x] `toEnrichedDto`/`toDto` : ajouter `retrospectiveNotes` au DTO retourné (même point d'assemblage que `participants`/`seances`).
  - [x] **`[ASSUMPTION]` — `CharacterService.findByPartie` appelée avec l'ID technique de l'appelant système, pas un `userId` réel** : cette méthode existante (`partie-characters.controller.ts`) est actuellement toujours appelée avec un `userId` réel pour vérifier l'accès (`getViewable` interne). Ici, l'appel vient de `ScenariosService`, déjà après un `getViewable`/`getOwned` réussi sur la Partie — vérifier avant implémentation si `findByPartie` a besoin d'un contournement (ex. un second paramètre optionnel `skipAuthCheck`, ou simplement passer le `userId` du viewer déjà authentifié, qui passera de toute façon `getViewable` puisqu'il est déjà membre) ; **ne pas dupliquer la logique d'accès** — lire `findByPartie` intégralement avant d'écrire ce Task pour choisir l'approche la plus simple sans casser sa signature existante.
  - [x] `scenarios.service.spec.ts` : nouveaux tests sur `findAllForPartie`/`toEnrichedDto` — `retrospectiveNotes` absent si `status !== 'PASSE'` (AC7) ; peuplé et agrégeant plusieurs personnages si `PASSE` (linéaire = tous les membres, épisodique = seulement les participants) ; fenêtre calculée correctement à partir de `poll.chosenDate`/`inscription.dateValidee` mixtes ; fenêtre `null`/`null` si aucune séance datée (aucune erreur, notes manuelles seules retournées).

- [x] **Task 7 — Frontend : switch + association manuelle + agrégation lecture** (AC1, AC2, AC3, AC4, AC6)
  - [x] `packages/shared` déjà mis à jour (Task 2) — `apps/web/src/app/core/characters/character.service.ts` : `setJournalAutoAssociate(characterId, value)` et `setNoteScenario(characterId, noteId, scenarioId)`, même pattern `PATCH`+`satisfies` que `toggleNoteShare` existant.
  - [x] `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts`+`.html` : nouvelle section « Journal associé », visible **seulement** `@if (isPasse())`, **seulement pour un participant possédant un personnage sur cette Partie** (résolution via `this.data.characters`, déjà chargée par l'appelant — filtrer sur `c.userId === currentUserId()`) :
    - Switch « Association automatique » lié à `character.journalAutoAssociate` — `(change)` appelle `characterService.setJournalAutoAssociate(character.id, value)`, optimistic update local ou rechargement, au choix de l'implémentation.
    - Liste des propres entrées du joueur (`characterSvc.getNotes(character.id)`, déjà utilisé par `NotesJournal`) avec une case à cocher par entrée (`note.scenarioId === scenario.id`), `(change)` appelle `setNoteScenario(character.id, note.id, checked ? scenario.id : null)`.
    - Affichage en lecture, **pour tout membre** (pas seulement le participant) : `scenario().retrospectiveNotes` (déjà agrégé par le backend, Task 6) — liste simple, une entrée par note (texte + `characterId` d'origine si utile pour distinguer plusieurs personnages).
  - [x] `scenario-read-dialog.spec.ts` : switch visible seulement pour le propriétaire d'un personnage participant, absent pour un non-participant ou un scénario non-`PASSE` ; case à cocher reflète `note.scenarioId` ; `retrospectiveNotes` affichées pour tout membre y compris non-propriétaire.

### Review Findings

- [x] [Review][Patch] Fuite de confidentialité + isolation multi-Partie sur l'association manuelle du journal — **Corrigé (correction complète).** `CharacterService.getRetrospectiveNotes()` construisait son `OR` Prisma avec une branche manuelle `{ scenarioId }` **sans filtre `shared: true`**, laissant fuiter des notes privées associées manuellement vers tout membre de la Partie via `ScenarioDto.retrospectiveNotes` (confirmé indépendamment par Blind Hunter et Edge Case Hunter). `setNoteScenario()` ne validait pas non plus que le `scenarioId` appartient à la Partie du personnage, ni (en épisodique) que le personnage participe au scénario visé (incohérence relevée par l'Acceptance Auditor : association acceptée en écriture mais silencieusement absente en lecture). Décision utilisateur : correction complète (les 3 problèmes), avec une variante UX pour le flag `shared` — plutôt qu'un filtrage muet côté lecture, `ScenarioReadDialog` affiche désormais un cadenas (🔒/🔓) déverrouillable directement sur chaque note associée, pour que le joueur comprenne pourquoi une note cochée mais privée n'apparaît pas encore, sans aller-retour vers sa fiche de personnage. Implémenté : `getRetrospectiveNotes()` ajoute `shared: true` à la branche manuelle ; `setNoteScenario()` vérifie `scenario.partieId === character.partieId` (400 sinon) et, pour `CAMPAGNE_EPISODIQUE`, l'existence d'un `ScenarioParticipant` (400 sinon) ; `ScenarioReadDialog.toggleShare()` (nouveau, réutilise `characterSvc.toggleNoteShare` déjà utilisé par `NotesJournal`) + indice textuel si une note cochée est encore privée. 10 nouveaux/modifiés tests `character.service.spec.ts`, 3 nouveaux tests `scenario-read-dialog.spec.ts`.

- [x] [Review][Patch] Message d'erreur `getOwnCharacterOrThrow` toujours « portrait » pour les 2 nouvelles routes [character.service.ts] — texte trompeur réutilisé tel quel pour `setJournalAutoAssociate`/`setNoteScenario`, alors qu'aucune de ces deux mutations ne touche au portrait. Généralisé.

- [x] [Review][Defer] Routes de mutation de séance (`addSeance`/`linkSeancePoll`/`setSeanceCapacity`/`validerDate`) et `participate()` n'ont aucune garde de statut `PASSE` [scenarios.service.ts] — déferré, gap pré-existant (ces méthodes n'ont jamais eu cette garde, avant même cette story) mais devenu exploitable différemment via cette story : un MJ peut ajouter/valider une séance après clôture pour élargir rétroactivement la fenêtre d'association automatique, ou un joueur peut rejoindre un scénario épisodique après clôture pour faire apparaître ses notes dans une rétrospective à laquelle il n'a pas réellement participé. Corriger nécessiterait d'ajouter une garde de statut à 5 méthodes existantes, hors du périmètre ciblé de cette story — à traiter dans un futur nettoyage de dette technique de l'Epic 8.
- [x] [Review][Defer] Motif N+1/N×M sur `loadRetrospectiveNotes()` [scenarios.service.ts, character.service.ts] — déferré, performance uniquement (comportement correct) : un `findUnique` supplémentaire par personnage dans `getRetrospectiveNotes()` pour lire `journalAutoAssociate` (aurait pu être sélectionné en une fois par `findAllByPartie`), plus un appel par personnage pertinent par scénario `PASSE`. Acceptable à l'échelle de cette application (petits groupes d'amis), à revisiter si le volume de données grossit.
- [x] [Review][Defer] Signal local `characters` dans `ScenarioReadDialog` non resynchronisé avec une source externe [scenario-read-dialog.ts] — déferré, même pattern déjà établi pour le signal `scenario` de ce même composant (copié depuis `data.scenario`, non plus resynchronisé après coup) ; pas une régression introduite spécifiquement par cette story.
- [x] [Review][Defer] Aucune pagination sur les listes de notes (`getNotes()`/`getRetrospectiveNotes()`) — déferré, pattern pré-existant sur `getNotes()` (Story 6.5), cohérent avec l'absence de pagination ailleurs dans l'application à ce stade.
- [x] [Review][Defer] `journalError` sans bouton de nouvelle tentative si le chargement initial de `ownNotes` échoue dans `ngOnInit` [scenario-read-dialog.ts] — déferré, cohérent avec le même manque de retry déjà accepté sur `documentsError` dans ce fichier.

**Dismissed as noise (5)** : absence de tests dans le diff (faux positif du Blind Hunter — contexte de diff abrégé transmis à l'agent ; en réalité 139 nouveaux/modifiés tests `character.service.spec.ts`, 5 nouveaux tests `scenarios.service.spec.ts` sur `retrospectiveNotes`, 9 nouveaux tests `scenario-read-dialog.spec.ts`, tous vérifiés verts) ; réassignation silencieuse d'une note déjà associée à un autre scénario sans avertissement (cohérent avec l'absence de confirmation déjà acceptée ailleurs dans ce palier, ex. Story 8.5 sur l'effacement du résumé de fin) ; double comptage d'une note partagée dans les fenêtres de deux scénarios `PASSE` qui se chevauchent (comportement voulu par le calcul de fenêtre documenté en `[ASSUMPTION]`, pas une erreur) ; assertions non-null (`windowStart!`/`windowEnd!`) dans une fonction de 5 lignes entièrement couverte par les tests, style déjà utilisé ailleurs dans le codebase ; réalignement de espaces dans `schema.prisma` sur des champs sans rapport (`seances`/`documents`/`participants`/`announcements`) — cosmétique, formateur Prisma.

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-11 (verbatim, `ARCHITECTURE-SPINE.md`)** :
  > `Character.journalAutoAssociate Boolean @default(false)` (nouveau champ, `CharacterModule` reste propriétaire d'écriture). Un booléen **par personnage**, pas par joueur. `ScenariosModule` importe `CharacterModule` en lecture seule pour assembler `RetrospectivePanel` : requête les `CharacterNote` `shared: true` du personnage datées dans la fenêtre du scénario, filtrées côté `CharacterService` (nouvelle méthode exportée), **jamais un accès Prisma direct depuis `ScenariosModule`**.
  Cette story implémente cette règle pour la première fois — `ScenariosModule` n'importe **pas encore** `CharacterModule` à ce jour (vérifié par lecture directe de `scenarios.module.ts:7`, seul `PartiesModule` y figure), c'est un import manquant à ajouter, pas une régression.
- **AD-1 (rappel, hérité)** : le champ `scenarioId` sur `CharacterNote` reste une propriété de `CharacterModule` (comme `journalAutoAssociate`) — `ScenariosModule` ne l'écrit jamais, seulement `CharacterService` (Task 3).
- **P1-AD-3 (rappel, hérité)** : `getOwnCharacterOrThrow` (propriétaire seul) pour toute écriture sur `journalAutoAssociate`/`scenarioId` — même schéma que `toggleNoteShare`.

- **`[ASSUMPTION]` — calcul de la « fenêtre du scénario » (Task 6)** : ni `epics.md` ni `ARCHITECTURE-SPINE.md`/`EXPERIENCE.md` ne précisent la source exacte de « la date de sa première et de sa dernière séance ». Une `Seance` n'a pas de champ `date` direct — sa date effective vient soit de `SessionPoll.chosenDate` (linéaire/one-shot, déjà résolu dans `SeanceDto.poll`), soit de `Seance.dateValidee` (épisodique, déjà résolu dans `SeanceDto.inscription`). Décision : fenêtre = `[min, max]` des dates effectives résolues parmi toutes les séances du scénario ; si aucune séance n'a de date résolue (vote jamais scellé, inscription jamais validée), aucune fenêtre → la branche automatique ne retourne jamais rien tant qu'aucune date n'est connue, seule l'association manuelle fonctionne. Cohérent avec le principe du palier : aucune automatisation ne doit produire un résultat sur une donnée absente/non confirmée.
- **`[ASSUMPTION]` — pas de vérification de participation avant association manuelle (Task 3)** : `setNoteScenario` n'exige pas que le personnage soit effectivement participant/membre du scénario visé (ex. un joueur pourrait associer une note à un scénario d'une Partie où il n'a pas de personnage). Non demandé par les AC ; en pratique le frontend (Task 7) n'expose ce contrôle que dans le contexte d'un `ScenarioReadDialog` déjà ouvert pour le bon scénario, rendant le cas impossible en usage normal. Limitation mineure notée, pas un blocage — cohérent avec le style permissif déjà établi (`setSeanceCapacity` sans garde de statut, Story 8.3).
- **`[ASSUMPTION]` — `findByPartie` pour résoudre les personnages participants (Task 6)** : cf. note dans Task 6 ci-dessus — à valider en lisant `character.service.ts::findByPartie` intégralement avant d'écrire le code, pour ne pas introduire un contournement d'autorisation fragile.
- **Convention de texte : pas de `ThemeToneService` (rappel, hérité de Stories 8.3-8.5)** : même convention, chaînes françaises codées en dur dans `scenario-read-dialog.html`.

### Code existant à répliquer (lu intégralement avant d'écrire le code)

**`apps/api/src/characters/character.service.ts`** (lu intégralement) :
- `toggleNoteShare()` (lignes 1000-1018) : modèle exact à répliquer pour `setNoteScenario()` — même vérification `note.characterId === characterId`, même structure `getOwnCharacterOrThrow` → `findUnique` → `update` → `toNoteDto`.
- `getOwnCharacterOrThrow()` (lignes 1062-1073) : à réutiliser tel quel pour `setJournalAutoAssociate`/`setNoteScenario`.
- `toDto()` (lignes 1098-1126) : ajouter `journalAutoAssociate: character.journalAutoAssociate ?? false` — champ déjà en base (migration existante), jamais mappé.
- `toNoteDto()` (lignes 1128+) : ajouter `scenarioId: note.scenarioId ?? null`.

**`apps/api/src/scenarios/scenarios.service.ts`** (lu intégralement, état post-8.5) :
- `toEnrichedDto()`/`toDto()`/`loadParticipants()`/`loadSeances()` (lignes 675-812) : squelette exact à étendre pour `retrospectiveNotes` — même style de fonction `load*` séparée, agrégée dans `toDto()`.
- `toSeanceDto()` (lignes 743-765) : `poll.chosenDate`/`inscription.dateValidee` déjà résolus ici — source des dates pour le calcul de fenêtre (Task 6), pas besoin de requêter `SessionPoll`/`Inscription` une seconde fois.

**`apps/api/src/scenarios/scenarios.module.ts`** (lu intégralement, 8 lignes) — `imports: [PartiesModule]` actuel, à étendre en `imports: [PartiesModule, CharacterModule]`.

**`apps/api/src/characters/character.module.ts`** (lu intégralement) — `exports: [CharacterService]` déjà en place, aucune modification nécessaire côté `CharacterModule` pour l'import croisé.

**`apps/web/src/app/features/characters/character-sheet/notes-journal/notes-journal.ts`+`.html`** (lu intégralement) — pattern `characterSvc.getNotes()`/`toggleNoteShare()` à répliquer pour la case à cocher d'association manuelle (Task 7) ; ce composant lui-même n'est **pas modifié** par cette story (reste dédié à la fiche personnage, l'association vit dans `ScenarioReadDialog`).

**`apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts`+`.html`** (lu intégralement, état post-8.5) — `isPasse()`, `data.characters`, `currentUserId` déjà disponibles ; section résumé de fin (Story 8.5) juste au-dessus est le point d'insertion naturel pour la section journal associé.

### Hors scope explicite de cette story (ne pas implémenter)

- Un composant `RetrospectivePanel` séparé — même déviation assumée que Story 8.5, aucun regroupement de composant introduit par cette story.
- Association automatique rétroactive au moment où `journalAutoAssociate` passe à `true` (« snapshot » des notes déjà partagées) — non nécessaire, le calcul est fait à la lecture (`getRetrospectiveNotes`), toujours à jour dynamiquement, jamais besoin d'un job de rattrapage.
- Désassociation en masse / bouton « tout désélectionner » — non demandé, chaque note se coche/décoche individuellement.
- Limite de nombre d'entrées associées par scénario — non demandée.
- Toute modification du calcul de `pendingLevels`/XP ou d'autres fonctionnalités de `CharacterModule` sans rapport avec le journal — hors scope strict.
- Vérification de participation avant association manuelle (cf. `[ASSUMPTION]` ci-dessus) — limitation mineure assumée, pas un correctif requis par cette story.

### Project Structure Notes

- **Nouvelle migration Prisma requise** (première de l'Epic 8 — toutes les stories précédentes réutilisaient des champs déjà en base) : `CharacterNote.scenarioId` + relation vers `Scenario`.
- Nouveaux fichiers backend : `apps/api/src/characters/dto/set-journal-auto-associate.dto.ts`, `apps/api/src/characters/dto/set-note-scenario.dto.ts`.
- `apps/api/src/scenarios/scenarios.module.ts` modifié (nouvel import `CharacterModule`) — premier changement de dépendance de module depuis le début du palier.
- Aucun nouveau composant frontend — section ajoutée à `scenario-read-dialog.html` existant (cf. Hors scope, pas de `RetrospectivePanel`).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.6] — texte d'origine de la story et 6 ACs.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-11] — réglage sur `Character`, lecture cross-module via `CharacterService` exportée, jamais d'accès Prisma direct à `CharacterNote` depuis `ScenariosModule`.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/EXPERIENCE.md#4] — switch « Association automatique », désactivé par défaut, case à cocher manuelle par entrée.
- [Source: apps/api/prisma/schema.prisma] — `Character.journalAutoAssociate Boolean @default(false)` déjà en place (jamais exposé) ; `CharacterNote` sans relation `Scenario` (à ajouter, seule migration de cette story).
- [Source: apps/api/src/characters/character.service.ts] — `toggleNoteShare()`/`getOwnCharacterOrThrow()`/`toDto()`/`toNoteDto()` lus intégralement, modèles exacts à étendre.
- [Source: apps/api/src/scenarios/scenarios.service.ts] — `toEnrichedDto()`/`toDto()`/`loadParticipants()`/`toSeanceDto()` lus intégralement, source des dates de séance pour le calcul de fenêtre.
- [Source: apps/api/src/scenarios/scenarios.module.ts] — import `CharacterModule` manquant à ajouter (vérifié par lecture directe, 8 lignes).
- [Source: apps/api/src/characters/character.module.ts] — `exports: [CharacterService]` déjà en place.
- [Source: apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts, .html] — état post-Story 8.5, point d'insertion de la nouvelle section journal associé.
- [Source: apps/web/src/app/features/characters/character-sheet/notes-journal/notes-journal.ts] — pattern `getNotes`/`toggleNoteShare` à répliquer côté frontend.
- [Source: 8-5-resume-fin-scenario.md] — intelligence de la story précédente : convention `[ASSUMPTION]`, pas de nouveau composant `RetrospectivePanel`, `pnpm typecheck` à lancer après tout changement de signature, pattern de revue adversariale à 3 couches post-implémentation.

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

Drift de migration détecté au démarrage de Task 1 : `prisma migrate dev` a refusé d'appliquer la nouvelle migration car le fichier `20260712115353_scenarios_seances_p4` avait été modifié après application (checksum différent), sans trace de modification non commitée (`git diff` vide). Résolu via `prisma migrate reset --force` (base de dev locale uniquement, confirmé avec l'utilisateur avant exécution) puis nouvelle migration appliquée proprement. Aucun autre blocage — implémentation suivie exactement selon les Dev Notes (lecture intégrale de `character.service.ts`/`scenarios.service.ts`/`scenarios.module.ts` avant écriture, comme demandé).

### Completion Notes List

- Task 1 : migration `20260714123348_character_note_scenario_link` — `CharacterNote.scenarioId` nullable + FK `onDelete: SetNull`, relation inverse `Scenario.characterNotes`. Nécessité un reset de la base de dev locale (drift de migration pré-existant, sans rapport avec cette story).
- Task 2 : types ajoutés dans `packages/shared/src/index.ts` (`CharacterDto.journalAutoAssociate`, `CharacterNoteDto.scenarioId`, `SetJournalAutoAssociateDto`, `SetNoteScenarioDto`, `ScenarioDto.retrospectiveNotes`).
- Task 3 : `setJournalAutoAssociate()`/`setNoteScenario()` dans `CharacterService`, pattern `toggleNoteShare` répliqué à l'identique (garde anti-énumération incluse). 139/139 tests `character.service.spec.ts` verts (10 nouveaux).
- Task 4 : `getRetrospectiveNotes()` — requête `OR` unique combinant association manuelle et automatique, `journalAutoAssociate` vérifié avant d'inclure la branche auto. 5 nouveaux tests.
- Task 5 : routes `PATCH :id/journal-auto-associate` et `PATCH :id/notes/:noteId/scenario` + DTOs `class-validator` (`ValidateIf` pour accepter `scenarioId: null` explicitement). 52/52 tests `characters.controller.spec.ts` verts (2 nouveaux).
- Task 6 : `ScenariosModule` importe désormais `CharacterModule` (AD-11, premier changement de dépendance de module du palier). `[ASSUMPTION]` résolue : `CharacterService.findByPartie` existant est scopé au viewer (MJ voit tout, joueur voit seulement son propre personnage) — inadapté pour agréger TOUS les participants. Ajout d'une méthode dédiée `findAllByPartie(partieId)` (sans notion de viewer, usage cross-module interne uniquement, même modèle de confiance que `getRetrospectiveNotes`) plutôt que de contourner `findByPartie` avec un `userId` MJ fictif (fragile). `toEnrichedDto`/`findAllForPartie` étendus pour peupler `retrospectiveNotes` uniquement si `status === 'PASSE'` (AC7). Effet de bord technique : `CharacterService` importé comme valeur dans `scenarios.service.spec.ts`/`scenarios.controller.spec.ts` (jeton DI) déclenchait `SyntaxError: Unexpected token export` (import transitif ESM de `@master-jdr/game-rules`) — résolu en répliquant le `jest.mock('@master-jdr/game-rules', ...)` déjà utilisé par `character.service.spec.ts`. 125/125 tests `scenarios.service.spec.ts` verts (5 nouveaux), typecheck API propre.
- Task 7 : `setJournalAutoAssociate`/`setNoteScenario` dans le service Angular ; section « Journal associé » ajoutée à `ScenarioReadDialog` (switch + cases à cocher manuelles + liste `retrospectiveNotes` en lecture pour tout membre). `data.characters` copié dans un signal local mutable pour refléter le switch après mise à jour sans rechargement. 30/30 tests `scenario-read-dialog.spec.ts` verts (9 nouveaux). Fixtures `CharacterDto`/`CharacterNoteDto` littérales mises à jour dans 3 fichiers de tests préexistants (`level-up-banner.spec.ts`, `level-up-wizard.spec.ts`, `notes-journal.spec.ts`) pour satisfaire les nouveaux champs obligatoires du DTO.
- Suite finale : 603/603 tests API, 642/642 tests web, `pnpm typecheck` (API) propre, aucune régression.
- Décision utilisateur hors périmètre de cette story : script de seed pour une base de dev réutilisable (joueurs, campagnes de chaque type, personnages, scénarios) demandé après le reset de migration — sera traité séparément après la fin de cette story.

### File List

- `apps/api/prisma/schema.prisma` (modifié — `CharacterNote.scenarioId`, relation inverse `Scenario.characterNotes`)
- `apps/api/prisma/migrations/20260714123348_character_note_scenario_link/migration.sql` (nouveau)
- `packages/shared/src/index.ts` (modifié — `journalAutoAssociate`, `scenarioId`, `SetJournalAutoAssociateDto`, `SetNoteScenarioDto`, `retrospectiveNotes`)
- `apps/api/src/characters/character.service.ts` (modifié — `setJournalAutoAssociate()`, `setNoteScenario()`, `getRetrospectiveNotes()`, `findAllByPartie()`, `toDto()`/`toNoteDto()` étendus)
- `apps/api/src/characters/character.service.spec.ts` (modifié — nouveaux describe blocks)
- `apps/api/src/characters/characters.controller.ts` (modifié — 2 nouvelles routes)
- `apps/api/src/characters/characters.controller.spec.ts` (modifié — 2 nouveaux tests)
- `apps/api/src/characters/dto/set-journal-auto-associate.dto.ts` (nouveau)
- `apps/api/src/characters/dto/set-note-scenario.dto.ts` (nouveau)
- `apps/api/src/scenarios/scenarios.module.ts` (modifié — import `CharacterModule`)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié — injection `CharacterService`, `loadRetrospectiveNotes()`, `toDto`/`toEnrichedDto`/`findAllForPartie` étendus)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — mock `CharacterService`, mock `@master-jdr/game-rules`, nouveaux tests `retrospectiveNotes`)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — mock `@master-jdr/game-rules`)
- `apps/web/src/app/core/characters/character.service.ts` (modifié — `setJournalAutoAssociate()`, `setNoteScenario()`)
- `apps/web/src/app/core/characters/character.service.spec.ts` (modifié — 3 nouveaux tests)
- `apps/web/src/app/core/characters/character-dto.fixture.ts` (modifié — `journalAutoAssociate: false`)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (modifié — section Journal associé)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html` (modifié — section Journal associé)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (modifié — 9 nouveaux tests)
- `apps/web/src/app/features/characters/character-sheet/level-up-banner/level-up-banner.spec.ts` (modifié — fixture `journalAutoAssociate`)
- `apps/web/src/app/features/characters/character-sheet/level-up-wizard/level-up-wizard.spec.ts` (modifié — fixture `journalAutoAssociate`)
- `apps/web/src/app/features/characters/character-sheet/notes-journal/notes-journal.spec.ts` (modifié — fixture `scenarioId`)

## Change Log

- 2026-07-14 : Story créée via `bmad-create-story` (lecture directe de `character.service.ts`/`.controller.ts`, `scenarios.service.ts`/`.module.ts`, `character.module.ts`, `schema.prisma`, `packages/shared/src/index.ts`, `scenario-read-dialog.ts`/`.html`, `notes-journal.ts`, `ARCHITECTURE-SPINE.md` AD-11, `EXPERIENCE.md` §4 — `Character.journalAutoAssociate` existe déjà en base mais n'est exposé/lu/écrit nulle part ; `CharacterNote` n'a aucune relation vers `Scenario` (première migration Prisma de l'Epic 8, toutes les stories précédentes réutilisaient des champs déjà en base) ; `ScenariosModule` n'importe pas encore `CharacterModule` malgré le diagramme de dépendances déjà documenté dans `ARCHITECTURE-SPINE.md`. Décisions : `CharacterNote.scenarioId` nullable simple (pas de table de jointure many-to-many) ; fenêtre du scénario calculée à partir de `poll.chosenDate`/`inscription.dateValidee` déjà résolus sur `SeanceDto`, `null`/`null` si aucune séance datée ; agrégation en lecture seule (pas de snapshot au moment du toggle).
- 2026-07-14 : Implémentation complète (bmad-dev-story). Reset de la base de dev locale nécessaire (drift de migration pré-existant, confirmé avec l'utilisateur). Ajout de `CharacterService.findAllByPartie()` (résolution de l'`[ASSUMPTION]` Task 6 — `findByPartie` existant est scopé au viewer, inadapté pour agréger tous les participants). 7 tasks, TDD red-green par task. 603/603 tests API + 642/642 tests web, `pnpm typecheck` propre, aucune régression. Status → `review`.
- 2026-07-14 : Revue de code (bmad-code-review, 3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 1 patch critique appliqué (fuite de confidentialité + isolation multi-Partie sur l'association manuelle du journal, confirmée indépendamment par 2 reviewers — correction complète avec cadenas déverrouillable côté UI, décision utilisateur) + 1 patch mineur (message d'erreur générique), 5 items différés (voir `deferred-work.md`), 5 écartés (dont un faux positif du Blind Hunter sur l'absence de tests, corrigé par un diff abrégé transmis à l'agent). Suite finale : 608/608 tests API (+5), 645/645 tests web (+3), `pnpm typecheck` propre, aucune régression. Status → `done`.
