import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { GameSystemModule } from '../game-systems/game-system.module';
import { UsersModule } from '../users/users.module';
import { CharactersController } from './characters.controller';
import { PartieCharactersController } from './partie-characters.controller';
import { CharacterService } from './character.service';
import { RyuutamaPdfService } from './ryuutama-pdf.service';

@Module({
  imports: [PartiesModule, GameSystemModule, UsersModule],
  controllers: [CharactersController, PartieCharactersController],
  providers: [CharacterService, RyuutamaPdfService],
})
export class CharacterModule {}
