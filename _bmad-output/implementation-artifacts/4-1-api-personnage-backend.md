---
story: 4.1
title: "API Personnage — Backend complet"
epic: 4
key: 4-1-api-personnage-backend
status: done
baseline_commit: "32926ed"
---

# Story 4.1 : API Personnage — Backend complet

Status: done

## Story

As a developer,
I want the API to expose a GameSystemRegistry, the Ryuutama plugin, and Character CRUD,
So that character creation and consultation can be built on a stable, schema-driven backend.

**Architecture décision clé** : `computeDerived()` et `validate()` sont des **fonctions pures** extraites dans `packages/game-rules` (nouveau package workspace), importées à l'identique par `apps/api` (backend) et `apps/web` (frontend). Aucune duplication de formule entre client et serveur.

## Acceptance Criteria

**AC1 — Prisma migration `plugin_p3`**

Given le schéma Prisma n'a pas encore de modèles de game-system
When le développeur exécute `prisma migrate dev --name plugin_p3`
Then `GameSystem` (id, name, version), `ContentType` (id, gameSystemId, key, label), `ContentEntry` (id, contentTypeId, scope, key, data Json) et `Character` (id, userId, partieId, gameSystemId, sheetData Json, derived Json, portraitUrl String?, portraitCropData Json?, createdAt, updatedAt) sont créés
And l'enum `ContentScope` (BASE, MJ, PARTIE) est ajouté
And `@@unique([gameSystemId, key])` existe sur `ContentType`, `@@unique([contentTypeId, key])` sur `ContentEntry`
And `@@index([partieId])` et `@@index([userId])` existent sur `Character`
And `@@unique([userId, partieId, gameSystemId])` existe sur `Character`

**AC2 — Seed Ryuutama au démarrage**

Given les fichiers JSON de seed existent dans `apps/api/game-systems/ryuutama/data/` (gitignoré, NFR4)
When l'app démarre
Then un `GameSystem` `{ id: "ryuutama", name: "Ryuutama", version: "1.0.0" }` est upserted
And les `ContentEntry` scope `BASE` pour les 7 classes (avec leurs 3 talents chacune), les 3 types, le pattern Polyvalent ({8,4,6,6}), et les 5 catégories d'armes favorites sont chargées en upsert (idempotent)
And si les fichiers JSON sont absents, le démarrage échoue avec un message d'erreur explicite pointant vers le README du dossier de seed

**AC3 — GET /game-systems**

Given un utilisateur authentifié
When il appelle `GET /game-systems`
Then la réponse 200 liste les systèmes installés : `[{ id: "ryuutama", name: "Ryuutama", version: "1.0.0" }]`

**AC4 — GET /game-systems/:id/schema**

Given un utilisateur authentifié
When il appelle `GET /game-systems/ryuutama/schema`
Then la réponse 200 contient `sheetSchema` et `creationSteps` couvrant les 8 étapes de création dans l'ordre (classe, type, attributs, arme favorite, objet fétiche, équipement, narratif, portrait)

**AC5 — POST /parties/:id/characters (création valide)**

Given un membre authentifié d'une partie (joueur ou MJ), sans personnage Ryuutama existant sur cette partie
When il appelle `POST /parties/:id/characters` avec `{ gameSystemId: "ryuutama", sheetData: {...valid...} }`
Then `validate(data, "strict")` importée de `packages/game-rules` passe
And `computeDerived(data)` importée de `packages/game-rules` calcule PV=VIG×2, PE=ESP×2, Condition=VIG+ESP, Initiative=AGI+INT, Encombrement=VIG+3
And un `Character` est créé en base avec `derived` peuplé
And la réponse 201 retourne le `CharacterDto` complet

**AC6 — POST /parties/:id/characters (données invalides)**

Given un `sheetData` invalide (0 ou 2+ classes, attributs non conformes au pattern Polyvalent, classe Artisan sans `specialtyTypeId`, arme hors des 5 catégories)
When `POST /parties/:id/characters` est appelé
Then la réponse est 400 avec la liste des erreurs de validation contextualisées
And aucun `Character` n'est créé en base

**AC7 — POST /parties/:id/characters (personnage déjà existant)**

Given un joueur a déjà un personnage Ryuutama sur cette partie
When il appelle à nouveau `POST /parties/:id/characters` (double-soumission, double onglet, etc.)
Then la contrainte `@@unique([userId, partieId, gameSystemId])` est capturée (Prisma P2002)
And la réponse est 409 avec le message "Vous avez déjà un personnage sur cette partie" (pas une erreur 500 générique)

**AC8 — GET /characters/:id (propriétaire ou MJ uniquement)**

Given un `Character` existant
When son propriétaire (userId) appelle `GET /characters/:id`
Then la réponse 200 retourne le `CharacterDto` complet avec `derived` inclus

Given le MJ de la partie associée au personnage
When il appelle `GET /characters/:id`
Then la réponse 200 retourne le `CharacterDto`

Given un utilisateur qui n'est ni le propriétaire ni le MJ de la partie
When il appelle `GET /characters/:id`
Then la réponse est 403 Forbidden

**AC9 — GET /parties/:id/characters (vue membre vs MJ)**

