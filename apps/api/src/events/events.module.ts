import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { PollModule } from '../poll/poll.module';
import { EventsController } from './events.controller';
import { EventsService } from './events.service';
import { GroupEventsService } from './group-events.service';
import { GroupPollChoiceService } from './group-poll-choice.service';

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
 * Story 40.4 : `EmailModule` (transverse) envoie l'e-mail « une place vous est réservée » après le commit.
 *
 * Story 40.5 : `PollModule` (couche 1) — `GroupEventsService` fait écrire le sondage d'une conjonction par
 * `PollService`, dans la transaction de l'événement. `PollModule` n'importe jamais `events/` (ports).
 *
 * Story 40.6 : `GroupPollChoiceService` (fixer la date d'une conjonction) est exporté pour `PortsModule`,
 * qui le lie à `GroupPollChoosePort` — il dépend de `PermissionsModule` et `EmailModule`, jamais de `poll/`.
 *
 * Story 40.3 : `GroupEventsService` est exporté — les routes d'inscription partagées avec le JDR
 * (`scenarios/seances/:id/inscription`) y délèguent la branche « groupe ».
 */
@Module({
  imports: [PermissionsModule, EmailModule, PollModule],
  controllers: [EventsController],
  providers: [EventsService, GroupEventsService, GroupPollChoiceService],
  exports: [EventsService, GroupEventsService, GroupPollChoiceService],
})
export class EventsModule {}
