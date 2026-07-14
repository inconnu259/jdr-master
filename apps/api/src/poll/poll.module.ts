import { Module } from '@nestjs/common';
import { AvailabilityModule } from '../availability/availability.module';
import { PartiesModule } from '../parties/parties.module';
import { PollController } from './poll.controller';
import { PollService } from './poll.service';

@Module({
  imports: [PartiesModule, AvailabilityModule],
  controllers: [PollController],
  providers: [PollService],
  // Story 8.7 : ScenariosService orchestre la création d'un poll lié à une séance via
  // PollService.create() — export requis pour l'import cross-module depuis ScenariosModule.
  exports: [PollService],
})
export class PollModule {}