Given un joueur membre de la partie (non-MJ)
When il appelle `GET /parties/:id/characters`
Then il reçoit uniquement ses propres personnages sur cette partie (filtre `userId = req.user.id`)

Given le MJ de la partie
When il appelle `GET /parties/:id/characters`
Then il reçoit tous les personnages créés par tous les joueurs sur cette partie

**AC10 — Tests unitaires packages/game-rules : computeDerived**

Given `computeDerived()` est testé dans `packages/game-rules/src/__tests__/compute-derived.spec.ts`
When la suite de tests s'exécute
Then les 5 cas suivants passent :
- VIG=8 → PV=16
- ESP=6 → PE=12
- VIG=8, ESP=6 → Condition=14
- AGI=4, INT=6 → Initiative=10
- VIG=8 → Encombrement=11

**AC11 — Tests unitaires packages/game-rules : validate**

Given `validate(data, "strict")` est testé dans `packages/game-rules/src/__tests__/validate.spec.ts`
When la suite de tests s'exécute
Then les 5 règles strictes (addendum.md §9) sont couvertes :
1. sheetData avec 0 classe → `valid: false`, errors[0].field = "classId"
2. sheetData avec 2 classes → `valid: false`
3. Attributs ne correspondant pas au pattern Polyvalent → `valid: false`, errors[0].field = "attributes"
4. `weaponCategoryId` invalide (ex. "mains-nues") → `valid: false`, errors[0].field = "weaponCategoryId"
5. `classId: "artisan"` sans `specialtyTypeId` → `valid: false`, errors[0].field = "specialtyTypeId"
And un `sheetData` entièrement valide → `valid: true`, errors = []

**AC12 — Test d'intégration API : CharacterService utilise packages/game-rules**

Given `CharacterService` testé avec Jest dans `character.service.spec.ts`
When la suite de tests s'exécute
Then un test confirme que `CharacterService.create()` appelle `validate` et `computeDerived` importées de `@master-jdr/game-rules` (spy sur le module ou vérification via import)

## Tasks

- [x] Task 1 — Créer `packages/game-rules` (setup workspace)
- [x] Task 2 — Implémenter `computeDerived()` et `validate()` dans `packages/game-rules`
- [x] Task 3 — Tests unitaires dans `packages/game-rules`
- [x] Task 4 — Ajouter les shared types Palier P3 dans `packages/shared/src/index.ts`
- [x] Task 5 — Migration Prisma `plugin_p3` (modèles + enum + relations inverses)
- [x] Task 6 — Infrastructure seed (dossier gitignoré, README, format JSON documenté)
- [x] Task 7 — Créer `GameSystemModule` (service avec seed + controller)
- [x] Task 8 — Créer `CharacterModule` (service + 2 controllers)
- [x] Task 9 — Tests `character.service.spec.ts`
- [x] Task 10 — Enregistrer les modules dans `AppModule`

### Review Findings

- [x] [Review][Patch] `seedRyuutama()` : `JSON.parse(raw)` hors du `try/catch` autour de `readFile` → un fichier seed JSON malformé plante le bootstrap avec une `SyntaxError` brute au lieu du message explicite pointant vers le README [apps/api/src/game-systems/game-system.service.ts]
- [x] [Review][Patch] `CharacterService.create()` n'ampute pas les `gameSystemId` non supportés avant d'appliquer `validate`/`computeDerived` spécifiques à Ryuutama — un `gameSystemId` différent de `"ryuutama"` se voit quand même appliquer les règles Ryuutama [apps/api/src/characters/character.service.ts]
- [x] [Review][Patch] `GameSystemService.getSchema(id)` retourne 200 avec un schéma vide pour un `id` inconnu au lieu d'un 404 explicite, masquant les erreurs client (typo, système désinstallé) [apps/api/src/game-systems/game-system.service.ts]
- [x] [Review][Patch] `CreateCharacterDto.sheetData` n'a que `@IsNotEmpty()` (pas de `@IsObject()`) — un payload non-objet (string/array/number) passe la validation DTO et provoque un plantage non contrôlé dans `validate()` au lieu d'un 400 propre [apps/api/src/characters/dto/create-character.dto.ts]
- [x] [Review][Defer] `validate()` dans `packages/game-rules` code en dur ses propres listes (`VALID_CLASSES`, `VALID_TYPES`, `VALID_WEAPONS`, `POLYVALENT_PATTERN`), déconnectées des `ContentEntry` seedées en base par `GameSystemService` — deux sources de vérité qui peuvent diverger silencieusement — deferred, pre-existing design tradeoff explicitement spécifié dans les Dev Notes de la story [packages/game-rules/src/ryuutama/validate.ts]
- [x] [Review][Defer] `seedRyuutama()` relit et ré-upsert l'intégralité du contenu à chaque démarrage de l'app, sans court-circuit basé sur `GameSystem.version`, et sans verrou contre des instances concurrentes qui démarreraient en même temps — deferred, non bloquant à l'échelle actuelle du projet [apps/api/src/game-systems/game-system.service.ts]

### Review Findings (re-review du 2026-07-04, après application des patches ci-dessus)

