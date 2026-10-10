import { Module } from '@nestjs/common';
import { EventsService } from './events.service';

/**
 * Événement de base, séances et inscriptions (Story 37.3, couche 2 « rassemblement »).
 * N'importe aucun module métier — seuls `PrismaService` et `RealtimeEventsService` (globaux) sont
 * injectés — pour que `PartiesModule` (couche 2) comme `ScenariosModule` (couche 3) puissent
 * l'importer sans cycle.
 */
@Module({
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
