---
baseline_commit: aa102ce
---

# Story 8.5: Résumé de fin de scénario

Status: done

## Story

As a MJ,
I want rédiger un résumé de fin à la clôture d'un scénario, plus riche que les comptes-rendus,
So that la campagne garde une trace durable des événements marquants et des coups d'éclat des joueurs.

## Acceptance Criteria

1. **Given** un scénario `status: PASSE` **When** le MJ rédige le résumé de fin via `PATCH /scenarios/:id/resume-fin` **Then** `Scenario.resumeFin` est enregistré et immédiatement reflété dans le `ScenarioDto` retourné (`resumeFin` déjà mappé sans modification depuis `toDto`/`toEnrichedDto`, existant) — visible par tous les membres dès la clôture (déjà satisfait en lecture par `scenario-read-dialog.html`, cf. Dev Notes).
2. **Given** un scénario dont `status !== 'PASSE'` (`BROUILLON`/`A_VENIR`/`COURANT`) **When** le MJ (ou quiconque) tente d'appeler `PATCH /scenarios/:id/resume-fin` **Then** la requête échoue en `400 Bad Request` — le résumé de fin n'a de sens qu'une fois le scénario clôturé (cf. `[ASSUMPTION]` Dev Notes ; à ne pas confondre avec le rejet 400 déjà en place sur `update()`, Story 7.1, qui bloque l'inverse : les champs narratifs de base une fois `PASSE`).
3. **Given** un résumé de fin déjà rédigé sur un scénario `PASSE` **When** le MJ le modifie après coup (nouvel appel `PATCH /scenarios/:id/resume-fin`) **Then** la modification est acceptée sans restriction — contrairement au contenu narratif de base (`title`/`description`/durées, bloqué par `update()` une fois `PASSE`), le résumé reste éditable indéfiniment après clôture.
4. **Given** un scénario `PASSE` sans résumé rédigé (`resumeFin` `null` ou chaîne vide) **When** le MJ consulte sa fiche scénario (`ScenarioEditor`) **Then** un panneau incitatif l'invite à le rédiger (texte + champ de saisie + bouton toujours visibles, jamais un vide silencieux), **sans bloquer** l'affichage des comptes-rendus de séance déjà présents (`SeanceList`, Story 8.4, rendu indépendamment au-dessus).
5. **Given** un joueur non-MJ (ou un non-membre) **When** il tente d'appeler `PATCH /scenarios/:id/resume-fin` **Then** la requête échoue en `403 Forbidden` (`PartiesService.getOwned`, même schéma que `setCompteRendu`/`setSeanceCapacity`).
6. **Given** un scénario `PASSE` **When** un membre quelconque (MJ ou joueur) consulte `ScenarioReadDialog` **Then** le résumé de fin déjà rédigé s'affiche, ou un message neutre s'il est absent — **déjà satisfait par l'implémentation existante** (`scenario-read-dialog.html` affiche `resumeFin` en lecture seule depuis l'introduction du champ dans le DTO ; test `scenario-read-dialog.spec.ts:96` confirme explicitement « PASSE sans résumé → message neutre, pas d'incitation MJ » — cette story n'y touche pas, l'incitation MJ n'a de sens que côté `ScenarioEditor`, cf. AC4).

*(Source : epics.md Story 8.5, 4 ACs reformulées en Given/When/Then et complétées de 2 ACs (AC2 : rejet explicite si le scénario n'est pas encore `PASSE`, non couvert littéralement par le texte d'origine mais nécessaire pour éviter un résumé de fin posé sur un scénario encore actif ; AC6 : confirmation que la lecture joueur est déjà satisfaite par l'infrastructure existante, pour circonscrire le scope réel de cette story à l'écriture MJ) — même méthode que Stories 8.1/8.2/8.3/8.4.)*

## Tasks / Subtasks

- [x] **Task 1 — `packages/shared/src/index.ts` : `SetResumeFinDto`** (AC1)
  - [x] Ajouter `export interface SetResumeFinDto { resumeFin: string; }` juste après `SetCompteRenduDto` (même style, pas de modification de `ScenarioDto` — `resumeFin?: string` existe déjà).

