import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { HommeDragonService } from './homme-dragon.service';
import { CreateHommeDragonDto } from './dto/create-homme-dragon.dto';
import { UpdateHommeDragonDto } from './dto/update-homme-dragon.dto';
import { ChooseEveilPowerDto } from './dto/choose-eveil-power.dto';

@UseGuards(AuthenticatedGuard)
@Controller('parties/:id/homme-dragon')
export class HommeDragonController {
  constructor(private readonly hommeDragon: HommeDragonService) {}

  @Post()
  create(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateHommeDragonDto,
  ) {
    return this.hommeDragon.create(partieId, user.id, dto);
  }

  @Get()
  findOne(@Param('id', ParseUUIDPipe) partieId: string, @CurrentUser() user: AuthUser) {
    return this.hommeDragon.findOne(partieId, user.id);
  }

  @Patch()
  update(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateHommeDragonDto,
  ) {
    return this.hommeDragon.update(partieId, user.id, dto);
  }

  @Post('eveil-power')
  chooseEveilPower(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChooseEveilPowerDto,
  ) {
    return this.hommeDragon.chooseEveilPower(partieId, user.id, dto);
  }
}
