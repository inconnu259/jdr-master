---
baseline_commit: 70c6883132cb96b9b08050ce571d3d64bdad19cf
---

# Story 2.1: API — Calcul des créneaux disponibles

Status: done

## Story

As a GM,
I want the API to compute the next available slots for my party,
so that I can see when everyone is free without manually cross-checking.

## Acceptance Criteria

**AC1 — `AggregatedSlotDto` + `PartiesModule` imports `AvailabilityModule`**

Given `PartiesModule` does not yet import `AvailabilityModule`
When the developer updates `PartiesModule`
Then `PartiesModule` imports `AvailabilityModule` and injects `AvailabilityService` into `PartiesService`
And `@master-jdr/shared` exports `AggregatedSlotDto` with shape `{ date: string; slot: DaySlot; available: number; unavailable: number; unknown: number; total: number }`

**AC2 — Endpoint MJ : `AvailableSlotDto[]`**

Given an authenticated user who is MJ of a party (i.e. `partie.mjId === userId`)
When they call `GET /parties/:id/available-slots?weeks=8`
Then `PartiesService.getAvailableSlots(partieId, userId, 8)` executes:
  1. Loads the party and all `Membership` records with user pseudo in ONE query per entity
  2. Loads all active declarations for those users in ONE query (`WHERE userId IN [...] AND expiresAt > NOW()`)
  3. Iterates in-memory over date×slot combinations (weeks × 7 days × 3 slots: MORNING/AFTERNOON/EVENING)
  4. For each slot, calls `AvailabilityService.computeSlotStatus(declarations, date, slot)` per member
  5. Returns the first 5 slots where NO member is UNAVAILABLE, sorted by date ascending
And the response body is `AvailableSlotDto[]` (shape: `{ date: string, slot: DaySlot, members: { userId, pseudo, status }[] }`)
And the response is returned in < 1s for a party of 6 members (NFR2)

**AC3 — Endpoint joueur : `AggregatedSlotDto[]`**

Given an authenticated party member who is NOT the MJ (`partie.mjId !== userId`)
When they call `GET /parties/:id/available-slots?weeks=8`
Then the response is 200 with `AggregatedSlotDto[]` — each slot shows `{ date, slot, available, unavailable, unknown, total }` with NO member identity information

**AC4 — Membre retiré exclu du calcul**

Given a party member has been removed (Membership deleted)
When `GET /parties/:id/available-slots` is called
Then the removed member's declarations are NOT included in the calculation (NFR3)
And their removal does not affect their global `AvailabilityDeclaration` records

**AC5 — Membre sans déclarations → UNKNOWN (ne bloque pas)**

Given a member has no active declarations
When the slots are computed
Then all their slots are UNKNOWN (not UNAVAILABLE)
And the slot still appears in results (UNKNOWN does NOT block the slot)
And the slot's `members` array shows that member with `status: "UNKNOWN"`

**AC6 — Non-membre → 403**

Given a request from a user who is not a member of the party (not MJ, not in Membership)
When `GET /parties/:id/available-slots` is called
Then the response is 403 Forbidden

**AC7 — Tests unitaires `parties.service.spec.ts`**

Given `PartiesService.getAvailableSlots` is unit tested (Jest)
When the test suite runs
Then the following cases pass:
  - 6 members × 8 weeks: `prisma.availabilityDeclaration.findMany` called exactly once (no N+1)
  - A slot where one member is UNAVAILABLE is excluded from results
  - A slot where all members are UNKNOWN is included
  - A removed member (not in memberships) is not included
  - Returns at most 5 slots, sorted by date ascending
  - Caller is MJ → response is `AvailableSlotDto[]` (has `members[]` array with userId/pseudo/status)
  - Caller is non-MJ member → response is `AggregatedSlotDto[]` (has counts, no member identity)
  - Non-member (not in memberships, not MJ) → throws `ForbiddenException`

