import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateEventDto, UpdateEventDto } from './dto/create-event.dto';
import { GroupEventsService } from './group-events.service';

/**
 * Événements d'un groupe de ralliement — les conjonctions (Stories 40.1 et 40.2).
 *
 * 🚨 La liste vit sur `GET /parties/:id/events/list` et non sur `GET /parties/:id/events` : ce
 * chemin appartient déjà au flux temps réel (SSE, `RealtimeController`), qu'il ne faut pas toucher.
 */
@UseGuards(AuthenticatedGuard)
@Controller()
export class EventsController {
  constructor(private readonly groupEvents: GroupEventsService) {}

  @Post('parties/:id/events')
  create(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateEventDto,
  ) {
    return this.groupEvents.create(partieId, user.id, dto);
  }

  @Get('parties/:id/events/list')
  list(@Param('id', ParseUUIDPipe) partieId: string, @CurrentUser() user: AuthUser) {
    return this.groupEvents.list(partieId, user.id);
  }

  /** Story 40.2 : l'hôte modifie sa conjonction (remplacement complet). */
  @Patch('parties/:id/events/:eventId')
  update(
    @Param('id', ParseUUIDPipe) partieId: string,
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: UpdateEventDto,
  ) {
    return this.groupEvents.update(partieId, eventId, user.id, dto);
  }
}
