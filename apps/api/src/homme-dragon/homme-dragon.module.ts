import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { GameSystemModule } from '../game-systems/game-system.module';
import { HommeDragonController } from './homme-dragon.controller';
import { HommeDragonService } from './homme-dragon.service';

@Module({
  // AD-1 : import PartiesModule (accès/rôle) + GameSystemModule (catalogue hommeDragonArtefact)
  // seuls pour cette story. ScenariosModule (lecture seule, historique/niveau) est différé aux
  // Stories 10.2/10.3 — aucun usage tant que ces stories n'existent pas.
  imports: [PartiesModule, GameSystemModule],
  controllers: [HommeDragonController],
  providers: [HommeDragonService],
  exports: [HommeDragonService],
})
export class HommeDragonModule {}