## Tasks / Subtasks

- [x] Task 1 — Ajouter `AggregatedSlotDto` dans `@master-jdr/shared` (AC1)
  - [x] Dans `packages/shared/src/index.ts`, ajouter après `AvailableSlotDto` :
    ```typescript
    export interface AggregatedSlotDto {
      date: string;
      slot: DaySlot;
      available: number;
      unavailable: number;
      unknown: number;
      total: number;
    }
    ```

- [x] Task 2 — `PartiesModule` importe `AvailabilityModule` (AC1)
  - [x] Dans `apps/api/src/parties/parties.module.ts` : ajouter `AvailabilityModule` dans `imports` (et l'importer)
  - [x] Dans `apps/api/src/parties/parties.service.ts` : injecter `AvailabilityService` dans le constructeur
  - [x] Mettre à jour `apps/api/src/parties/parties.service.spec.ts` : le constructeur de `PartiesService` prend maintenant 2 arguments (prisma + availabilityService mock)

- [x] Task 3 — `GetAvailableSlotsDto` query DTO (AC2)
  - [x] Créer `apps/api/src/parties/dto/get-available-slots.dto.ts` avec `weeks?: number` (optionnel, défaut 8) validé par `@IsOptional() @IsInt() @Min(1) @Max(52) @Type(() => Number)`

- [x] Task 4 — `PartiesService.getAvailableSlots` (AC2, AC3, AC4, AC5, AC6)
  - [x] Implémenter la méthode dans `parties.service.ts` :
    ```
    async getAvailableSlots(partieId: string, userId: string, weeks: number): Promise<AvailableSlotDto[] | AggregatedSlotDto[]>
    ```
  - [x] Charger la partie (`prisma.partie.findUnique`) — 404 si introuvable
  - [x] Charger les memberships avec pseudo (`prisma.membership.findMany` avec `include: { user: { select: { id, pseudo } } }`)
  - [x] Déterminer si userId est MJ (`partie.mjId === userId`) — sinon vérifier appartenance via memberships
  - [x] Si ni MJ ni membre → lancer `ForbiddenException`
  - [x] Appeler `AvailabilityService.getActiveDeclarations(memberIds)` (1 seule requête SQL)
  - [x] Boucle in-memory : itérer sur `weeks × 7 jours × 3 slots (MORNING, AFTERNOON, EVENING)` depuis aujourd'hui UTC midnight
  - [x] Pour chaque slot : si 0 membre UNAVAILABLE → candidat. Collecter jusqu'à 5 candidats puis arrêter
  - [x] Si MJ → retourner `AvailableSlotDto[]`; sinon → retourner `AggregatedSlotDto[]`
  - [x] Format de la date dans la réponse : `date.toISOString().substring(0, 10)` (YYYY-MM-DD)

- [x] Task 5 — `PartiesController` endpoint `GET /parties/:id/available-slots` (AC2, AC3)
  - [x] Ajouter dans `parties.controller.ts` :
    ```typescript
    @Get(':id/available-slots')
    getAvailableSlots(
      @CurrentUser() user: AuthUser,
      @Param('id') id: string,
      @Query() q: GetAvailableSlotsDto,
    ) {
      return this.parties.getAvailableSlots(id, user.id, q.weeks ?? 8);
    }
    ```
  - [x] Activer `ValidationPipe` pour les query params : `main.ts` a déjà `app.useGlobalPipes(new ValidationPipe({ transform: true }))` ✓

- [x] Task 6 — Tests unitaires `parties.service.spec.ts` (AC7)
  - [x] Mettre à jour le mock pour inclure l'injection d'`AvailabilityService` (getActiveDeclarations + computeSlotStatus)
  - [x] Écrire les 8 cas de test listés dans AC7
  - [x] Lancer `docker compose exec api pnpm test` → 80/80 verts, 0 régression

### Review Findings

- [x] [Review][Defer] MJ exclu du calcul si absent de la table Membership — décision explicite dans Dev Notes ; risque : MJ accepte un créneau où il est lui-même UNAVAILABLE [parties.service.ts:118-124] — deferred, design decision documentée
- [x] [Review][Defer] `unavailable` dans `AggregatedSlotDto` vaut toujours 0 — les slots avec un UNAVAILABLE sont filtrés avant l'agrégation, le champ est structurellement mort [parties.service.ts:148-158] — deferred, tension de spec
- [x] [Review][Defer] `weeks=52` non validé contre NFR2 (<1s) — 52×7×3 = 1092 itérations non benchmarkées [get-available-slots.dto.ts:8] — deferred, risque théorique
- [x] [Review][Defer] Aucun test e2e/intégration pour l'endpoint — la garde AuthenticatedGuard et la validation query params non couvertes — deferred, hors scope AC7
- [x] [Review][Defer] Valeur par défaut `weeks=8` dans le controller, pas dans le DTO — dispersion des règles métier [parties.controller.ts:53] — deferred, style mineur
- [x] [Review][Defer] Deux requêtes DB séparées (`partie` puis `memberships`) au lieu d'un `findUnique` avec `include` — micro-optimisation [parties.service.ts:107-116] — deferred, spec OK ("une requête par entité")

## Dev Notes

### Ce qui existe déjà — NE PAS réinventer

**`AvailabilityService` (apps/api/src/availability/availability.service.ts) :**
- `getActiveDeclarations(userIds: string[]): Promise<Map<string, DeclarationLike[]>>` — charge toutes les déclarations actives en UNE requête SQL. C'est exactement ce qu'il faut utiliser.
- `computeSlotStatus(declarations: DeclarationLike[], date: Date, slot: DaySlot, now?: Date): SlotStatus` — calcule le statut en mémoire. Prend les `DeclarationLike[]` déjà chargées (pas un userId).
- `AvailabilityModule` exporte déjà `AvailabilityService` : `exports: [AvailabilityService]`

**`@master-jdr/shared` (packages/shared/src/index.ts) :**
- `AvailableSlotDto` est déjà exporté : `{ date: string, slot: DaySlot, members: { userId, pseudo, status: SlotStatus }[] }`
- `AggregatedSlotDto` N'EST PAS encore exporté — à créer en Task 1

**Membership model (schema.prisma) :**
- Pas de champ `role` — le MJ est `Partie.mjId`. Vérification MJ = `partie.mjId === userId`
- Chargement pseudo : `membership.findMany({ include: { user: { select: { id: true, pseudo: true } } } })`

**PartiesService :**
- Constructeur actuel : `constructor(private readonly prisma: PrismaService) {}`
- À modifier : `constructor(private readonly prisma: PrismaService, private readonly availability: AvailabilityService) {}`
- **IMPORTANT :** `parties.service.spec.ts` crée le service directement `new PartiesService(prisma as unknown as PrismaService)` — il faudra passer 2 arguments à la place.

**PartiesModule :**
- Actuellement : `@Module({ controllers: [PartiesController], providers: [PartiesService], exports: [PartiesService] })`
- À modifier : ajouter `imports: [AvailabilityModule]`

**AppModule :** `AvailabilityModule` est déjà importé dans `AppModule` — pas de doublon à créer.

### Algorithme `getAvailableSlots` — logique complète

```typescript
async getAvailableSlots(
  partieId: string,
  userId: string,
  weeks: number,
): Promise<AvailableSlotDto[] | AggregatedSlotDto[]> {
  const partie = await this.prisma.partie.findUnique({ where: { id: partieId } });
  if (!partie) throw new NotFoundException('Partie introuvable');

  const memberships = await this.prisma.membership.findMany({
    where: { partieId },
    include: { user: { select: { id: true, pseudo: true } } },
  });

  const isMj = partie.mjId === userId;
  const isMember = memberships.some((m) => m.userId === userId);
  if (!isMj && !isMember) throw new ForbiddenException();

  // Membres participants = MJ + Membership. Ou uniquement Membership si MJ n'est pas dans la table.
  // Pour le calcul, on inclut uniquement les userId présents dans Membership.
  // Le MJ peut ne pas être dans la table Membership (il est souvent le créateur seulement).
  // Architecture decision: on charge les déclarations des membres de la Membership + le MJ si distinct.
  const memberIds = [...new Set([
    ...memberships.map((m) => m.userId),
    partie.mjId,
  ])];

  const declarationsMap = await this.availability.getActiveDeclarations(memberIds);

  const SLOTS = ['MORNING', 'AFTERNOON', 'EVENING'] as const;
  const now = new Date();
  const todayUtcMidnight = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const results: AvailableSlotDto[] = [];

  outer: for (let d = 0; d < weeks * 7; d++) {
    const dateUtc = new Date(Date.UTC(
      todayUtcMidnight.getUTCFullYear(),
      todayUtcMidnight.getUTCMonth(),
      todayUtcMidnight.getUTCDate() + d,
    ));
    for (const slot of SLOTS) {
      const memberStatuses = memberIds.map((uid) => {
        const decls = declarationsMap.get(uid) ?? [];
        return {
          userId: uid,
          pseudo: memberships.find((m) => m.userId === uid)?.user.pseudo
            ?? (uid === partie.mjId ? 'MJ' : uid),
          status: this.availability.computeSlotStatus(decls, dateUtc, slot),
        };
      });

      if (memberStatuses.some((m) => m.status === 'UNAVAILABLE')) continue;
      results.push({ date: dateUtc.toISOString().substring(0, 10), slot, members: memberStatuses });
      if (results.length >= 5) break outer;
    }
  }

  if (isMj) return results;

  // Aggregated view for non-MJ members
  return results.map(({ date, slot, members }) => ({
    date,
    slot,
    available: members.filter((m) => m.status === 'AVAILABLE').length,
    unavailable: members.filter((m) => m.status === 'UNAVAILABLE').length,
    unknown: members.filter((m) => m.status === 'UNKNOWN').length,
    total: members.length,
  }));
}
```

> **Note :** Décision architecture AD-3 : le MJ est inclus dans le calcul comme n'importe quel membre. Si le MJ n'a pas de Membership (il est souvent absent de la table `Membership`), il faut quand même inclure ses déclarations. Le code ci-dessus ajoute `partie.mjId` à `memberIds`. Pour le pseudo du MJ s'il n'est pas dans Membership, faire un `prisma.user.findUnique({ where: { id: partie.mjId }, select: { pseudo: true } })` ou simplement laisser un fallback.

> **Alternative plus simple** : ne pas inclure le MJ dans le calcul de disponibilité si pas dans Membership. Selon le spec : "Loads all `Membership` records for the party (userId[])" — seulement les membres de Membership. Utiliser cette interprétation pour simplifier (le MJ peut être dans Membership via une ligne séparée).

> **Décision recommandée** : charger uniquement les `userId` issus de `Membership` (pas le MJ séparément). Si le MJ veut que ses propres disponibilités soient incluses, il doit s'ajouter lui-même comme membre ou la spec ne le mentionne pas explicitement. Cette approche est plus simple et cohérente avec le spec.

### `GetAvailableSlotsDto` — query params

```typescript
// apps/api/src/parties/dto/get-available-slots.dto.ts
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class GetAvailableSlotsDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(52)
  weeks?: number;
}
```

**Important :** `@Type(() => Number)` (de `class-transformer`) est nécessaire pour transformer le string de query en number. `ValidationPipe` avec `transform: true` est déjà configuré dans `main.ts` (à vérifier).

### Tests — pattern à suivre

Dans `parties.service.spec.ts`, le service est instancié directement (pas de TestingModule NestJS). Après l'injection d'`AvailabilityService`, le mock doit inclure `getActiveDeclarations` et `computeSlotStatus` :

```typescript
let availabilityService: {
  getActiveDeclarations: jest.Mock;
  computeSlotStatus: jest.Mock;
};

// Dans beforeEach :
availabilityService = {
  getActiveDeclarations: jest.fn(),
  computeSlotStatus: jest.fn(),
};
service = new PartiesService(
  prisma as unknown as PrismaService,
  availabilityService as unknown as AvailabilityService,
);
```

Les tests existants (`create`, `listForUser`, `getOwned`, etc.) ne changent pas de comportement — seul le constructeur prend 2 arguments maintenant.

### Itération en mémoire — performance

- 8 semaines × 7 jours × 3 slots = 168 combinaisons
- `computeSlotStatus` est synchrone et rapide (O(n) sur les déclarations)
- L'itération s'arrête dès 5 candidats (`break outer`)
- NFR2 : < 1s pour 6 membres sur 8 semaines — facile à atteindre en mémoire (pas de DB N+1)

### `ValidationPipe` — vérification

Dans `apps/api/src/main.ts`, vérifier que `app.useGlobalPipes(new ValidationPipe({ transform: true }))` est déjà configuré. Si non, l'ajouter. Cette option est nécessaire pour que `@Type(() => Number)` fonctionne dans les query DTOs.

### Architecture — pas de `nextSessionDate` sur `Partie`

Le champ `nextSessionDate` sur `Partie` (pour la story 3.1) n'existe PAS encore. Ne pas l'ajouter dans cette story — c'est dans le scope de la story 3.1.

### Références

- Architecture AD-3 : `GET /parties/:id/available-slots` dans `PartiesController` [ARCHITECTURE-SPINE.md §AD-3]
- Architecture AD-5 : `computeSlotStatus` opère en mémoire [ARCHITECTURE-SPINE.md §AD-5]
- Shared types existants : `AvailableSlotDto` [packages/shared/src/index.ts:173]
- `getActiveDeclarations` : [availability.service.ts:329]
- `computeSlotStatus` : [availability.service.ts:348]
- Test pattern existant : [parties.service.spec.ts] — instanciation directe sans TestingModule
- Membership sans `role` : [schema.prisma] — MJ = `Partie.mjId`

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Implémentation complète : `getAvailableSlots` charge membres + déclarations en 2 requêtes SQL max (1 par entité), itère 168 combinaisons max en mémoire, s'arrête à 5 résultats.
- Décision retenue : seuls les `userId` issus de `Membership` participent au calcul (pas le MJ séparément). Si le MJ veut que ses disponibilités comptent, il doit être dans la table `Membership`.
- 31 erreurs de lint pré-existantes dans `auth/`, `availability/`, `main.ts` — aucune introduite par cette story.
- 80/80 tests, 0 régression.

### File List

- `packages/shared/src/index.ts` — UPDATE (ajout `AggregatedSlotDto`)
- `apps/api/src/parties/parties.module.ts` — UPDATE (import `AvailabilityModule`)
- `apps/api/src/parties/parties.service.ts` — UPDATE (injection `AvailabilityService`, méthode `getAvailableSlots`)
- `apps/api/src/parties/parties.controller.ts` — UPDATE (endpoint `GET :id/available-slots`)
- `apps/api/src/parties/dto/get-available-slots.dto.ts` — NEW
- `apps/api/src/parties/parties.service.spec.ts` — UPDATE (mock AvailabilityService, 8 nouveaux tests `getAvailableSlots`)

### Change Log

- 2026-06-28 : Story 2-1 implémentée — API `GET /parties/:id/available-slots` avec réponse polymorphe MJ (`AvailableSlotDto[]`) / joueur (`AggregatedSlotDto[]`). Aucun N+1 SQL. 8 tests unitaires.
