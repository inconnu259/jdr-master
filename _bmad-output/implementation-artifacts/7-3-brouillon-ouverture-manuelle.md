---
baseline_commit: 2e0e273a97dc26c9d3edb51784705ab770eedd0d
---

# Story 7.3: Brouillon et ouverture manuelle

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a MJ,
I want préparer un scénario en `Brouillon`, invisible aux joueurs, et l'ouvrir quand je le décide,
so that je peux préparer un scénario à l'avance, y compris quand son ouverture dépend de l'issue d'un autre.

## Acceptance Criteria

1. **Given** un scénario `status: BROUILLON` **When** un joueur (non-MJ) consulte n'importe quelle vue joueur (timeline, annonces, recherche) **Then** ce scénario n'apparaît jamais — filtré systématiquement de toute vue joueur.
2. **Given** je suis MJ d'une Partie **When** je consulte ma vue MJ des Brouillons **Then** je vois tous les scénarios `BROUILLON` de ma Partie, avec les actions « + Nouveau scénario » et « Ouvrir aux joueurs ».
3. **Given** un scénario `status: BROUILLON` **When** le MJ clique « Ouvrir aux joueurs » **Then** son statut passe à `A_VENIR` — action manuelle et explicite uniquement, jamais déclenchée automatiquement par la clôture d'un autre scénario.
4. **Given** un scénario dont le statut n'est plus `BROUILLON` (`A_VENIR`/`COURANT`/`PASSE`) **When** une tentative d'ouverture ou de re-passage à `BROUILLON` est faite **Then** la requête est rejetée (transition de statut invalide).

*(Source: epics.md Story 7.3 — ACs reproduites verbatim, aucune reformulation.)*

**AC1 — pas de tâche backend dans cette story.** Aucune vue joueur (timeline, annonces, recherche) n'existe encore côté API — ce sont des surfaces de la Story 7.4. Par construction (AD-6, déjà appliqué dans les Stories 7.1/7.2), **le backend ne filtre jamais par statut** ; l'invisibilité d'un `BROUILLON` pour un joueur est et restera un rendu Angular conditionnel, à implémenter en Story 7.4. Ne pas ajouter de filtrage serveur ici pour "anticiper" AC1 — ce serait une régression par rapport à AD-6, déjà signalé comme piège dans les Dev Notes des Stories 7.1/7.2.

**AC4 — le "re-passage à BROUILLON" est impossible par construction.** Cette story n'introduit qu'une seule transition (`BROUILLON → A_VENIR`, Task 1/3) ; aucun endpoint ne permet de repasser un scénario à `BROUILLON` depuis un autre statut — l'AC est donc satisfaite par l'absence même d'un tel mécanisme, pas par une vérification explicite dédiée à ce cas. Seule la vérification "le scénario est bien `BROUILLON` avant ouverture" (Task 1) est un code réel à écrire.

## Tasks / Subtasks

- [x] **Task 1 — `ScenariosService` : lister les Brouillons et ouvrir un scénario** (AC2, AC3, AC4)
  - [x] `listDrafts(partieId: string, mjId: string): Promise<ScenarioDto[]>` : `await this.parties.getOwned(partieId, mjId)` (MJ seul — la vue Brouillons n'est accessible qu'au MJ, AC2), puis `prisma.scenario.findMany({ where: { partieId, status: 'BROUILLON' }, orderBy: { createdAt: 'desc' } })`, mappé via le `toDto()` déjà existant en bas de `scenarios.service.ts` (ne pas dupliquer ce mapper).
  - [x] `open(scenarioId: string, mjId: string): Promise<ScenarioDto>` — calqué sur `PollService.close()` (`apps/api/src/poll/poll.service.ts`, pattern fetch → 404 → ownership → vérif transition → update) :
    1. `prisma.scenario.findUnique({ where: { id: scenarioId } })` → `NotFoundException('Scénario introuvable')` si absent.
    2. `await this.parties.getOwned(scenario.partieId, mjId)` (403 si pas MJ).
    3. Si `scenario.status !== 'BROUILLON'` → `BadRequestException` (AC4 — message explicite, ex. `"Seul un scénario Brouillon peut être ouvert aux joueurs"`).
    4. `prisma.scenario.update({ where: { id: scenarioId }, data: { status: 'A_VENIR' } })`.
    5. Retourne via `toDto()`.

