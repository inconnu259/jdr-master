import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { CharacterModule } from '../characters/character.module';
import { PollModule } from '../poll/poll.module';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

@Module({
  // AD-11 : lecture seule de CharacterService pour agréger retrospectiveNotes (Story 8.6) —
  // jamais d'accès Prisma direct à CharacterNote depuis ScenariosModule.
  // Story 8.7 : PollModule importé pour orchestrer createSeancePoll() (PollService.create()
  // appelé tel quel, CreatePollDto inchangé — P2-AD-2).
  imports: [PartiesModule, CharacterModule, PollModule],
  controllers: [ScenariosController],
  providers: [ScenariosService],
  exports: [ScenariosService],
})
export class ScenariosModule {}
