import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { PartiesService } from './parties.service';
import { CreatePartieDto } from './dto/create-partie.dto';
import { GetAvailableSlotsDto } from './dto/get-available-slots.dto';
import { GetHeatmapDto } from './dto/get-heatmap.dto';
import { UpdatePartieDto } from './dto/update-partie.dto';

@UseGuards(AuthenticatedGuard) // toutes les routes /parties exigent une session
@Controller('parties')
export class PartiesController {
  constructor(private readonly parties: PartiesService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreatePartieDto) {
    return this.parties.create(user.id, dto);
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('role') role?: string) {
    return this.parties.listForUser(
      user.id,
      role === 'player' ? 'player' : 'mj',
    );
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parties.getViewable(id, user.id);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parties.listMembers(id, user.id);
  }

  @Get(':id/available-slots')
  getAvailableSlots(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() q: GetAvailableSlotsDto,
  ) {
    return this.parties.getAvailableSlots(id, user.id, q.weeks ?? 8);
  }

  @Get(':id/heatmap')
  getHeatmap(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Query() q: GetHeatmapDto,
  ) {
    return this.parties.getHeatmap(id, user.id, q.from, q.to);
  }

  @Delete(':id/members/:userId')
  removeMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') targetUserId: string,
  ) {
    return this.parties.removeMember(id, user.id, targetUserId);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdatePartieDto,
  ) {
    return this.parties.update(id, user.id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.parties.remove(id, user.id);
  }
}
