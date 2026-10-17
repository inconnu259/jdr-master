import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CreateEventDto } from './dto/create-event.dto';
import { GroupEventsService } from './group-events.service';

/**
 * Événements d'un groupe de ralliement — les conjonctions (Story 40.1).
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
}
