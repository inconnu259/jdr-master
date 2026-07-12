import {
  Body,
  Controller,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ScenariosService } from './scenarios.service';
import { CreateScenarioDto } from './dto/create-scenario.dto';
import { UpdateScenarioDto } from './dto/update-scenario.dto';

@UseGuards(AuthenticatedGuard)
@Controller()
export class ScenariosController {
  constructor(private readonly scenarios: ScenariosService) {}

  @Post('parties/:id/scenarios')
  create(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateScenarioDto,
  ) {
    return this.scenarios.create(partieId, user.id, dto);
  }

  @Patch('scenarios/:id')
  update(
    @Param('id', ParseUUIDPipe) scenarioId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateScenarioDto,
  ) {
    return this.scenarios.update(scenarioId, user.id, dto);
  }
}