- [x] **Task 2 — `apps/api/src/scenarios/scenarios.service.ts` : `setResumeFin()`** (AC1, AC2, AC3, AC5)
  - [x] `async setResumeFin(scenarioId: string, mjId: string, resumeFin: string): Promise<ScenarioDto>` :
    - `findUnique` le `Scenario` par `id` → `NotFoundException('Scénario introuvable')` si absent.
    - `const partie = await this.parties.getOwned(scenario.partieId, mjId);` (403 non-MJ et non-membre, AC5 — même schéma que `setCompteRendu`/`update`).
    - **Garde de statut (AC2, `[ASSUMPTION]`)** : `if (scenario.status !== 'PASSE') throw new BadRequestException("Le résumé de fin ne peut être rédigé qu'après clôture du scénario");` — **contrairement** à `update()` qui bloque quand `status === 'PASSE'`, cette méthode exige l'inverse (bloque tant que `status !== 'PASSE'`), cohérent avec le message de `update()` (scenarios.service.ts:78) qui annonce déjà « seule l'édition du résumé de fin (Epic 8) reste possible » comme l'exception réservée à `PASSE`.
    - **Aucune autre restriction** — pas de garde de `kind` (linéaire/épisodique/one-shot tous concernés, contrairement à `setSeanceCapacity`/`inscrire`/`validerDate`), rappelable à volonté après la première rédaction (AC3).
    - `const updated = await this.prisma.scenario.update({ where: { id: scenarioId }, data: { resumeFin } }); return toEnrichedDto(this.prisma, updated, partie.kind);` — pas de `findUniqueOrThrow` intermédiaire nécessaire ici (contrairement à `setCompteRendu`, qui doit d'abord remonter du `Seance` vers son `Scenario` parent ; ce champ vit directement sur `Scenario`).
  - [x] `scenarios.service.spec.ts` : nouveau `describe('setResumeFin()')` — écriture réussie sur un scénario `PASSE` (AC1), écriture réussie avec chaîne vide (efface un résumé existant, cf. `[ASSUMPTION]` ci-dessous), rédaction acceptée une seconde fois après une première écriture (AC3, non-régression), rejet `400` si `status` n'est pas `PASSE` (un test par statut `BROUILLON`/`A_VENIR`/`COURANT`, ou `it.each`, AC2), `404` scénario introuvable, `403` non-MJ propagé par `getOwned` (AC5).

- [x] **Task 3 — `apps/api/src/scenarios/scenarios.controller.ts` : route `resume-fin`** (AC1, AC2, AC5)
  - [x] `@Patch('scenarios/:id/resume-fin') setResumeFin(@Param('id', ParseUUIDPipe) scenarioId: string, @CurrentUser() user: AuthUser, @Body() dto: SetResumeFinDto) { return this.scenarios.setResumeFin(scenarioId, user.id, dto.resumeFin); }` — à ajouter après la route `close()` (`@Patch('scenarios/:id/passe')`), regroupée avec les autres routes portant sur `Scenario` (pas `Seance`).
  - [x] Nouveau fichier `apps/api/src/scenarios/dto/set-resume-fin.dto.ts` : `class SetResumeFinDto { @IsString() resumeFin!: string; }` — **pas** `@IsNotEmpty()`, même raisonnement que `SetCompteRenduDto` (chaîne vide acceptée, cf. `[ASSUMPTION]`).
  - [x] `scenarios.controller.spec.ts` : ajouter `setResumeFin: jest.fn()` à `makeScenariosService()`, 1 test de routage standard.

- [x] **Task 4 — `apps/web/src/app/core/scenarios/scenarios.service.ts` : `setResumeFin()`** (AC1)
  - [x] `async setResumeFin(scenarioId: string, resumeFin: string): Promise<ScenarioDto>` — copie exacte du pattern `update()`/`close()` : `PATCH ${API_BASE}/scenarios/${scenarioId}/resume-fin` avec `{ resumeFin } satisfies SetResumeFinDto`, `this._changed.update((v) => v + 1)`.
  - [x] `scenarios.service.spec.ts` (core) : 1 nouveau test, même pattern `HttpTestingController` que les mutations existantes.

- [x] **Task 5 — `ScenarioEditor` : section résumé de fin, visible uniquement si `status === 'PASSE'`** (AC1, AC3, AC4)
  - [x] `scenario-editor.html` : ajouter une nouvelle section **avant** `<app-seance-list>` (résumé de fin = vue d'ensemble avant le détail séance par séance, cf. `EXPERIENCE.md` §4 : « résumé de fin en premier ») ou juste après (au choix de l'implémentation, non structurant) — visible **seulement** `@if (s.status === 'PASSE')` (à l'inverse de la section description/durées, masquée par `!isReadOnly()` qui est vrai précisément pour `PASSE`) :
    - `<textarea>` (valeur initiale `resumeFinDraft()`, signal séparé de `descriptionDraft`, initialisé dans le même `effect()` du constructeur) + bouton « Enregistrer le résumé de fin » **toujours visible** (cf. AC3/AC4 — jamais conditionné à l'absence de résumé), appelant `submitResumeFin()`.
    - Si `resumeFin` est vide/absent : texte incitatif affiché au-dessus du champ, ex. « Aucun résumé pour l'instant — rédigez-le pour clore la rétrospective. » (AC4, jamais un vide silencieux) — chaîne française codée en dur, cohérente avec la convention déjà établie dans ce fichier (pas de `ThemeToneService`, cf. Dev Notes Stories 8.3/8.4).
  - [x] `scenario-editor.ts` : `protected readonly resumeFinDraft = signal('');` initialisé dans l'`effect()` existant (`this.resumeFinDraft.set(s.resumeFin ?? '');`, à côté de `this.descriptionDraft.set(...)`) ; `protected readonly resumeFinError = signal<string | null>(null);` ; `protected async submitResumeFin(): Promise<void>` — même structure exacte que `submitDescription()` (garde `!s`, **pas** de garde `isReadOnly()` ici puisque cette section n'existe/n'est visible que quand `status === 'PASSE'`, contrairement à `submitDescription` qui doit rester bloquée sur `PASSE`), appelle `this.scenarios.setResumeFin(s.id, this.resumeFinDraft())`, gère l'erreur via `extractErrorMessage`.
  - [x] `scenario-editor.spec.ts` : nouvelle section de tests — le textarea+bouton résumé de fin n'apparaît **que** si `status === 'PASSE'` (absent pour `BROUILLON`/`A_VENIR`/`COURANT`, un test par statut ou `it.each`), texte incitatif affiché si `resumeFin` est `null`/vide, valeur pré-remplie si un résumé existe déjà, `submitResumeFin()` appelle `scenariosService.setResumeFin` et met à jour le signal `scenario`, message d'erreur affiché en cas d'échec API, les comptes-rendus de séance (`<app-seance-list>`) restent affichés indépendamment de l'état du résumé (AC4, non-régression — pas de nouveau test si déjà couvert, simple vérification visuelle dans le test existant).

### Review Findings

- [x] [Review][Patch] AC4 : le panneau « Résumé de fin » était inatteignable via la navigation normale de l'app — **Corrigé.** `scenario-timeline.ts:openDetail()` route toujours `PASSE` vers `ScenarioReadDialog` (lecture seule) pour tout le monde y compris le MJ, et `scenario-drafts.ts` ne liste que les `BROUILLON`, donc aucun clic dans l'app ne menait à `ScenarioEditor` pour un scénario `PASSE`. Décision utilisateur : ajouter un CTA dans `ScenarioReadDialog`, pas modifier le routage `scenario-timeline.ts` (préserve le comportement/commentaire déjà assumé depuis la Story 7.6). Implémenté : `ScenarioReadDialogData.isMj` (nouveau champ optionnel, renseigné par `scenario-timeline.ts`), bouton « Rédiger/Modifier le résumé de fin » visible dans la section résumé si `isMj() && isPasse()`, `editResume()` ferme le dialogue et navigue vers `/parties/:id/scenarios/:id` (même route que `ScenarioEditor`). 5 nouveaux tests (`scenario-read-dialog.spec.ts`), 6 tests existants ajustés (`scenario-timeline.spec.ts`, ajout de `isMj` dans les assertions `dialog.open`). (Source : Acceptance Auditor, confirmé par lecture directe de `scenario-timeline.ts`/`scenario-drafts.ts`.)

- [x] [Review][Defer] Pas d'état loading/disabled sur le bouton « Enregistrer le résumé de fin » (double-clic possible) [scenario-editor.html] — déferré, pattern préexistant (aucun bouton d'action de `ScenarioEditor` — `submitDescription`, `markCourant`, `close`, `addSeance` — n'a de garde loading/disabled ; pas une régression introduite par cette story).
- [x] [Review][Defer] `resumeFinDraft` non resynchronisé avec `scenario()` après `submitResumeFin()` [scenario-editor.ts:soumission] — déferré, pattern préexistant identique sur `submitDescription()`/`descriptionDraft` (ne se manifesterait qu'en cas de normalisation serveur du texte, qui n'existe pas aujourd'hui).
- [x] [Review][Defer] Textarea du résumé de fin sans `label`/`aria-label` associé [scenario-editor.html] — déferré, pattern préexistant sur tous les `<textarea>` de ce fichier (ex. description), pas spécifique à cette story.
- [x] [Review][Defer] Aucun test vérifiant le comportement de `class-validator`/`ValidationPipe` face à des champs superflus dans le body [set-resume-fin.dto.ts] — déferré, dépend d'une configuration globale hors diff, concerne tous les DTO de l'app.
- [x] [Review][Defer] Aucun test controller-level/e2e vérifiant le rejet HTTP (401/403) au niveau du guard [scenarios.controller.spec.ts] — déferré, lacune de test systémique sur toutes les routes du controller, pas introduite par cette story.
- [x] [Review][Defer] Aucune protection contre la perte du brouillon non sauvegardé en cas de navigation [scenario-editor.ts] — déferré, pattern préexistant identique sur `descriptionDraft`.
- [x] [Review][Defer] Pas de test d'intégration end-to-end confirmant qu'un `resumeFin` écrit est bien relu via un `GET` ultérieur (AC1) [scenarios.service.spec.ts] — déferré, mineur selon l'Acceptance Auditor lui-même (pas une violation d'AC dure, le mapping DTO est préexistant et vérifié par lecture de code).

**Dismissed as noise (6)** : absence de limite de longueur sur `resumeFin` (assumée explicitement par la story, non structurant) ; absence de verrou optimiste sur `setResumeFin` (AD-3, cohérent avec `update()`) ; traitement de la chaîne vide/espaces comme « vide » sans trim (comportement voulu par la story, AC3 « toujours éditable ») ; perte silencieuse de contenu en vidant le textarea (décision assumée explicitement par la story) ; commentaire de code référençant des numéros de ligne exacts (convention déjà utilisée ailleurs dans le codebase/Dev Notes) ; ordre `getOwned` avant vérification de statut (comportement correct, identique à tous les sibling methods).

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-1 (rappel, hérité)** : `ScenariosModule` propriétaire exclusif de `Scenario`/`Seance` — le résumé de fin est un **champ** de `Scenario`, jamais une entité indépendante avec son propre controller (cf. `ARCHITECTURE-SPINE.md` AD-1 : « Résumé de fin et comptes-rendus de séance sont des champs/sous-ressources de Scenario/Seance, jamais des entités indépendantes »).
- **AD-9 (rappel, hérité)** : écriture MJ-only via `getOwned` — `setResumeFin` suit exactement le même schéma que `setCompteRendu`/`update`.
- **AD-3 (rappel, hérité)** : `Scenario` n'a pas de verrouillage optimiste (MJ seul écrivain) — `setResumeFin` fait un `update()` Prisma simple, pas de comparaison `updatedAt`, cohérent avec `update()`/`close()` déjà en place.

- **`[ASSUMPTION]` — garde de statut `PASSE` obligatoire pour écrire (AC2, Task 2)** : ni `epics.md` ni `ARCHITECTURE-SPINE.md` n'énoncent explicitement un rejet si le scénario n'est pas encore `PASSE`, mais `update()` (scenarios.service.ts:76-80) anticipe déjà cette story dans son message d'erreur (« seule l'édition du résumé de fin (Epic 8) reste possible ») — cadrant le résumé de fin comme l'exception réservée précisément à l'état `PASSE`. Rédiger un résumé de fin sur un scénario encore `BROUILLON`/`A_VENIR`/`COURANT` n'a pas de sens métier (rien à résumer) et l'UI (Task 5) ne l'affiche de toute façon que si `status === 'PASSE'` — la garde backend est une défense en profondeur cohérente avec le reste du palier (chaque route vérifie son statut attendu : `open()` exige `BROUILLON`, `markCourant()` exige `A_VENIR`, `close()` exige `COURANT`).
- **`[ASSUMPTION]` — chaîne vide acceptée par le DTO (Task 3)** : même raisonnement que `SetCompteRenduDto` (Story 8.4) — permet au MJ d'effacer un résumé déjà rédigé en vidant le textarea et en ré-enregistrant, cohérent avec « toujours éditable » (AC3).
- **Convention de texte : pas de `ThemeToneService` (rappel, hérité de Stories 8.3/8.4)** : `scenario-editor.html`/`scenario-read-dialog.html` utilisent déjà des chaînes françaises codées en dur pour tout l'Epic 8 — cette story continue cette convention pour le texte incitatif MJ, ne réintroduit pas `theme.tone()['sessions.retrospective_title']` malgré la clé mentionnée dans `EXPERIENCE.md` §3 (illustrative, pas littéralement utilisée dans le code existant).
- **Pas de nouveau composant `RetrospectivePanel` (déviation assumée vs. `ARCHITECTURE-SPINE.md`/`DESIGN.md`)** : la spine/le design system nomment un composant `RetrospectivePanel` dédié (résumé + comptes-rendus + journal associé + annonces liées), mais l'implémentation réelle des Stories 8.2-8.4 n'a **jamais** créé ce composant — chaque champ a été ajouté directement à `ScenarioEditor`/`ScenarioReadDialog`/`SeanceList` existants (ex. comptes-rendus injectés dans `SeanceList`, pas dans un panneau séparé, Story 8.4). Cette story **suit la même convention déjà établie** : la section résumé de fin s'ajoute directement à `scenario-editor.html`, pas de nouveau fichier `.ts`/`.html`/`.scss`. Un `RetrospectivePanel` séparé pourrait être introduit plus tard (Story 8.6, association journal) si le regroupement devient nécessaire — non requis par les AC de cette story.

### Code existant à répliquer (lu intégralement avant d'écrire le code)

**`apps/api/src/scenarios/scenarios.service.ts`** (état post-8.4, lu intégralement) :
- `update()` (lignes 65-95) : modèle exact de la garde `status === 'PASSE'` à **inverser** pour `setResumeFin` (rejeter si `!== 'PASSE'` au lieu de `=== 'PASSE'`), et modèle du `prisma.scenario.update()` simple suivi de `toEnrichedDto`.
- `setCompteRendu()` (lignes 618-641, Story 8.4 — **en cours d'implémentation au moment de la création de cette story**, cf. Note ci-dessous) : modèle de style pour une méthode d'écriture MJ-only sur un champ texte simple, à adapter (ici directement sur `Scenario`, pas besoin de remonter depuis `Seance`).
- **Note importante** : au moment de la création de cette story (2026-07-14), la Story 8.4 (`8-4-compte-rendu-seance.md`) est `in-progress` — seuls `SetCompteRenduDto` (type partagé) et la méthode service `setCompteRendu()` existent ; la route controller, le DTO `class-validator`, le service Angular et la section `SeanceList` **n'existent pas encore**. Le dev agent de cette story 8.5 doit vérifier l'état réel de 8.4 avant de répliquer son pattern — si 8.4 est terminée, suivre son schéma final exact (DTO/route/service/UI) ; sinon, les schémas déjà établis par `setSeanceCapacity`/`update`/`close` (tous terminés, Story 8.3 et antérieures) restent la référence sûre.

**`apps/api/src/scenarios/dto/update-scenario.dto.ts`** (lu intégralement) — modèle exact de style `class-validator` (`@IsString()` sans validation de longueur stricte pour un champ texte libre) à répliquer pour `set-resume-fin.dto.ts` (une seule différence : pas de `MaxLength`, `epics.md`/`EXPERIENCE.md` n'imposent aucune limite de caractères sur le résumé de fin, cf. Hors scope).

**`apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts`+`.html`** (lu intégralement, état post-8.3) — le bloc description (`descriptionDraft`, `submitDescription()`, textarea + bouton « Enregistrer ») est le modèle exact à répliquer pour le résumé de fin, à une différence près : la section description est masquée par `!isReadOnly()` (visible seulement si `status !== 'PASSE'`), alors que la section résumé de fin doit être visible **seulement si** `status === 'PASSE'` — condition inverse, pas de réutilisation de `isReadOnly()` pour cette nouvelle section.

**`apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html`** (lu intégralement) — affiche déjà `resumeFin` en lecture seule (`@if (isPasse())`), **aucune modification nécessaire** pour cette story (AC6) ; sert de référence pour le texte de repli déjà choisi (« Aucun résumé pour l'instant. ») — le texte incitatif MJ (Task 5, AC4) peut s'en inspirer sans le dupliquer littéralement (contexte différent : MJ peut agir, joueur ne fait que lire).

### Hors scope explicite de cette story (ne pas implémenter)

- Compte-rendu de séance (`Seance.compteRendu`) — Story 8.4 entièrement, champ distinct sur `Seance`, pas sur `Scenario`.
- Association du journal personnel des joueurs à la rétrospective (`Character.journalAutoAssociate`) — Story 8.6 entièrement.
- Annonces liées au scénario en pied de panneau (`EXPERIENCE.md` §4 point 4) — Epic 9, hors scope de l'Epic 8.
- Un composant `RetrospectivePanel` séparé regroupant résumé + comptes-rendus + journal + annonces — cf. `[ASSUMPTION]` ci-dessus, déviation assumée cohérente avec l'implémentation réelle des Stories 8.2-8.4.
- Limite de longueur/caractères sur `resumeFin` — non demandée par les AC, cohérent avec l'absence de limite similaire sur `description` (`update-scenario.dto.ts` limite `description` à 5000 caractères, mais rien dans `epics.md`/`EXPERIENCE.md` n'impose la même limite au résumé de fin ; le dev agent peut choisir d'aligner ou non, non structurant).
- Historique des versions d'un résumé de fin (qui a écrit quoi, quand) — non demandé, `Scenario.resumeFin` reste un simple champ texte remplacé à chaque écriture, même convention que `Seance.compteRendu` (Story 8.4).

### Project Structure Notes

- Aucune migration Prisma — `Scenario.resumeFin` existe déjà en base (migration `scenarios_seances_p4`), déjà exposé en lecture sur `ScenarioDto` (`toDto`/`toEnrichedDto`, scenarios.service.ts:689) et déjà affiché en lecture seule sur `scenario-read-dialog.html`, mais jamais écrit avant cette story.
- Nouveau fichier backend : `apps/api/src/scenarios/dto/set-resume-fin.dto.ts` uniquement.
- Aucun nouveau composant frontend — la section résumé de fin s'ajoute à `ScenarioEditor` (déjà existant), pas de nouveau fichier `.ts`/`.html`/`.scss` (cf. `[ASSUMPTION]` ci-dessus sur `RetrospectivePanel`).
- `ScenariosModule` reste inchangé (AD-1).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 8.5] — texte d'origine de la story et 4 ACs.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-1, #AD-3, #AD-9] — résumé de fin = champ de `Scenario` (pas d'entité indépendante), pas de verrouillage optimiste, écriture MJ-only.
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/EXPERIENCE.md#4, #5] — `RetrospectivePanel` (résumé en premier, avant comptes-rendus), état « Résumé de fin non rempli, scénario Passé → panneau incitatif ».
- [Source: _bmad-output/planning-artifacts/ux-designs/ux-jdr-master-20260711/DESIGN.md#RetrospectivePanel] — composition YAML de référence (resume-fin réutilise `FieldEditPencil`, comptes-rendus, journal-associe) — non littéralement suivie (pas de `FieldEditPencil`, pas de composant séparé), cf. `[ASSUMPTION]` sur la déviation déjà établie par les Stories 8.2-8.4.
- [Source: apps/api/prisma/schema.prisma] — `Scenario.resumeFin String?` déjà en place, aucune migration requise.
- [Source: apps/api/src/scenarios/scenarios.service.ts] — `update()` (garde de statut à inverser), `setCompteRendu()` (Story 8.4, modèle de style, en cours d'implémentation au moment de cette création), `toEnrichedDto`/`toDto` (resumeFin déjà mappé) lus intégralement.
- [Source: apps/api/src/scenarios/dto/update-scenario.dto.ts] — modèle `class-validator` à répliquer pour `set-resume-fin.dto.ts`.
- [Source: apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts, .html] — lus intégralement (état post-8.3) ; bloc description (textarea + bouton, pattern `descriptionDraft`/`submitDescription`) modèle exact à répliquer pour le résumé de fin, condition de visibilité inversée par rapport à `isReadOnly()`.
- [Source: apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html, .spec.ts] — affichage lecture seule déjà en place (AC6, aucune modification requise) ; test existant `scenario-read-dialog.spec.ts:96` (« PASSE sans résumé → message neutre, pas d'incitation MJ ») confirmant que le scope réel de cette story est l'écriture MJ, pas la lecture joueur.
- [Source: apps/web/src/app/core/scenarios/scenarios.service.ts] — convention `update()`/`close()`/`_changed.update` à répliquer pour `setResumeFin()`.
- [Source: 8-4-compte-rendu-seance.md] — intelligence de la story précédente : convention `[ASSUMPTION]`, chaîne vide acceptée par les DTO texte libre, absence de `ThemeToneService` dans ce module, `pnpm typecheck` à lancer après tout changement de signature (`ts-jest`/`isolatedModules`), pattern de revue adversariale à 3 couches post-implémentation. **Attention** : au moment de la création de cette story, 8.4 est encore `in-progress` — vérifier son état final avant de répliquer son pattern controller/DTO/frontend (cf. note dans Dev Notes ci-dessus).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (bmad-dev-story)

### Debug Log References

Aucun blocage — implémentation suivie exactement selon les Dev Notes (Story 8.4 confirmée `done` avant réplication du pattern `setCompteRendu`/DTO controller/service Angular). RED-GREEN systématique par task, aucun échec non résolu.

### Completion Notes List

- Task 1 : `SetResumeFinDto` ajouté dans `packages/shared/src/index.ts`, juste après `SetSeanceCapacityDto` (`SetCompteRenduDto` n'était pas contigu dans le fichier final — placement adapté sans impact fonctionnel).
- Task 2 : `setResumeFin()` implémentée dans `ScenariosService`, garde de statut `PASSE` inversée par rapport à `update()`. 8 tests unitaires (succès, chaîne vide, réécriture, 3× rejet par statut, 404, 403) — 120/120 tests `scenarios.service.spec.ts` verts.
- Task 3 : route `PATCH scenarios/:id/resume-fin` + `SetResumeFinDto` (`class-validator`, `@IsString()` sans `@IsNotEmpty()`) + test de routage — 23/23 tests `scenarios.controller.spec.ts` verts.
- Task 4 : `setResumeFin()` ajoutée au service Angular `core/scenarios/scenarios.service.ts`, pattern `update()`/`close()` répliqué à l'identique — 21/21 tests verts.
- Task 5 : section « Résumé de fin » ajoutée dans `ScenarioEditor` (`.ts`+`.html`), visible uniquement si `status === 'PASSE'`, texte incitatif si vide, bouton toujours visible (AC3/AC4) — 39/39 tests `scenario-editor.spec.ts` verts (6 nouveaux).
- Suite finale : 583/583 tests API, 625/625 tests web, `pnpm typecheck` (API) propre, aucune régression.
- Aucun item différé identifié pour cette story — scope entièrement couvert par les 6 ACs.

### File List

- `packages/shared/src/index.ts` (modifié — `SetResumeFinDto`)
- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `setResumeFin()`)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — `describe('setResumeFin()')`)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — route `resume-fin`)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — test de routage + mock)
- `apps/api/src/scenarios/dto/set-resume-fin.dto.ts` (nouveau)
- `apps/web/src/app/core/scenarios/scenarios.service.ts` (modifié — `setResumeFin()`)
- `apps/web/src/app/core/scenarios/scenarios.service.spec.ts` (modifié — test HttpTestingController)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.ts` (modifié — signaux + `submitResumeFin()`)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.html` (modifié — section résumé de fin)
- `apps/web/src/app/features/scenarios/scenario-editor/scenario-editor.spec.ts` (modifié — `describe('Résumé de fin (Story 8.5)')`)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.ts` (modifié — revue de code : `isMj`, `editResume()`)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.html` (modifié — revue de code : CTA résumé de fin)
- `apps/web/src/app/features/scenarios/scenario-read-dialog/scenario-read-dialog.spec.ts` (modifié — revue de code : 5 nouveaux tests CTA)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.ts` (modifié — revue de code : `isMj` transmis à `ScenarioReadDialogData`)
- `apps/web/src/app/features/scenarios/scenario-timeline/scenario-timeline.spec.ts` (modifié — revue de code : assertions `dialog.open` mises à jour)

## Change Log

- 2026-07-14 : Story créée via `bmad-create-story` (lecture directe de `scenarios.service.ts`/`.controller.ts`, `dto/update-scenario.dto.ts`, `scenario-editor.ts`/`.html`, `scenario-read-dialog.ts`/`.html`/`.spec.ts` (état post-Story 8.3, avec 8.4 encore `in-progress`), `schema.prisma`, `packages/shared/src/index.ts`, `ARCHITECTURE-SPINE.md` AD-1/AD-3/AD-9, `EXPERIENCE.md`/`DESIGN.md` sur `RetrospectivePanel`, intelligence Story 8.4 — `Scenario.resumeFin` existe déjà en base et est déjà exposé en lecture sur `ScenarioDto`/`scenario-read-dialog.html`, mais aucun code service/controller/frontend ne l'écrit avant cette story. Décision : garde de statut `PASSE` obligatoire pour écrire (symétrique et complémentaire au blocage de `update()` une fois `PASSE`) ; pas de nouveau composant `RetrospectivePanel` (déviation assumée, cohérente avec l'absence de ce composant dans les Stories 8.2-8.4) ; section ajoutée directement à `ScenarioEditor` existant.
- 2026-07-14 : Implémentation complète (bmad-dev-story). État de la Story 8.4 vérifié `done` avant réplication de son pattern final (`setCompteRendu`/DTO/service Angular). 5 tasks, TDD red-green par task. 583/583 tests API + 625/625 tests web, `pnpm typecheck` propre, aucune régression. Status → `review`.
- 2026-07-14 : Revue de code (bmad-code-review, 3 couches adversariales — Blind Hunter, Edge Case Hunter, Acceptance Auditor). 1 patch appliqué (AC4 : navigation MJ→ScenarioEditor inexistante pour un scénario `PASSE`, corrigée via un CTA dans `ScenarioReadDialog` plutôt qu'une modification du routage `scenario-timeline.ts` — décision utilisateur), 7 items différés (voir `deferred-work.md`), 6 écartés (comportements déjà assumés explicitement par la story ou patterns préexistants non spécifiques à cette story). Suite finale : 630/630 tests web (+5), 583/583 tests API, aucune régression. Status → `done`.