- [x] [Review][Patch] `SUPPORTED_GAME_SYSTEMS` dans `character.service.ts` duplique `RYUUTAMA_ID` de `game-system.service.ts` — deux sources de vérité qui peuvent diverger silencieusement si un système est ajouté d'un côté sans l'autre [apps/api/src/characters/character.service.ts, apps/api/src/game-systems/game-system.service.ts]
- [x] [Review][Patch] Le `catch` de `seedRyuutama()` avale l'erreur d'origine (fichier manquant, JSON malformé, permission refusée sont tous confondus dans le même message "introuvable") sans logger la cause réelle, ce qui gêne le diagnostic [apps/api/src/game-systems/game-system.service.ts]
- [x] [Review][Patch] Aucun test ne couvre la garde `SUPPORTED_GAME_SYSTEMS` ajoutée lors de la revue précédente (gameSystemId non supporté → BadRequestException) [apps/api/src/characters/character.service.spec.ts]
- [x] [Review][Defer] `GameSystemService.getSchema(id)` vérifie l'id contre la constante `RYUUTAMA_ID` codée en dur plutôt que contre la base (incohérent avec `findAll()` qui interroge la DB) — deferred, refactor plus large nécessaire (signature async), hors scope de cette story [apps/api/src/game-systems/game-system.service.ts]
- [x] [Review][Defer] Aucune validation de forme après `JSON.parse` des fichiers seed (tableau attendu, `entry.key` requis) — deferred, fichiers seed rédigés localement par l'équipe (non adversariaux), risque faible [apps/api/src/game-systems/game-system.service.ts]
- [x] [Review][Defer] `apps/web/tsconfig.json` n'a pas reçu le même correctif `allowImportingTsExtensions`/`rewriteRelativeImportExtensions` qu'`apps/api` — dormant tant qu'aucun code frontend n'importe réellement `@master-jdr/game-rules` (prévu Story 4.2) — deferred, à vérifier lors de cette story future
- [x] [Review][Defer] `CreateCharacterDto.sheetData` avec `@IsObject()` accepte techniquement un tableau non-vide ou un objet vide (`{}`) — le filet de sécurité réel vient de `validate()` dans `packages/game-rules`, pas du DTO — deferred, un vrai fix nécessiterait un validateur custom, risque faible aujourd'hui (vérifié par l'Acceptance Auditor)
- [x] [Review][Dismiss — faux positif vérifié] Risque supposé que le build de production (`nest build` + `node dist/src/main.js`) ne résolve pas `@master-jdr/game-rules` (livré en `.ts` brut sans étape de build) et crashe en `ERR_UNKNOWN_FILE_EXTENSION`/`TS6059 rootDir` — **vérifié en direct** : le build compile sans erreur et `node dist/src/main.js` démarre l'application complète (seul un conflit de port avec le serveur dev déjà actif est apparu). Node 24 gère nativement la résolution `.ts`

## Dev Agent Record

### Completion Notes

- Package `@master-jdr/game-rules` créé (workspace pnpm) avec `computeDerived()` et `validate()` en fonctions pures, testées via Vitest (12 tests).
- Migration Prisma `plugin_p3` appliquée (`GameSystem`, `ContentType`, `ContentEntry`, `Character`, enum `ContentScope`) ; `pnpm prisma generate` exécuté.
- Seed Ryuutama vérifié en base après démarrage : 1 `GameSystem`, 4 `ContentType`, 16 `ContentEntry` (7 classes + 3 types + 1 pattern + 5 armes) — conforme à AC2.
- `GameSystemModule` et `CharacterModule` implémentés et enregistrés dans `AppModule`.
- Suite de tests Jest API : 116/116 passent (8 suites), incluant les 6 nouveaux tests `character.service.spec.ts`.
- 4 findings de la revue de code corrigés : `JSON.parse` protégé par le `try/catch` du seed, garde sur `gameSystemId` non supporté dans `CharacterService.create()`, `getSchema()` renvoie 404 pour un système inconnu, `@IsObject()` ajouté sur `CreateCharacterDto.sheetData`. 2 findings différés (voir `deferred-work.md`).
- **Problème résolu en cours de dev** : import relatifs `.ts` dans `packages/game-rules` (requis par `moduleResolution: nodenext` d'`apps/api` pour la résolution ESM à l'exécution) provoquaient `TS5097` côté `apps/api`. Correctif : ajout de `allowImportingTsExtensions` + `rewriteRelativeImportExtensions` dans `apps/api/tsconfig.json` (TS 5.7+), qui réécrit `.ts` → `.js` à l'émission tout en autorisant l'import `.ts` en source. Vérifié par redémarrage du conteneur `api` (bootstrap propre, 0 erreur).
- Vérification end-to-end manuelle (conteneurs Docker, utilisateur admin authentifié) : `GET /game-systems`, `GET /game-systems/ryuutama/schema`, `GET /game-systems/unknown/schema` (404), `POST /parties/:id/characters` (201 avec `derived` correct, 409 sur doublon, 400 sur données invalides, 400 sur `gameSystemId` non supporté), `GET /characters/:id`, `GET /parties/:id/characters` — tous conformes aux AC.
- **Re-revue de code (2026-07-04)** : 3 findings `patch` corrigés — extraction de `SUPPORTED_GAME_SYSTEMS`/`RYUUTAMA_ID` dans `apps/api/src/game-systems/supported-game-systems.ts` (source unique, importée par `character.service.ts` et `game-system.service.ts`) ; log de l'erreur d'origine (`Logger.error`) avant le message générique dans `seedRyuutama()` ; test ajouté pour la garde `gameSystemId` non supporté. 4 nouveaux findings différés (voir `deferred-work.md`). Un risque supposé sur le build de production (résolution `.ts` de `packages/game-rules` via `node dist/src/main.js`) a été vérifié en direct et écarté comme faux positif — build + démarrage réussis.
- Suite de tests finale : 117/117 Jest (API) + 12/12 Vitest (`game-rules`).

