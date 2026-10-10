import { Module, forwardRef } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { EventsModule } from '../events/events.module';
import { PartiesModule } from '../parties/parties.module';
import { PermissionsModule } from '../permissions/permissions.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { PollController } from './poll.controller';
import { PollService } from './poll.service';

@Module({
  // Story 8.8 : forwardRef nécessaire — ScenariosModule importe déjà PollModule (Story 8.7) ;
  // PollController a maintenant besoin de ScenariosService.recalculateNextSession() après
  // PollService.choose() (P2-AD-2 : PollService lui-même reste générique, c'est le contrôleur qui
  // orchestre l'appel cross-module, pas le service).
  // Story 37.4 : EventsModule (couche 2) pour écrire la plage de la séance au choix d'une date —
  // import temporaire couche 1 → couche 2, remplacé par un port en 37.8 (aucun cycle : EventsModule
  // n'importe rien).
  // Story 37.6 : PermissionsModule (transverse) décide des droits sur la partie.
  imports: [
    PartiesModule,
    PermissionsModule,
    AvailabilityModule,
    EventsModule,
    forwardRef(() => ScenariosModule),
  ],
  controllers: [PollController],
  providers: [PollService],
  // Story 8.7 : ScenariosService orchestre la création d'un poll lié à une séance via
  // PollService.create() — export requis pour l'import cross-module depuis ScenariosModule.
  exports: [PollService],
})
export class PollModule {}
