import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { CharacterModule } from '../characters/character.module';
import { ScenariosController } from './scenarios.controller';
import { ScenariosService } from './scenarios.service';

@Module({
  // AD-11 : lecture seule de CharacterService pour agréger retrospectiveNotes (Story 8.6) —
  // jamais d'accès Prisma direct à CharacterNote depuis ScenariosModule.
  imports: [PartiesModule, CharacterModule],
  controllers: [ScenariosController],
  providers: [ScenariosService],
  exports: [ScenariosService],
})
export class ScenariosModule {}