### Debug Log

- `ERR_MODULE_NOT_FOUND` au runtime sur `packages/game-rules/src/index.ts` → causé par les imports relatifs sans extension sous `moduleResolution: nodenext`. Résolu via imports `.ts` explicites + `allowImportingTsExtensions`/`rewriteRelativeImportExtensions` dans `apps/api/tsconfig.json`.
- Erreur Prisma `TS2322` sur les champs `Json` (`ContentEntry.data`) → résolue par cast `as Prisma.InputJsonValue`.

## File List

- `packages/game-rules/package.json` (nouveau)
- `packages/game-rules/tsconfig.json` (nouveau)
- `packages/game-rules/src/index.ts` (nouveau)
- `packages/game-rules/src/ryuutama/types.ts` (nouveau)
- `packages/game-rules/src/ryuutama/compute-derived.ts` (nouveau)
- `packages/game-rules/src/ryuutama/validate.ts` (nouveau)
- `packages/game-rules/src/__tests__/compute-derived.spec.ts` (nouveau)
- `packages/game-rules/src/__tests__/validate.spec.ts` (nouveau)
- `packages/shared/src/index.ts` (modifié — DTOs Palier P3)
- `apps/api/package.json` (modifié — dépendance `@master-jdr/game-rules`)
- `apps/api/tsconfig.json` (modifié — `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`)
- `apps/api/prisma/schema.prisma` (modifié — modèles Palier P3)
- `apps/api/prisma/migrations/20260703224655_plugin_p3/migration.sql` (nouveau)
- `apps/api/src/app.module.ts` (modifié — enregistrement `GameSystemModule`/`CharacterModule`)
- `apps/api/src/game-systems/game-system.module.ts` (nouveau)
- `apps/api/src/game-systems/game-system.service.ts` (nouveau)
- `apps/api/src/game-systems/game-system.controller.ts` (nouveau)
- `apps/api/src/game-systems/supported-game-systems.ts` (nouveau — source unique pour `RYUUTAMA_ID`/`SUPPORTED_GAME_SYSTEMS`)
- `apps/api/src/characters/character.module.ts` (nouveau)
- `apps/api/src/characters/character.service.ts` (nouveau)
- `apps/api/src/characters/character.service.spec.ts` (nouveau)
- `apps/api/src/characters/characters.controller.ts` (nouveau)
- `apps/api/src/characters/partie-characters.controller.ts` (nouveau)
- `apps/api/src/characters/dto/create-character.dto.ts` (nouveau)
- `apps/api/game-systems/ryuutama/README.md` (nouveau)
- `apps/web/package.json` (modifié — dépendance `@master-jdr/game-rules`, non utilisée avant la story 4.2)
- `.gitignore` (modifié — exclusion `apps/api/game-systems/ryuutama/data/`)

## Change Log

- 2026-07-04 : Implémentation complète de la story 4.1 (Tasks 1-10) : package `game-rules`, migration Prisma `plugin_p3`, seed Ryuutama, `GameSystemModule`, `CharacterModule`.
- 2026-07-04 : Revue de code — 4 findings `patch` corrigés (garde JSON.parse, garde gameSystemId non supporté, 404 sur schéma inconnu, `@IsObject()` sur sheetData), 2 findings `defer` documentés dans `deferred-work.md`.
- 2026-07-04 : Re-revue de code — 3 findings `patch` corrigés (source unique `SUPPORTED_GAME_SYSTEMS`, log de l'erreur d'origine dans `seedRyuutama()`, test de la garde gameSystemId), 4 findings `defer` documentés, 1 risque de build de production vérifié et écarté comme faux positif.

---

## Dev Notes

### Task 1 — Setup packages/game-rules

**Structure du package** :
```
packages/game-rules/
  package.json
  tsconfig.json
  src/
    ryuutama/
      types.ts
      compute-derived.ts
      validate.ts
    index.ts
    __tests__/
      compute-derived.spec.ts
      validate.spec.ts
```

**package.json** :
```json
{
  "name": "@master-jdr/game-rules",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^4.0.0",
    "typescript": "^5.7.3"
  }
}
```

**tsconfig.json** :
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**Enregistrer dans les apps** — ajouter dans `apps/api/package.json` et `apps/web/package.json` (en `dependencies`) :
```
"@master-jdr/game-rules": "workspace:*"
```

**Reconstruire Docker** après ajout de dépendance : `docker compose up --build`

### Task 2 — computeDerived() et validate()

