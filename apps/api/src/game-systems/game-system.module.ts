import { Module } from '@nestjs/common';
import { PartiesModule } from '../parties/parties.module';
import { GameSystemController } from './game-system.controller';
import { PartieGameSystemController } from './partie-game-system.controller';
import { GameSystemService } from './game-system.service';

@Module({
  imports: [PartiesModule],
  controllers: [GameSystemController, PartieGameSystemController],
  providers: [GameSystemService],
  exports: [GameSystemService],
})
export class GameSystemModule {}