- [x] **Task 2 — Endpoints contrôleur** (AC2, AC3, AC4)
  - [x] `GET parties/:id/scenarios/drafts` → `ScenariosController.listDrafts`, `@Param('id', ParseUUIDPipe) partieId`, `@CurrentUser() user`. `[ASSUMPTION]` segment de route `drafts` en anglais — toutes les routes existantes du contrôleur (et des 15 autres contrôleurs de l'API) utilisent des segments anglais (`login`, `forgot-password`, `level-up`, `choose`...) ; jamais de segment français, alors que les clés de microcopy `sessions.*` (UX) sont en français — ne pas confondre les deux registres.
  - [x] `PATCH scenarios/:id/open` → `ScenariosController.open`, `@Param('id', ParseUUIDPipe) scenarioId`, `@CurrentUser() user`. Aucun body — pure transition d'état, pas de payload. Verbe `PATCH` choisi (pas `DELETE` comme `PollController.close()`) car on modifie une ressource existante plutôt que de la "fermer" définitivement.
  - [x] Aucun nouveau DTO `class-validator` nécessaire — ni l'un ni l'autre endpoint n'accepte de body.

- [x] **Task 3 — Tests** (AC2, AC3, AC4)
  - [x] `scenarios.service.spec.ts` (étendre) : ajouter `findMany: jest.fn()` à `makePrisma().scenario` (absent actuellement, nécessaire pour `listDrafts`).
    - `listDrafts` : retourne uniquement les scénarios `BROUILLON` de la Partie (mock `findMany`, vérifier `where: { partieId, status: 'BROUILLON' }`) ; non-MJ → 403 propagé par `getOwned`, `findMany` jamais appelé.
    - `open` : transition réussie `BROUILLON → A_VENIR` (vérifier `prisma.scenario.update` appelé avec `data: { status: 'A_VENIR' }`) ; scénario `A_VENIR`/`COURANT`/`PASSE` → `BadRequestException`, `update` jamais appelé (AC4, un test par statut ou un `it.each`) ; scénario introuvable → `NotFoundException` ; non-MJ → 403 propagé par `getOwned`, `update` jamais appelé.
  - [x] `scenarios.controller.spec.ts` (étendre) : ajouter `listDrafts: jest.fn()` et `open: jest.fn()` à `makeScenariosService()` ; tests de routage (`partieId`/`user.id` → `listDrafts`, `scenarioId`/`user.id` → `open`).
  - [x] Lancer `docker compose exec api pnpm test` pour valider l'ensemble de la suite API (pas de régression).

## Dev Notes

### Architecture — décisions contraignantes pour cette story

- **AD-1** : `ScenariosModule` reste propriétaire exclusif — les deux nouvelles méthodes vivent dans le `ScenariosService`/`ScenariosController` existants, pas de nouveau module.
- **AD-3** : `Scenario` n'a pas de verrouillage optimiste (`updatedAt` inexistant sur ce modèle) — `open()` fait un `prisma.scenario.update()` simple, sans comparaison de version. Cohérent avec `update()` (Story 7.1) qui fait déjà de même.
- **AD-6 (rappel critique)** : le filtrage anti-spoil est **exclusivement frontend** — ne jamais ajouter de logique de filtrage par statut dans `listDrafts`/`open` au-delà de ce que les ACs demandent explicitement (AC2 filtre par `status: 'BROUILLON'` parce que c'est **la vue MJ des Brouillons elle-même**, pas un filtrage anti-spoil — le MJ voit toujours tout, cf. AD-6 "le MJ voit toujours le contenu complet quel que soit le statut").
- **AD-7** : rappel — l'ouverture (`BROUILLON→A_VENIR`) reste une action MJ explicite, jamais automatique (déjà respecté par construction : `PartiesService.create()` crée un `Scenario` `BROUILLON` pour un `ONE_SHOT`, mais ne l'ouvre jamais).
- **AD-9** : écriture (lister les brouillons, ouvrir) = MJ seul (`getOwned`) — aucune action joueur dans cette story, donc pas de `getViewable` à utiliser ici.
- Pas de nouveau champ Prisma ni de migration : `Scenario.status` existe déjà (enum `ScenarioStatus`, Story 7.1). Pas de champ `openedAt` — aucune AC ne demande de tracer la date d'ouverture, ne pas en ajouter par anticipation.

### Code existant à répliquer (lu intégralement avant d'écrire le code)

**Pattern de transition d'état à suivre — `apps/api/src/poll/poll.service.ts`, méthode `close()`** (le plus proche analogue : ownership → fetch → vérif état → update, aucun payload) :
```ts
async close(partieId: string, pollId: string, userId: string): Promise<void> {
  await this.parties.getOwned(partieId, userId);
  const poll = await this.prisma.sessionPoll.findUnique({ where: { id: pollId } });
  if (!poll || poll.partieId !== partieId)
    throw new NotFoundException('Poll introuvable');
  if (poll.status !== 'OPEN')
    throw new BadRequestException('Le poll est déjà fermé');
  await this.prisma.sessionPoll.update({
    where: { id: pollId },
    data: { status: 'CLOSED' },
  });
}
```
Pattern de contrôleur associé (`apps/api/src/poll/poll.controller.ts`) — action sans payload en `@Delete`, mais Story 7.3 utilise `@Patch` (on modifie une ressource existante, pas une fermeture définitive) :
```ts
@Delete(':pollId')
close(
  @Param('id', ParseUUIDPipe) partieId: string,
  @Param('pollId', ParseUUIDPipe) pollId: string,
  @CurrentUser() user: AuthUser,
) {
  return this.poll.close(partieId, pollId, user.id);
}
```

**`apps/api/src/scenarios/scenarios.service.ts` — état actuel complet (Story 7.1 + 7.2 + revues), à étendre sans dupliquer** :
```ts
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { isUUID } from 'class-validator';
import type { ScenarioDocumentDto, ScenarioDto } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { CreateScenarioDto } from './dto/create-scenario.dto';
import { UpdateScenarioDto } from './dto/update-scenario.dto';
import { detectDocumentMime } from './document-mime.util';
import {
  deleteDocumentFile,
  readDocumentFile,
  writeDocumentFile,
} from './document-storage.util';

@Injectable()
export class ScenariosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
  ) {}

  async create(partieId: string, mjId: string, dto: CreateScenarioDto): Promise<ScenarioDto> {
    const partie = await this.parties.getOwned(partieId, mjId);
    if (partie.kind === 'ONE_SHOT') {
      throw new BadRequestException('Une Partie de type ONE_SHOT ne peut pas avoir plusieurs scénarios — son scénario unique est créé automatiquement');
    }
    const scenario = await this.prisma.scenario.create({
      data: { partieId, title: dto.title, description: dto.description ?? null, dureeHeures: dto.dureeHeures ?? null, dureeSeances: dto.dureeSeances ?? null, status: 'BROUILLON' },
    });
    return toDto(scenario);
  }

  async update(scenarioId: string, mjId: string, dto: UpdateScenarioDto): Promise<ScenarioDto> {
    const scenario = await this.prisma.scenario.findUnique({ where: { id: scenarioId } });
    if (!scenario) throw new NotFoundException('Scénario introuvable');
    await this.parties.getOwned(scenario.partieId, mjId);
    if (scenario.status === 'PASSE') {
      throw new BadRequestException('Un scénario clôturé ne peut plus être modifié via cet endpoint — seule l’édition du résumé de fin (Epic 8) reste possible, via un mécanisme dédié');
    }
    const updated = await this.prisma.scenario.update({
      where: { id: scenarioId },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.dureeHeures !== undefined && { dureeHeures: dto.dureeHeures }),
        ...(dto.dureeSeances !== undefined && { dureeSeances: dto.dureeSeances }),
      },
    });
    return toDto(updated);
  }

  // uploadDocument(), listDocuments(), listLibraryDocuments(), getDocumentFile() — Story 7.2, inchangées.
  // Task 1 ajoute ici : listDrafts(), open()
}

function toDocumentDto(document: any): ScenarioDocumentDto { /* ... */ }

function toDto(scenario: any): ScenarioDto {
  return {
    id: scenario.id, partieId: scenario.partieId, title: scenario.title,
    description: scenario.description, status: scenario.status,
    dureeHeures: scenario.dureeHeures, dureeSeances: scenario.dureeSeances,
    resumeFin: scenario.resumeFin, createdAt: scenario.createdAt.toISOString(),
    closedAt: scenario.closedAt ? scenario.closedAt.toISOString() : null,
  };
}
```

**`apps/api/src/scenarios/scenarios.controller.ts` — état actuel (à étendre)** : `@Controller()` vide, chaque route déclare son chemin complet inline (pas de préfixe de classe). Routes actuelles : `POST parties/:id/scenarios`, `PATCH scenarios/:id`, `POST parties/:id/documents`, `GET scenarios/:id/documents`, `GET parties/:id/documents`, `GET documents/:id`. Aucune route `GET parties/:id/scenarios` (liste) ni `.../open` n'existe encore — les deux sont nouvelles pour cette story. Garde globale `@UseGuards(AuthenticatedGuard)` sur la classe, `@CurrentUser() user: AuthUser` pour l'utilisateur courant — mêmes imports déjà en place (`ParseUUIDPipe`, `Param`, `Patch`, `Get`, `CurrentUser`), aucun nouvel import requis pour cette story.

**`apps/api/src/parties/parties.service.ts` — `getOwned` (inchangé, réutiliser tel quel)** :
```ts
async getOwned(id: string, userId: string) {
  const partie = await this.prisma.partie.findUnique({ where: { id } });
  if (!partie) throw new NotFoundException('Partie introuvable');
  if (partie.mjId !== userId) throw new ForbiddenException();
  return partie;
}
```

### Tests — conventions à suivre exactement

`makePrisma()` dans `scenarios.service.spec.ts` ne déclare actuellement que `create`/`findUnique`/`update` sur `prisma.scenario` — **ajouter `findMany: jest.fn()`** avant d'écrire les tests de `listDrafts`. `makeParties()` expose déjà `getOwned`/`getViewable`, rien à changer côté mock `PartiesService`. `makeScenariosService()` dans `scenarios.controller.spec.ts` doit gagner `listDrafts: jest.fn()` et `open: jest.fn()`. Style : descriptions de test en français, `expect(prisma.scenario.update).not.toHaveBeenCalled()` pour prouver l'absence d'écriture sur un chemin de rejet — mêmes conventions que Stories 7.1/7.2.

### Hors scope explicite de cette story (ne pas implémenter)

- Aucune vue joueur (timeline, recherche, annonces) — Story 7.4, ni aucun filtrage serveur par statut au-delà de la vue Brouillons MJ-only (AC2).
- Aucune transition `A_VENIR → COURANT` (Story 7.5, avec verrou `SELECT ... FOR UPDATE` pour la contrainte "un seul Courant en linéaire", AD-10) — `open()` de cette story s'arrête à `A_VENIR`.
- Aucun champ de traçabilité de la date d'ouverture (`openedAt`) — non demandé par les ACs.
- Aucune migration Prisma — `ScenarioStatus`/`Scenario.status` existent déjà.

### Project Structure Notes

- Aucun nouveau fichier — extension de `scenarios.service.ts`, `scenarios.controller.ts`, et de leurs specs respectifs. Cohérent avec le fait que `ScenariosModule` reste le seul propriétaire (AD-1).

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 7.3: Brouillon et ouverture manuelle] — ACs verbatim.
- [Source: _bmad-output/planning-artifacts/prds/prd-jdr-master-20260711/prd.md#FR-5, FR-7] — règles métier Brouillon/ouverture.
- [Source: _bmad-output/planning-artifacts/architecture/architecture-jdr-master-20260712/ARCHITECTURE-SPINE.md#AD-1, AD-3, AD-6, AD-7, AD-9] — invariants contraignants.
- [Source: _bmad-output/implementation-artifacts/7-1-creer-editer-scenario.md, 7-2-documents-scenario-bibliotheque.md] — état antérieur du module, patterns déjà établis (`toDto`, ownership-first, `BadRequestException` pour transition invalide).
- [Source: apps/api/src/poll/poll.service.ts, poll.controller.ts] — pattern de transition d'état (`close()`) répliqué pour `open()`.
- [Source: apps/api/src/scenarios/scenarios.service.ts, scenarios.controller.ts] — état actuel à étendre.

### Review Findings

Revue adversariale parallèle (Blind Hunter, Edge Case Hunter, Acceptance Auditor) — 10 findings uniques après dédoublonnage, 0 décision nécessitant l'utilisateur, 1 patch, 2 différés, 7 rejetés comme bruit/déjà couverts.

- [x] [Review][Patch] Test `listDrafts` ne vérifie pas `orderBy` [apps/api/src/scenarios/scenarios.service.spec.ts] — l'assertion utilise `expect.objectContaining({ where: {...} })`, qui passe même si `orderBy: { createdAt: 'desc' }` est supprimé ou modifié ; ajouter l'assertion sur `orderBy` pour couvrir réellement le tri documenté par l'AC2.
- [x] [Review][Defer] Race TOCTOU sur la transition `BROUILLON → A_VENIR` dans `open()` [apps/api/src/scenarios/scenarios.service.ts] — déferré : deux appels concurrents peuvent tous deux passer la vérification en mémoire et écrire, mais l'issue est identique (statut `A_VENIR` dans les deux cas, aucun effet de bord dupliqué contrairement à une capacité comptée comme l'inscription épisodique, Story 8.3/AD-5) — risque réel mais sans conséquence dans ce cas précis (action MJ seul, pas un scénario de concurrence à fort enjeu). À corriger avec un `updateMany({ where: { id, status: 'BROUILLON' } })` si un jour un vrai double-clic concurrent pose problème en usage réel.
- [x] [Review][Defer] Message d'erreur générique ne distinguant pas `A_VENIR`/`COURANT`/`PASSE` [apps/api/src/scenarios/scenarios.service.ts, open()] — déferré : cohérent avec le pattern déjà établi ailleurs (ex. rejet `PASSE` dans `update()`), aucune AC ne demande cette granularité.

**Rejetés comme bruit ou déjà couverts (7)** : ordre 404-avant-403 dans `open()` (identique au pattern déjà établi et déjà accepté deux fois dans les revues des Stories 7.1/7.2 pour `update()`/`uploadDocument()`) ; absence de pagination sur `listDrafts` (aucun endpoint de liste du code base ne pagine, convention déjà établie) ; import `BadRequestException` "non vérifiable depuis le diff" (déjà importé, faux positif du Blind Hunter qui n'a que le diff) ; absence de `@UseGuards` visible sur les nouvelles routes (déjà couvert par la garde de classe `@UseGuards(AuthenticatedGuard)` sur `ScenariosController`) ; chaîne d'erreur française codée en dur sans code machine (convention déjà établie dans tout le fichier) ; absence de test de concurrence (lié à la race déjà différée ci-dessus) ; absence d'annotations Swagger/OpenAPI (aucun contrôleur du projet n'en utilise).

## Dev Agent Record

### Agent Model Used

Claude Sonnet 5 (claude-sonnet-5)

### Debug Log References

- Aucune migration Prisma nécessaire, aucun nouveau DTO — conforme aux Dev Notes.
- Pattern `open()` calqué fidèlement sur `PollService.close()` (fetch → 404 → `getOwned` → vérif état → `BadRequestException` si transition invalide → update).
- Suite complète API : 29 suites / 483 tests, tous passants (aucune régression).

### Completion Notes List

- `ScenariosService.listDrafts(partieId, mjId)` : liste les scénarios `BROUILLON` d'une Partie, MJ seul (`getOwned`), réutilise le `toDto()` existant.
- `ScenariosService.open(scenarioId, mjId)` : transition `BROUILLON → A_VENIR`, rejette (`BadRequestException`) toute tentative sur un scénario dont le statut n'est pas `BROUILLON` (AC4, couvert pour les 3 statuts `A_VENIR`/`COURANT`/`PASSE` via `it.each`).
- 2 nouveaux endpoints : `GET parties/:id/scenarios/drafts`, `PATCH scenarios/:id/open` — noms de route en anglais, cohérents avec le reste de l'API (corrigé lors de la revue de création de story, qui avait initialement proposé des segments français `/brouillons`/`/ouvrir`).
- AC1 : aucune tâche backend — confirmé dans la story que l'anti-spoil reste un rendu frontend (AD-6), à implémenter en Story 7.4.
- AC4 (repassage à `BROUILLON`) : satisfait par construction, aucun endpoint ne permet cette transition (`UpdateScenarioDto` n'expose pas de champ `status`).
- 4 acceptance criteria couvertes : AC1 (N/A backend, documenté), AC2 (liste Brouillons MJ), AC3 (ouverture manuelle), AC4 (transitions invalides rejetées).
- 483/483 tests passent (suite API complète), aucune régression.
- Revue de code (Blind Hunter + Edge Case Hunter + Acceptance Auditor) — 0 violation d'AC, 1 patch appliqué (test `listDrafts` vérifie maintenant `orderBy`), 2 items différés documentés dans `deferred-work.md` (race TOCTOU sur `open()`, sans effet de bord réel ; message d'erreur générique). 483/483 tests passants après correctif.

### File List

- `apps/api/src/scenarios/scenarios.service.ts` (modifié — `listDrafts`, `open`)
- `apps/api/src/scenarios/scenarios.service.spec.ts` (modifié — tests des 2 nouvelles méthodes, `findMany` ajouté au mock Prisma, assertion `orderBy` ajoutée en revue)
- `apps/api/src/scenarios/scenarios.controller.ts` (modifié — 2 nouveaux endpoints)
- `apps/api/src/scenarios/scenarios.controller.spec.ts` (modifié — tests de routage)

## Change Log

- 2026-07-12 : Implémentation complète de la Story 7.3 (vue MJ des Brouillons, ouverture manuelle BROUILLON→A_VENIR, 4 ACs couvertes, 483/483 tests passants).
- 2026-07-12 : Revue de code — 1 patch appliqué (assertion `orderBy` manquante), 483/483 tests passants après correctif.