**packages/game-rules/src/ryuutama/types.ts** :
```typescript
export interface RyuutamaSheetData {
  classId: string;
  specialtyTypeId?: string;   // obligatoire si classId === "artisan"
  typeId: string;
  attributes: { AGI: number; ESP: number; INT: number; VIG: number };
  weaponCategoryId: string;
  fetiqueObject?: string;
  equipment?: { individual: string[]; group: string[] };
  narrative?: {
    sex?: string; age?: string; physicalTraits?: string;
    homeTown?: string; motivation?: string; name?: string; personality?: string;
  };
}

export interface DerivedStats {
  PV: number;        // VIG × 2
  PE: number;        // ESP × 2
  Condition: number; // VIG + ESP
  Initiative: number; // AGI + INT
  Encombrement: number; // VIG + 3
}

export interface ValidationError { field: string; message: string }
export interface ValidationResult { valid: boolean; errors: ValidationError[] }
```

**packages/game-rules/src/ryuutama/compute-derived.ts** :
```typescript
import type { RyuutamaSheetData, DerivedStats } from './types';

export function computeDerived(data: RyuutamaSheetData): DerivedStats {
  const { AGI, ESP, INT, VIG } = data.attributes;
  return {
    PV: VIG * 2,
    PE: ESP * 2,
    Condition: VIG + ESP,
    Initiative: AGI + INT,
    Encombrement: VIG + 3,
  };
}
```

**packages/game-rules/src/ryuutama/validate.ts** — 5 règles strictes (addendum.md §9) :
```typescript
import type { RyuutamaSheetData, ValidationResult, ValidationError } from './types';

const VALID_CLASSES = ['artisan','chasseur','fermier','guerisseur','marchand','menestrel','noble'];
const VALID_TYPES = ['attaque','technique','magie'];
const VALID_WEAPONS = ['arc','epee-courte','epee-longue','hache','lance'];
const POLYVALENT_PATTERN = [4, 6, 6, 8]; // sorted

export function validate(data: RyuutamaSheetData, mode: 'strict' | 'mj'): ValidationResult {
  if (mode === 'mj') return { valid: true, errors: [] }; // no-op réservé à P4

  const errors: ValidationError[] = [];

  // Règle 1 : exactement 1 classe parmi les 7
  if (!data.classId || !VALID_CLASSES.includes(data.classId)) {
    errors.push({ field: 'classId', message: `Classe invalide. Classes acceptées : ${VALID_CLASSES.join(', ')}` });
  }

  // Règle 2 : exactement 1 type parmi les 3
  if (!data.typeId || !VALID_TYPES.includes(data.typeId)) {
    errors.push({ field: 'typeId', message: `Type invalide. Types acceptés : ${VALID_TYPES.join(', ')}` });
  }

  // Règle 3 : attributs conformes au pattern Polyvalent {4,6,6,8}
  const attrs = data.attributes;
  if (!attrs) {
    errors.push({ field: 'attributes', message: 'Les attributs sont requis' });
  } else {
    const values = [attrs.AGI, attrs.ESP, attrs.INT, attrs.VIG].sort((a, b) => a - b);
    const matches = values.length === 4 &&
      values.every((v, i) => v === POLYVALENT_PATTERN[i]);
    if (!matches) {
      errors.push({ field: 'attributes', message: 'Les attributs doivent correspondre au pattern Polyvalent {8,4,6,6}' });
    }
  }

  // Règle 4 : arme favorite parmi les 5 catégories
  if (!data.weaponCategoryId || !VALID_WEAPONS.includes(data.weaponCategoryId)) {
    errors.push({ field: 'weaponCategoryId', message: `Arme favorite invalide. Catégories acceptées : ${VALID_WEAPONS.join(', ')}` });
  }

  // Règle 5 : sous-choix Artisan obligatoire
  if (data.classId === 'artisan' && !data.specialtyTypeId?.trim()) {
    errors.push({ field: 'specialtyTypeId', message: "Le type d'objet de spécialité est obligatoire pour la classe Artisan" });
  }

  return { valid: errors.length === 0, errors };
}
```

**packages/game-rules/src/index.ts** :
```typescript
export { computeDerived } from './ryuutama/compute-derived';
export { validate } from './ryuutama/validate';
export type { RyuutamaSheetData, DerivedStats, ValidationResult, ValidationError } from './ryuutama/types';
```

### Task 3 — Tests packages/game-rules

Runner : **Vitest** (cohérent avec `apps/web`, et ESM-natif).

**src/__tests__/compute-derived.spec.ts** :
```typescript
import { describe, it, expect } from 'vitest';
import { computeDerived } from '../ryuutama/compute-derived';

describe('computeDerived', () => {
  const base = { classId: 'chasseur', typeId: 'attaque', weaponCategoryId: 'arc',
                  attributes: { AGI: 4, ESP: 6, INT: 6, VIG: 8 } };
  it('PV = VIG × 2', () => expect(computeDerived(base).PV).toBe(16));
  it('PE = ESP × 2', () => expect(computeDerived(base).PE).toBe(12));
  it('Condition = VIG + ESP', () => expect(computeDerived(base).Condition).toBe(14));
  it('Initiative = AGI + INT', () => expect(computeDerived(base).Initiative).toBe(10));
  it('Encombrement = VIG + 3', () => expect(computeDerived(base).Encombrement).toBe(11));
});
```

