import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { GameSystemService } from './game-system.service';

@UseGuards(AuthenticatedGuard)
@Controller('game-systems')
export class GameSystemController {
  constructor(private readonly gameSystems: GameSystemService) {}

  @Get()
  findAll() {
    return this.gameSystems.findAll();
  }

  @Get(':id/schema')
  getSchema(@Param('id') id: string) {
    return this.gameSystems.getSchema(id);
  }
}
