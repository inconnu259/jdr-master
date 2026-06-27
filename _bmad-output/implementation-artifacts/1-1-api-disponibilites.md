---
baseline_commit: 2517ac45b61a3633fb4bc7434174ff5c3b19f59a
status: review
---

# Story 1.1 : API disponibilités — CRUD complet

As a user (MJ or player),
I want to manage my availability declarations via the API,
So that the system can compute when I'm free to play.

## Tasks/Subtasks

- [x] Task 1: Ajouter les types Palier 2 dans @master-jdr/shared (enums + DTOs availability)
- [x] Task 2: Mettre à jour le schéma Prisma (AvailabilityDeclaration + enums)
- [x] Task 3: Lancer la migration `calendar_p2`
- [x] Task 4: Créer AvailabilityModule (module + controller + service + DTOs)
- [x] Task 5: Enregistrer AvailabilityModule dans AppModule
- [x] Task 6: Écrire les tests unitaires computeSlotStatus

## Dev Agent Record

### Implementation Plan

- Shared types: DaySlot, AvailKind, RecurKind, SlotStatus + AvailabilityDeclarationDto + CreateAvailabilityDto
- Prisma: ajout AvailabilityDeclaration model + 3 enums + index
- AvailabilityService: computeSlotStatus pure (déclarations pré-chargées, pas de SQL inside), getActiveDeclarations (1 SQL), CRUD (create/findMany/update/softDelete)
- Soft-delete = expiresAt set to now()
- GET /availability → WHERE expiresAt > now()
- computeSlotStatus: UNAVAILABLE wins > AVAILABLE explicit > positive inference in covered period > UNKNOWN

### Completion Notes

All 6 tasks completed. computeSlotStatus implemented as pure function (no DB access) operating
on pre-loaded declarations. Unit tests cover 7 cases from Story AC. Migration calendar_p2 run
via Docker. AvailabilityModule registered in AppModule.

## File List

- packages/shared/src/index.ts (modifié)
- apps/api/prisma/schema.prisma (modifié)
- apps/api/prisma/migrations/20260627_calendar_p2/ (généré par migration)
- apps/api/src/availability/availability.module.ts (nouveau)
- apps/api/src/availability/availability.service.ts (nouveau)
- apps/api/src/availability/availability.controller.ts (nouveau)
- apps/api/src/availability/dto/create-availability.dto.ts (nouveau)
- apps/api/src/availability/dto/update-availability.dto.ts (nouveau)
- apps/api/src/availability/availability.service.spec.ts (nouveau)
- apps/api/src/app.module.ts (modifié)

## Change Log

- 2026-06-27: Story 1.1 implémentée — AvailabilityModule backend complet + shared types + migration calendar_p2 + unit tests computeSlotStatus (7 cas)