**src/__tests__/validate.spec.ts** : couvrir AC11 (5 règles strictes + cas valide).

### Task 4 — Shared types Palier P3

Ajouter dans `packages/shared/src/index.ts` **à la fin** (ne pas modifier les types existants) :

```typescript
// ─── Palier P3 : Moteur plugin & Personnages ─────────────────────────────────

/** Système de jeu enregistré dans le registre. */
export interface GameSystemDto {
  id: string;
  name: string;
  version: string;
}

/** Données génériques d'une fiche (structure validée applicativement par validate()). */
export type SheetData = Record<string, unknown>;

/** Stats dérivées d'un personnage. */
export interface DerivedStats {
  PV: number;
  PE: number;
  Condition: number;
  Initiative: number;
  Encombrement: number;
}

/** Fiche de personnage telle que renvoyée par l'API. */
export interface CharacterDto {
  id: string;
  userId: string;
  partieId: string;
  gameSystemId: string;
  sheetData: SheetData;
  derived: DerivedStats;
  portraitUrl: string | null;
  portraitCropData: unknown | null;
  createdAt: string;
  updatedAt: string;
}

/** Payload de création d'un personnage. */
export interface CreateCharacterDto {
  gameSystemId: string;
  sheetData: SheetData;
}

/** Réponse de GET /game-systems/:id/schema. */
export interface GameSystemSchemaDto {
  sheetSchema: unknown;
  creationSteps: unknown[];
}
```

### Task 5 — Migration Prisma plugin_p3

Ajouter dans `apps/api/prisma/schema.prisma` **après les modèles Palier 2** :

```prisma
// ─── Palier P3 : Moteur plugin & Ryuutama ──────────────────────────────────────

enum ContentScope { BASE MJ PARTIE }

model GameSystem {
  id      String @id    // slug stable, ex: "ryuutama"
  name    String
  version String
  contentTypes ContentType[]
  characters   Character[]
}

model ContentType {
  id           String @id @default(uuid())
  gameSystemId String
  gameSystem   GameSystem   @relation(fields: [gameSystemId], references: [id], onDelete: Cascade)
  key          String
  label        String
  entries      ContentEntry[]

  @@unique([gameSystemId, key])
}

model ContentEntry {
  id            String        @id @default(uuid())
  contentTypeId String
  contentType   ContentType   @relation(fields: [contentTypeId], references: [id], onDelete: Cascade)
  scope         ContentScope  @default(BASE)
  key           String
  data          Json

  @@unique([contentTypeId, key])
}

model Character {
  id               String     @id @default(uuid())
  userId           String
  user             User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  partieId         String
  partie           Partie     @relation(fields: [partieId], references: [id], onDelete: Cascade)
  gameSystemId     String
  gameSystem       GameSystem @relation(fields: [gameSystemId], references: [id])
  sheetData        Json
  derived          Json
  portraitUrl      String?
  portraitCropData Json?
  createdAt        DateTime   @default(now())
  updatedAt        DateTime   @updatedAt

  @@unique([userId, partieId, gameSystemId])
  @@index([partieId])
  @@index([userId])
}
```

**Relations inverses à ajouter sur les modèles existants** :
- Sur `User` : ajouter `characters Character[]`
- Sur `Partie` : ajouter `characters Character[]`

**Commandes** :
```bash
docker compose exec api pnpm prisma migrate dev --name plugin_p3
docker compose exec api pnpm prisma generate
```

### Task 6 — Seed infrastructure

**Créer le dossier et les fichiers** :
```
apps/api/game-systems/
  ryuutama/
    README.md            ← committé (format attendu, où se procurer le contenu)
    data/                ← gitignoré (.gitignore)
      classes.json
      types.json
      attribute-patterns.json
      weapon-categories.json
```

**Ajouter dans `.gitignore` à la racine** :
```
apps/api/game-systems/ryuutama/data/
```

**Format classes.json** (tableau de 7 objets) :
```json
[
  {
    "key": "artisan",
    "label": "Artisan",
    "recommendedForBeginners": false,
    "requiresSpecialty": true,
    "specialtyLabel": "Type d'objet de spécialité",
    "talents": [
      { "name": "Création", "effect": "Fabrique un objet", "attributes": ["VIG", "AGI"], "difficulty": "variable" },
      { "name": "Réparation", "effect": "Répare un objet", "attributes": ["VIG", "AGI"], "difficulty": "variable" },
      { "name": "Transformation", "effect": "Transforme une dépouille", "attributes": ["AGI", "INT"], "difficulty": "2×niveau" }
    ]
  }
  // … 6 autres classes : chasseur, fermier, guerisseur, marchand, menestrel, noble
]
```

**Format types.json** (tableau de 3 objets) :
```json
[
  {
    "key": "attaque",
    "label": "Attaque",
    "advantages": [
      { "name": "Endurance", "effect": "+4 PV" },
      { "name": "Puissance", "effect": "+1 dégâts" },
      { "name": "Entraînement", "effect": "+1 arme favorite supplémentaire" }
    ]
  }
]
```

