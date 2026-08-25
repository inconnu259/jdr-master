---
baseline_commit: "5359a49dd5312faa28f8d0efadba197ad43f2463"
---

# Story 3.1 : API Vote — PollModule backend complet

Status: done

## Story

As a GM or player,
I want the API to handle the full poll lifecycle,
So that date votes can be created, answered, and resolved.

## Acceptance Criteria

**AC1 — Schéma Prisma + shared types**

Given la base de données et le package partagé
When le développeur vérifie l'état actuel
Then `SessionPoll`, `PollOption`, `PollVote` existent déjà en base (migration `calendar_p2` + `add_next_session_to_partie` déjà appliquées)
And `@master-jdr/shared` exporte `SessionPollDto`, `PollOptionDto`, `PollVoteDto`, `PollStatus`, `VoteAnswer` (déjà présents)
And `@master-jdr/shared` exporte également `CreatePollDto` et `CastVoteDto` (**à ajouter dans cette story**).

**AC2 — POST /parties/:id/poll (MJ uniquement)**

Given un MJ authentifié d'une partie
When il appelle `POST /parties/:id/poll` avec `{ options: [{date, slot}, ...], scenarioRef? }` (2–4 options)
Then si un poll OPEN existe déjà pour cette partie, il est automatiquement fermé (status → CLOSED)
And un nouveau `SessionPoll` est créé avec status OPEN et 2–4 enregistrements `PollOption`
And la réponse retourne le `SessionPollDto` complet (201)
And un non-MJ reçoit 403.

**AC3 — GET /parties/:id/poll (tout membre)**

Given un poll OPEN actif sur une partie
When un membre authentifié appelle `GET /parties/:id/poll`
Then le poll OPEN courant est retourné avec toutes ses options et les votes existants
And si aucun poll n'est OPEN, la réponse est `null` (200).

**AC4 — POST /parties/:id/poll/:pollId/vote (tout membre)**

Given un membre authentifié
When il appelle `POST /parties/:id/poll/:pollId/vote` avec `{ optionId, answer: "YES" }`
Then un `PollVote` est créé (ou mis à jour si ce membre a déjà voté sur cette option)
And la contrainte `@@unique([optionId, userId])` est respectée (comportement upsert).

**AC5 — PATCH /parties/:id/poll/:pollId/choose (MJ uniquement)**

Given un MJ authentifié
When il appelle `PATCH /parties/:id/poll/:pollId/choose` avec `{ optionId }`
Then `chosenDate` et `chosenSlot` du poll sont définis depuis le `PollOption` choisi
And le status du poll passe à CLOSED
And `Partie.nextSessionDate` et `Partie.nextSessionSlot` sont mis à jour
And un non-MJ reçoit 403.

**AC6 — DELETE /parties/:id/poll/:pollId (MJ uniquement)**

Given un MJ authentifié
When il appelle `DELETE /parties/:id/poll/:pollId`
Then le status du poll passe à CLOSED (soft close, pas de suppression physique)
And un non-MJ reçoit 403.

**AC7 — Tests unitaires PollService (5 cas)**

Given `PollService` testé avec Jest dans `poll.service.spec.ts`
When la suite de tests s'exécute
Then les cas suivants passent :
  1. `create()` sans poll OPEN existant → crée un nouveau poll, aucun appel close
  2. `create()` avec un poll OPEN existant → ferme l'existant, puis crée le nouveau (2 writes DB, dans l'ordre)
  3. `castVote()` appelé deux fois par le même utilisateur sur la même option → le second appel met à jour, aucune ligne dupliquée (upsert)
  4. `choose()` appelé par un non-MJ → throw `ForbiddenException`
  5. `choose()` positionne `chosenDate`, `chosenSlot`, ferme le poll, met à jour `Partie.nextSessionDate`

## Tasks/Subtasks

