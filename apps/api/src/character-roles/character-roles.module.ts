import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { GameSystemModule } from '../game-systems/game-system.module';
import { CharacterRolesController } from './character-roles.controller';
import { CharacterRolesService } from './character-roles.service';

@Module({
  imports: [PartiesModule, GameSystemModule],
  controllers: [CharacterRolesController],
  providers: [CharacterRolesService],
})
export class CharacterRolesModule {}