**Format attribute-patterns.json** (tableau, seul Polyvalent ce palier) :
```json
[
  { "key": "polyvalent", "label": "Polyvalent", "values": [8, 4, 6, 6] }
]
```

**Format weapon-categories.json** (tableau de 5 objets) :
```json
[
  { "key": "arc",         "label": "Arc",          "touchFormula": "AGI+INT-2", "damageFormula": "AGI",   "price": 750, "encumbrance": 3, "hands": 2 },
  { "key": "epee-courte", "label": "Épée courte",  "touchFormula": "AGI+INT+1", "damageFormula": "INT-1", "price": 400, "encumbrance": 1, "hands": 1 },
  { "key": "epee-longue", "label": "Épée longue",  "touchFormula": "VIG+AGI",   "damageFormula": "VIG",   "price": 700, "encumbrance": 3, "hands": 1 },
  { "key": "hache",       "label": "Hache",         "touchFormula": "VIG+VIG-1", "damageFormula": "VIG",   "price": 500, "encumbrance": 3, "hands": 2 },
  { "key": "lance",       "label": "Lance",         "touchFormula": "VIG+AGI",   "damageFormula": "VIG+1", "price": 350, "encumbrance": 3, "hands": 2 }
]
```

### Task 7 — GameSystemModule

**Structure** :
```
apps/api/src/game-systems/
  game-system.module.ts
  game-system.service.ts
  game-system.controller.ts
```

**game-system.module.ts** :
```typescript
@Module({
  controllers: [GameSystemController],
  providers: [GameSystemService],
  exports: [GameSystemService],
})
export class GameSystemModule {}
```