- [x] Task 1 — Shared : ajouter `CreatePollDto` et `CastVoteDto` (AC1)
  - [x] Ouvrir `packages/shared/src/index.ts`
  - [x] Ajouter `CreatePollDto` (voir Dev Notes §Task 1)
  - [x] Ajouter `CastVoteDto` (voir Dev Notes §Task 1)

- [x] Task 2 — DTOs NestJS + scaffold module (AC2, AC4, AC5, AC6)
  - [x] Créer `apps/api/src/poll/dto/create-poll.dto.ts` avec `@IsArray`, `@ValidateNested`, `@ArrayMinSize(2)`, `@ArrayMaxSize(4)` (voir Dev Notes §Task 2)
  - [x] Créer `apps/api/src/poll/dto/cast-vote.dto.ts` avec `@IsUUID` + `@IsEnum(VoteAnswer)` (voir Dev Notes §Task 2)
  - [x] Créer `apps/api/src/poll/dto/choose-date.dto.ts` avec `@IsUUID` (voir Dev Notes §Task 2)
  - [x] Créer `apps/api/src/poll/poll.module.ts` (imports: PrismaModule — global, PartiesModule, AvailabilityModule)

- [x] Task 3 — Tests unitaires PollService — phase RED (AC7)
  - [x] Créer `apps/api/src/poll/poll.service.spec.ts` avec les 5 cas (voir Dev Notes §Task 3)
  - [x] Vérifier que les tests échouent (pas de service encore)

- [x] Task 4 — Implémenter PollService — phase GREEN (AC2–AC7)
  - [x] Créer `apps/api/src/poll/poll.service.ts`
  - [x] Implémenter `create(partieId, userId, dto)` : auto-close + create avec options
  - [x] Implémenter `findOpen(partieId, userId)` : findFirst OPEN + mapping DTO
  - [x] Implémenter `castVote(partieId, pollId, userId, dto)` : upsert PollVote
  - [x] Implémenter `choose(partieId, pollId, userId, dto)` : check MJ + update poll + update Partie
  - [x] Implémenter `close(partieId, pollId, userId)` : check MJ + soft close
  - [x] `docker compose exec api pnpm jest poll.service` — 5 tests verts

- [x] Task 5 — Implémenter PollController (AC2–AC6)
  - [x] Créer `apps/api/src/poll/poll.controller.ts`
  - [x] `POST /parties/:id/poll` → `create()`
  - [x] `GET /parties/:id/poll` → `findOpen()`
  - [x] `POST /parties/:id/poll/:pollId/vote` → `castVote()`
  - [x] `PATCH /parties/:id/poll/:pollId/choose` → `choose()`
  - [x] `DELETE /parties/:id/poll/:pollId` → `close()`

- [x] Task 6 — Câbler dans AppModule (AC2–AC6)
  - [x] `apps/api/src/app.module.ts` — ajouter `PollModule` dans `imports`

- [x] Task 7 — Validation finale
  - [x] `docker compose exec api pnpm test` — 104 tests, 0 régression (baseline : 99 + 5 nouveaux)
  - [x] Vérifier manuellement que l'API répond sur `/parties/:id/poll` (logs Docker ou curl)

### Review Findings

