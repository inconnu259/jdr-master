import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { CharactersController } from './characters.controller';
import { PartieCharactersController } from './partie-characters.controller';
import { CharacterService } from './character.service';

@Module({
  imports: [PartiesModule],
  controllers: [CharactersController, PartieCharactersController],
  providers: [CharacterService],
})
export class CharacterModule {}