**GameSystemService** (responsabilités) :
1. **`seedRyuutama()`** décoré `@OnApplicationBootstrap` — s'exécute APRÈS que tous les modules sont prêts
2. Lire les 4 fichiers JSON depuis `path.join(process.cwd(), 'game-systems/ryuutama/data/')`
3. Si un fichier est manquant → `throw new Error('Seed Ryuutama introuvable. Consultez apps/api/game-systems/ryuutama/README.md')`
4. Upsert `GameSystem` par son `id` (pas uuid, c'est un slug)
5. Pour chaque ContentType (class/type/attributePattern/weaponCategory) + chaque ContentEntry : `prisma.contentType.upsert()` puis `prisma.contentEntry.upsert()`
6. **`findAll()`** → retourne la liste des `GameSystem` en base
7. **`getSchema(id)`** → retourne `sheetSchema` et `creationSteps` pour le système demandé (structure statique hard-codée pour Ryuutama, alimentée par les ContentEntry de la DB)

**GameSystemController** :
```typescript
@UseGuards(AuthenticatedGuard)
@Controller('game-systems')
export class GameSystemController {
  @Get()          // GET /game-systems
  findAll() { ... }

  @Get(':id/schema')  // GET /game-systems/:id/schema
  getSchema(@Param('id') id: string) { ... }
}
```

**sheetSchema() et creationSteps()** — ils peuvent retourner des objets statiques décrivant la structure (sections, champs, types) que le frontend utilisera pour le rendu dynamique. Pour ce palier, ces objets peuvent être définis inline dans `GameSystemService.getSchema()` — pas de table Prisma dédiée pour ça.

### Task 8 — CharacterModule

**Structure** :
```
apps/api/src/characters/
  character.module.ts
  character.service.ts
  characters.controller.ts         ← GET /characters/:id
  partie-characters.controller.ts  ← GET + POST /parties/:id/characters
  dto/
    create-character.dto.ts
```

**character.module.ts** :
```typescript
@Module({
  imports: [PartiesModule],  // pour PartiesService.getViewable/getOwned
  controllers: [CharactersController, PartieCharactersController],
  providers: [CharacterService],
})
export class CharacterModule {}
```

**PrismaService** : **ne pas** le déclarer dans `providers` — il est global (P1-AD-1).

**create-character.dto.ts** :
```typescript
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCharacterDto {
  @IsString() @IsNotEmpty()
  gameSystemId: string;

  @IsNotEmpty()
  sheetData: Record<string, unknown>;
}
```

**CharacterService.create(partieId, userId, dto)** — algorithme exact :
1. `await this.parties.getViewable(partieId, userId)` — vérification appartenance (403 si non-membre)
2. Importer `validate` et `computeDerived` de `@master-jdr/game-rules`
3. `const result = validate(dto.sheetData as RyuutamaSheetData, 'strict')`
4. Si `!result.valid` → `throw new BadRequestException(result.errors)`
5. `const derived = computeDerived(dto.sheetData as RyuutamaSheetData)`
6. ```typescript
   try {
     return await this.prisma.character.create({ data: { ...dto, userId, partieId, derived }, select: characterSelect });
   } catch (e: any) {
     if (e?.code === 'P2002') throw new ConflictException('Vous avez déjà un personnage sur cette partie');
     throw e;
   }
   ```

**CharacterService.findOne(id, userId)** :
1. `const char = await this.prisma.character.findUnique({ where: { id } })`
2. Si `!char` → throw `NotFoundException`
3. Si `char.userId === userId` → autorisé
4. Sinon, vérifier si l'utilisateur est MJ de `char.partieId` via `this.parties.getOwned(char.partieId, userId)` (catch ForbiddenException → rethrower)

**CharacterService.findByPartie(partieId, userId)** :
1. `const partie = await this.parties.getViewable(partieId, userId)` → obtenir le partieId
2. Si `partie.mjId === userId` → `prisma.character.findMany({ where: { partieId } })`
3. Sinon → `prisma.character.findMany({ where: { partieId, userId } })`

**toDto(char)** helper local (pattern identique à `toDto` dans `poll.service.ts`) pour sérialiser les dates ISO.

**PartieCharactersController** :
```typescript
@UseGuards(AuthenticatedGuard)
@Controller('parties/:id/characters')
export class PartieCharactersController {
  @Post()
  create(@Param('id', ParseUUIDPipe) partieId, @CurrentUser() user, @Body() dto: CreateCharacterDto) { ... }

  @Get()
  findByPartie(@Param('id', ParseUUIDPipe) partieId, @CurrentUser() user) { ... }
}
```

**CharactersController** :
```typescript
@UseGuards(AuthenticatedGuard)
@Controller('characters')
export class CharactersController {
  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id, @CurrentUser() user) { ... }
}
```

### Task 9 — Tests character.service.spec.ts

Pattern : copier `apps/api/src/poll/poll.service.spec.ts` comme référence.

Mocks : `PrismaService` (jest.mock), `PartiesService` (jest.mock).

Tests requis :
1. `create()` valide → `prisma.character.create` appelé avec `derived` calculé correctement
2. `create()` sheetData invalide → `BadRequestException` levée, `prisma.character.create` non appelé
3. `create()` erreur Prisma P2002 → `ConflictException` avec message spécifique
4. `findOne()` par le propriétaire → retourne le personnage
5. `findOne()` par non-membre → `ForbiddenException` (via `PartiesService.getOwned` qui throw)
6. Test confirmant que `validate` et `computeDerived` viennent de `@master-jdr/game-rules` (utiliser `jest.mock('@master-jdr/game-rules')` et vérifier les appels)

### Task 10 — AppModule

Ajouter dans `apps/api/src/app.module.ts` imports :
```typescript
import { GameSystemModule } from './game-systems/game-system.module';
import { CharacterModule } from './characters/character.module';

// Dans @Module({ imports: [...] })
GameSystemModule,
CharacterModule,
```

---

## Patterns existants à suivre absolument

| Pattern | Où | À ne pas réinventer |
|---|---|---|
| `@UseGuards(AuthenticatedGuard)` | Tous les controllers | poll.controller.ts ligne 20 |
| `@CurrentUser() user: AuthUser` | Params controllers | common/current-user.decorator.ts |
| `this.parties.getViewable()` / `getOwned()` | Vérif appartenance | parties.service.ts lignes 58-68 |
| `ParseUUIDPipe` sur `:id` | Params controllers | poll.controller.ts ligne 28 |
| `PrismaService` est global | Ne pas redéclarer | app.module.ts + prisma.module.ts |
| `toDto(entity)` helper local | Sérialisation | poll.service.ts ligne 164 |
| `import type` pour shared | Tous les imports de types | Tous les fichiers existants |

## Ce qui est HORS SCOPE de cette story

**Ne pas implémenter dans cette story :**
- `PUT /characters/:id/portrait` et `DELETE /characters/:id/portrait` → **Story 4.5**
- `GET /characters/:id/export.pdf?format=...` → **Story 4.4** (exportPDF())
- `exportPDF()` dans le plugin → **Story 4.4** (stub ou omis ce palier)
- L'interface `GameSystemPlugin` complète avec `exportPDF` — définir uniquement ce qui est utilisé ce palier
- Frontend wizard de création → **Story 4.2**
- Vue fiche en lecture seule (frontend) → **Story 4.3**
- Onglet "Personnages" dans la page partie (frontend) → **Story 4.2/4.3**
- Microcopy `character.*` dans ThemeToneService → **Story 4.2**
- Patterns d'attributs Équilibré et Spécialiste → non documentés ce palier (Open Question PRD)

## Notes de contexte épique

Cette story pose les fondations backend de l'Epic 4. Elle est volontairement backend-only — le frontend ne change pas. Les stories 4.2/4.3/4.4/4.5 construisent sur cette API.

**Réutilisabilité** (NFR5) : l'interface plugin et le package `game-rules` sont conçus pour être réutilisés tel quel pour le prochain système (Conte de Minuit). Aucune modification de signature ne doit être nécessaire pour ajouter un nouveau plugin.

**Confidentialité seed** (NFR4) : les données Ryuutama (classes, talents, etc.) sont extraites du *Guide du Voyageur* (droits d'auteur). Le dossier `data/` est gitignoré dès le premier commit de cette story — ne pas le committer accidentellement.

**Pattern d'attributs** : seul Polyvalent {8,4,6,6} est implémenté ce palier (les valeurs d'Équilibré et Spécialiste ne sont pas documentées dans le guide fourni — Open Question PRD §1). `validate()` rejette tout pattern qui ne correspond pas à Polyvalent.
