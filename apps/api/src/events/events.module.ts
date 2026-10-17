import { Module } from '@nestjs/common';
import { PermissionsModule } from '../permissions/permissions.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { GroupEventsService } from './group-events.service';

/**
 * Événement de base, séances et inscriptions (Story 37.3, couche 2 « rassemblement »).
 * N'importe aucun module métier — seuls `PrismaService` et `RealtimeEventsService` (globaux) sont
 * injectés — pour que `PartiesModule` (couche 2) comme `ScenariosModule` (couche 3) puissent
 * l'importer sans cycle.
 *
 * Story 40.1 : les conjonctions d'un groupe (`EventsController` → `GroupEventsService`) ajoutent
 * `PermissionsModule` (transverse, sans module métier) et le port des signaux de partie
 * (`PARTIE_SIGNALS_PORT`, fourni par le `PortsModule` global) — jamais `PartiesModule`/
 * `PartiesService`, qui importe ce module.
 *
 * Story 40.3 : `GroupEventsService` est exporté — les routes d'inscription partagées avec le JDR
 * (`scenarios/seances/:id/inscription`) y délèguent la branche « groupe ».
 */
@Module({
  imports: [PermissionsModule],
  controllers: [EventsController],
  providers: [EventsService, GroupEventsService],
  exports: [EventsService, GroupEventsService],
})
export class EventsModule {}
