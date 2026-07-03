import { Module } from '@nestjs/common';
import { GameSystemController } from './game-system.controller';
import { GameSystemService } from './game-system.service';

@Module({
  controllers: [GameSystemController],
  providers: [GameSystemService],
  exports: [GameSystemService],
})
export class GameSystemModule {}
