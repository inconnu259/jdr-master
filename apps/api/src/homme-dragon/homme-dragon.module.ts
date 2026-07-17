import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { GameSystemModule } from '../game-systems/game-system.module';
import { ScenariosModule } from '../scenarios/scenarios.module';
import { HommeDragonController } from './homme-dragon.controller';
import { HommeDragonService } from './homme-dragon.service';

@Module({
  // Story 10.2 (AD-3) : ScenariosModule pour l'historique des scénarios PASSE — import à sens
  // unique, ScenariosModule n'a besoin de rien en retour, aucun forwardRef nécessaire (même
  // situation que AnnouncementsModule → ScenariosModule, Story 9.1).
  imports: [PartiesModule, GameSystemModule, ScenariosModule],
  controllers: [HommeDragonController],
  providers: [HommeDragonService],
  exports: [HommeDragonService],
})
export class HommeDragonModule {}