- [x] [Review][Patch] **[High] castVote — option non vérifiée dans le poll** : `castVote` ne vérifie pas que `dto.optionId` appartient au `pollId` de l'URL. Un membre peut voter sur une option d'un autre poll (ou d'une autre partie) en fournissant n'importe quel UUID. [poll.service.ts:57-63]
- [x] [Review][Patch] **[High] castVote — vote possible sur un poll CLOSED** : aucune vérification de `status === 'OPEN'` avant le upsert. Un membre peut voter ou modifier son vote sur un poll fermé. [poll.service.ts:57-63]
- [x] [Review][Patch] **[Medium] choose — poll.partieId non vérifié vs URL partieId** : `choose` vérifie que l'option appartient au `pollId`, mais ne vérifie pas que `poll.partieId === partieId`. Un MJ possédant deux parties peut fermer un poll d'une partie et écrire `nextSessionDate` dans l'autre. [poll.service.ts:64-75]
- [x] [Review][Patch] **[Medium] choose — aucun garde OPEN avant fermeture** : `choose` peut être appelé sur un poll déjà CLOSED, écrasant silencieusement `chosenDate`/`chosenSlot` et `Partie.nextSessionDate`. [poll.service.ts:64-75]
- [x] [Review][Patch] **[Low] DTOs : `answer`/`slot` typés `string` au lieu de `VoteAnswer`/`DaySlot`** : force les casts `as any` dans le service. Importer les types partagés et les utiliser. [cast-vote.dto.ts, create-poll.dto.ts, poll.service.ts]
- [x] [Review][Patch] **[Low] Params `:id` et `:pollId` sans `ParseUUIDPipe`** : les UUIDs de path ne sont pas validés côté contrôleur ; des strings arbitraires atteignent Prisma. [poll.controller.ts]
- [x] [Review][Defer] **Race condition `create` — findFirst→updateMany→create non atomique** [poll.service.ts:23-43] — deferred, pre-existing : décision de spec (AD-4 + AC7 case 1 teste le comportement conditionnel explicitement) ; faible risque pour de petites parties JDR
- [x] [Review][Defer] **Options dupliquées (date, slot) acceptées dans CreatePollDto** [create-poll.dto.ts] — deferred, pre-existing : pas de contrainte unique en DB ni dans le DTO ; hors scope story 3.1
- [x] [Review][Defer] **`toDto` crash si `opt.date` null** [poll.service.ts:103] — deferred, pre-existing : schéma `PollOption.date DateTime` non-nullable garantit la sécurité en production
- [x] [Review][Defer] **`close` accepte un poll déjà CLOSED (pas de garde status)** [poll.service.ts:77-83] — deferred, pre-existing : comportement bénin, idempotent

## Dev Notes

### Vue d'ensemble

Cette story crée `apps/api/src/poll/` from scratch. Le schéma Prisma et les migrations sont **déjà faits** — ne pas relancer de migration. Seuls les fichiers applicatifs NestJS + les 2 types partagés manquent.

**État initial vérifié :**
- `apps/api/prisma/migrations/20260627093433_calendar_p2/` — SessionPoll, PollOption, PollVote, PollStatus, VoteAnswer ✓
- `apps/api/prisma/migrations/20260628231853_add_next_session_to_partie/` — nextSessionDate, nextSessionSlot ✓
- `packages/shared/src/index.ts` — SessionPollDto, PollOptionDto, PollVoteDto, PollStatus, VoteAnswer déjà exportés ✓
- `apps/api/src/poll/` — inexistant ✗
- `CreatePollDto`, `CastVoteDto` dans shared — manquants ✗

---

### Task 1 — Shared types à ajouter

Fichier : `packages/shared/src/index.ts` — ajouter après les interfaces existantes PollVoteDto :

```typescript
/** Payload de création d'un vote de date (POST /parties/:id/poll). */
export interface CreatePollDto {
  options: { date: string; slot: DaySlot }[];
  scenarioRef?: string | null;
}

/** Payload pour voter sur une option (POST /parties/:id/poll/:pollId/vote). */
export interface CastVoteDto {
  optionId: string;
  answer: VoteAnswer;
}
```

---

### Task 2 — DTOs NestJS

**`apps/api/src/poll/dto/create-poll.dto.ts`**

```typescript
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString,
  IsEnum, IsOptional, IsString, ValidateNested,
} from 'class-validator';

class PollOptionInput {
  @IsDateString()
  date!: string;

  @IsEnum(['MORNING', 'AFTERNOON', 'EVENING', 'FULL_DAY'])
  slot!: string;
}

export class CreatePollDto {
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(4)
  @ValidateNested({ each: true })
  @Type(() => PollOptionInput)
  options!: PollOptionInput[];

  @IsOptional()
  @IsString()
  scenarioRef?: string | null;
}
```

**`apps/api/src/poll/dto/cast-vote.dto.ts`**

```typescript
import { IsEnum, IsUUID } from 'class-validator';

export class CastVoteDto {
  @IsUUID()
  optionId!: string;

  @IsEnum(['YES', 'NO', 'MAYBE'])
  answer!: string;
}
```

**`apps/api/src/poll/dto/choose-date.dto.ts`**

```typescript
import { IsUUID } from 'class-validator';

export class ChooseDateDto {
  @IsUUID()
  optionId!: string;
}
```

**`apps/api/src/poll/poll.module.ts`**

```typescript
import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { PartiesModule } from '../parties/parties.module';
import { PollController } from './poll.controller';
import { PollService } from './poll.service';

@Module({
  imports: [PartiesModule, AvailabilityModule],
  controllers: [PollController],
  providers: [PollService],
})
export class PollModule {}
```

Note : `PrismaModule` est global (forRoot via le module racine), pas besoin de l'importer ici.

---

### Task 3 — Tests unitaires PollService

Fichier : `apps/api/src/poll/poll.service.spec.ts`

Pattern des mocks (calqué sur `parties.service.spec.ts`) :

```typescript
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PollService } from './poll.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';

function makePrisma() {
  return {
    sessionPoll: {
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    pollVote: {
      upsert: jest.fn(),
    },
    pollOption: {
      findUnique: jest.fn(),
    },
    partie: {
      update: jest.fn(),
    },
  };
}

function makePartiesService() {
  return {
    getOwned: jest.fn(),
    getViewable: jest.fn(),
  };
}

describe('PollService', () => {
  let service: PollService;
  let prisma: ReturnType<typeof makePrisma>;
  let parties: ReturnType<typeof makePartiesService>;

  beforeEach(async () => {
    prisma = makePrisma();
    parties = makePartiesService();
    const module = await Test.createTestingModule({
      providers: [
        PollService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
      ],
    }).compile();
    service = module.get(PollService);
  });

  it('create() sans poll OPEN → crée sans appeler updateMany', async () => {
    prisma.sessionPoll.findFirst.mockResolvedValue(null);
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create('p1', 'mj1', { options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')] });
    expect(prisma.sessionPoll.updateMany).not.toHaveBeenCalled();
    expect(prisma.sessionPoll.create).toHaveBeenCalledTimes(1);
  });

  it('create() avec poll OPEN existant → ferme l'existant puis crée', async () => {
    prisma.sessionPoll.findFirst.mockResolvedValue({ id: 'old-poll' });
    prisma.sessionPoll.updateMany.mockResolvedValue({ count: 1 });
    prisma.sessionPoll.create.mockResolvedValue(makePoll());
    await service.create('p1', 'mj1', { options: [opt('2026-08-01', 'MORNING'), opt('2026-08-02', 'AFTERNOON')] });
    const updateCall = prisma.sessionPoll.updateMany.mock.invocationCallOrder[0];
    const createCall = prisma.sessionPoll.create.mock.invocationCallOrder[0];
    expect(updateCall).toBeLessThan(createCall);
  });

  it('castVote() deux fois sur la même option → upsert (pas de doublon)', async () => {
    parties.getViewable.mockResolvedValue({ id: 'p1' });
    prisma.pollVote.upsert.mockResolvedValue({});
    await service.castVote('p1', 'poll1', 'u1', { optionId: 'opt1', answer: 'YES' });
    await service.castVote('p1', 'poll1', 'u1', { optionId: 'opt1', answer: 'NO' });
    expect(prisma.pollVote.upsert).toHaveBeenCalledTimes(2);
    // Les deux calls utilisent le même `where: { optionId_userId: { optionId: 'opt1', userId: 'u1' } }`
    const calls = prisma.pollVote.upsert.mock.calls;
    expect(calls[0][0].where).toEqual({ optionId_userId: { optionId: 'opt1', userId: 'u1' } });
    expect(calls[1][0].where).toEqual({ optionId_userId: { optionId: 'opt1', userId: 'u1' } });
  });

  it('choose() par non-MJ → ForbiddenException', async () => {
    parties.getOwned.mockRejectedValue(new ForbiddenException());
    await expect(service.choose('p1', 'poll1', 'joueur1', { optionId: 'opt1' }))
      .rejects.toThrow(ForbiddenException);
  });

  it('choose() → positionne chosenDate/chosenSlot, ferme le poll, met à jour Partie', async () => {
    const d = new Date('2026-08-01T00:00:00.000Z');
    parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
    prisma.pollOption.findUnique.mockResolvedValue({ id: 'opt1', pollId: 'poll1', date: d, slot: 'MORNING' });
    prisma.sessionPoll.update.mockResolvedValue({});
    prisma.partie.update.mockResolvedValue({});
    await service.choose('p1', 'poll1', 'mj1', { optionId: 'opt1' });
    expect(prisma.sessionPoll.update).toHaveBeenCalledWith({
      where: { id: 'poll1' },
      data: { status: 'CLOSED', chosenDate: d, chosenSlot: 'MORNING' },
    });
    expect(prisma.partie.update).toHaveBeenCalledWith({
      where: { id: 'p1' },
      data: { nextSessionDate: d, nextSessionSlot: 'MORNING' },
    });
  });
});

// ── Helpers ─────────────────────────────────────────────────────────────────

function opt(date: string, slot: string) { return { date, slot }; }

function makePoll() {
  return { id: 'poll1', partieId: 'p1', status: 'OPEN', scenarioRef: null,
    expiresAt: null, chosenDate: null, chosenSlot: null, createdById: 'mj1',
    createdAt: new Date(), options: [] };
}
```

Note sur `invocationCallOrder` : c'est la propriété Jest qui indique l'ordre global des calls sur tous les mocks. Si `jest.fn().mock.invocationCallOrder` n'est pas disponible (Jest < 27), utiliser un flag manuel (`let updateCalled = false; prisma.sessionPoll.updateMany.mockImplementation(() => { updateCalled = true; ... })`).

---

### Task 4 — PollService

Fichier : `apps/api/src/poll/poll.service.ts`

```typescript
import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import type { SessionPollDto } from '@master-jdr/shared';
import { PartiesService } from '../parties/parties.service';
import { PrismaService } from '../prisma/prisma.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChooseDateDto } from './dto/choose-date.dto';
import { CreatePollDto } from './dto/create-poll.dto';

// Type Prisma include utilisé dans toDto
const POLL_INCLUDE = {
  options: { include: { votes: { include: { user: { select: { pseudo: true } } } } } },
} as const;

@Injectable()
export class PollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
  ) {}

  async create(partieId: string, userId: string, dto: CreatePollDto): Promise<SessionPollDto> {
    await this.parties.getOwned(partieId, userId); // throws 403 si non-MJ
    // AD-4 : fermer le poll OPEN existant avant d'en créer un nouveau
    await this.prisma.sessionPoll.updateMany({
      where: { partieId, status: 'OPEN' },
      data: { status: 'CLOSED' },
    });
    const poll = await this.prisma.sessionPoll.create({
      data: {
        partieId,
        createdById: userId,
        scenarioRef: dto.scenarioRef ?? null,
        options: {
          create: dto.options.map((o) => ({
            date: new Date(o.date),
            slot: o.slot,
          })),
        },
      },
      include: POLL_INCLUDE,
    });
    return toDto(poll);
  }

  async findOpen(partieId: string, userId: string): Promise<SessionPollDto | null> {
    await this.parties.getViewable(partieId, userId); // throws 403 si non-membre
    const poll = await this.prisma.sessionPoll.findFirst({
      where: { partieId, status: 'OPEN' },
      include: POLL_INCLUDE,
    });
    return poll ? toDto(poll) : null;
  }

  async castVote(partieId: string, pollId: string, userId: string, dto: CastVoteDto): Promise<void> {
    await this.parties.getViewable(partieId, userId);
    await this.prisma.pollVote.upsert({
      where: { optionId_userId: { optionId: dto.optionId, userId } },
      update: { answer: dto.answer as any },
      create: { pollId, optionId: dto.optionId, userId, answer: dto.answer as any },
    });
  }

  async choose(partieId: string, pollId: string, userId: string, dto: ChooseDateDto): Promise<void> {
    await this.parties.getOwned(partieId, userId);
    const option = await this.prisma.pollOption.findUnique({ where: { id: dto.optionId } });
    if (!option || option.pollId !== pollId) throw new NotFoundException('Option introuvable');
    await this.prisma.sessionPoll.update({
      where: { id: pollId },
      data: { status: 'CLOSED', chosenDate: option.date, chosenSlot: option.slot },
    });
    await this.prisma.partie.update({
      where: { id: partieId },
      data: { nextSessionDate: option.date, nextSessionSlot: option.slot },
    });
  }

  async close(partieId: string, pollId: string, userId: string): Promise<void> {
    await this.parties.getOwned(partieId, userId);
    const poll = await this.prisma.sessionPoll.findUnique({ where: { id: pollId } });
    if (!poll || poll.partieId !== partieId) throw new NotFoundException('Poll introuvable');
    await this.prisma.sessionPoll.update({
      where: { id: pollId },
      data: { status: 'CLOSED' },
    });
  }
}

// ── Mapping ─────────────────────────────────────────────────────────────────

type PollWithRelations = Awaited<ReturnType<typeof prismaFindPoll>>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare function prismaFindPoll(...args: any[]): Promise<any>;

function toDto(poll: any): SessionPollDto {
  return {
    id: poll.id,
    partieId: poll.partieId,
    status: poll.status,
    scenarioRef: poll.scenarioRef,
    expiresAt: poll.expiresAt?.toISOString() ?? null,
    chosenDate: poll.chosenDate?.toISOString() ?? null,
    chosenSlot: poll.chosenSlot,
    options: (poll.options ?? []).map((opt: any) => ({
      id: opt.id,
      date: opt.date.toISOString(),
      slot: opt.slot,
      votes: (opt.votes ?? []).map((v: any) => ({
        userId: v.userId,
        pseudo: v.user.pseudo,
        answer: v.answer,
      })),
    })),
  };
}
```

Note : le cast `as any` sur `answer` est nécessaire car la string validée par class-validator n'est pas encore typée comme `VoteAnswer` Prisma à ce stade. Alternative propre : ajouter un `@Transform` ou caster via `VoteAnswer` importé du client Prisma.

---

### Task 5 — PollController

Fichier : `apps/api/src/poll/poll.controller.ts`

```typescript
import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthUser } from '@master-jdr/shared';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChooseDateDto } from './dto/choose-date.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { PollService } from './poll.service';

@UseGuards(AuthenticatedGuard)
@Controller('parties/:id/poll')
export class PollController {
  constructor(private readonly poll: PollService) {}

  @Post()
  create(
    @Param('id') partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePollDto,
  ) {
    return this.poll.create(partieId, user.id, dto);
  }

  @Get()
  findOpen(@Param('id') partieId: string, @CurrentUser() user: AuthUser) {
    return this.poll.findOpen(partieId, user.id);
  }

  @Post(':pollId/vote')
  castVote(
    @Param('id') partieId: string,
    @Param('pollId') pollId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CastVoteDto,
  ) {
    return this.poll.castVote(partieId, pollId, user.id, dto);
  }

  @Patch(':pollId/choose')
  choose(
    @Param('id') partieId: string,
    @Param('pollId') pollId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChooseDateDto,
  ) {
    return this.poll.choose(partieId, pollId, user.id, dto);
  }

  @Delete(':pollId')
  close(
    @Param('id') partieId: string,
    @Param('pollId') pollId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.poll.close(partieId, pollId, user.id);
  }
}
```

Note : `@CurrentUser()` et `AuthenticatedGuard` suivent le même pattern que `parties.controller.ts`. Vérifier les imports exacts en lisant ce fichier si nécessaire.

---

### Task 6 — Câblage AppModule

Fichier : `apps/api/src/app.module.ts`

Ajouter `PollModule` dans `imports` après `AvailabilityModule` :

```typescript
import { PollModule } from './poll/poll.module';
// ...
imports: [
  // ... existants ...
  AvailabilityModule,
  PollModule,  // ← ajouter
],
```

---

### Contraintes d'architecture

- **AD-2** (ARCHITECTURE-SPINE) : `PollModule` dans `apps/api/src/poll/`, importe `PartiesModule` + `AvailabilityModule`.
- **AD-4** : `PollService.create()` doit faire `findFirst({ where: { partieId, status: 'OPEN' } })` avant insert — enforcé dans `create()` via `updateMany` conditionnel.
- **AD-5** : `computeSlotStatus` appartient à `AvailabilityService` — `PollService` ne l'appelle pas dans cette story (réservé aux stories 3.x futures).
- `PartiesService.getOwned()` → throw 403 si non-MJ. `PartiesService.getViewable()` → throw 403 si non-membre.

---

### Patterns à respecter

- Décorateurs guard/user : reproduire exactement le pattern de `apps/api/src/parties/parties.controller.ts`.
- Tests Jest : pattern `makeXxx()` factory + `Test.createTestingModule()` — voir `apps/api/src/parties/parties.service.spec.ts` pour l'exemple complet.
- `docker compose exec api pnpm test` pour lancer les tests (pas de Node local).
- Ne pas utiliser `prisma generate` ou `prisma migrate` — schéma déjà à jour.

## Dev Agent Record

### Debug Log

- `pnpm test -- --testPathPattern=X` ne fonctionne pas (double `--` mal parsé) → utiliser `pnpm jest <pattern>` directement.
- Correction par rapport au story template : `create()` utilise un `findFirst` conditionnel avant `updateMany` pour satisfaire le test AC7 cas 1 (updateMany NE doit PAS être appelé quand aucun poll OPEN n'existe).
- `CurrentUser` decorator : import depuis `'../common/current-user.decorator'` (et non `'../auth/decorators/...'` comme indiqué dans le story template).
- Suppression de la déclaration `declare function prismaFindPoll` inutile dans poll.service.ts.

### Completion Notes

- PollModule créé from scratch dans `apps/api/src/poll/` avec 8 fichiers.
- Schéma Prisma déjà à jour (migrations `calendar_p2` + `add_next_session_to_partie`) — aucune migration lancée.
- `@master-jdr/shared` complété avec `CreatePollDto` et `CastVoteDto`.
- 5 tests Jest verts (AC7), suite complète : 104 tests (+5), 0 régression.
- `create()` adapté : `findFirst` conditionnel → `updateMany` uniquement si OPEN poll existant.
- `castVote()` : upsert Prisma avec `optionId_userId` composite unique.
- `choose()` : met à jour poll ET Partie.nextSessionDate/nextSessionSlot.
- `close()` : soft close via `status: 'CLOSED'`.

## File List

- `packages/shared/src/index.ts` (modifié — +CreatePollDto, +CastVoteDto)
- `apps/api/src/poll/dto/create-poll.dto.ts` (nouveau)
- `apps/api/src/poll/dto/cast-vote.dto.ts` (nouveau)
- `apps/api/src/poll/dto/choose-date.dto.ts` (nouveau)
- `apps/api/src/poll/poll.module.ts` (nouveau)
- `apps/api/src/poll/poll.service.ts` (nouveau)
- `apps/api/src/poll/poll.service.spec.ts` (nouveau)
- `apps/api/src/poll/poll.controller.ts` (nouveau)
- `apps/api/src/app.module.ts` (modifié — +PollModule)

## Change Log

| Date | Change |
|------|--------|
| 2026-06-30 | Story créée (bmad-create-story) |
| 2026-06-30 | Implémentation complète — PollModule NestJS, 5 tests verts, 104 tests totaux |
