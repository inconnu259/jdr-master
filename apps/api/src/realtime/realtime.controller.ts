import { Controller, Param, Sse, UseGuards, type MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { PermissionService } from '../permissions/permission.service';
import { RealtimeEventsService, partieTopic, userTopic } from './realtime-events.service';

// Pas de préfixe de classe (contrairement aux autres controllers `parties/:id/...` du projet) :
// ce fichier portera aussi GET /users/me/events (Story 21.1), un préfixe distinct dans le même
// controller — chaque route déclare donc son chemin complet plutôt qu'un préfixe partagé
// (revue de code Story 18.2).
@UseGuards(AuthenticatedGuard)
@Controller()
export class RealtimeController {
  constructor(
    private readonly permissions: PermissionService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  @Sse('parties/:id/events')
  async partieEvents(
    @Param('id') id: string,
    @CurrentUser() user: AuthUser,
  ): Promise<Observable<MessageEvent>> {
    // AD-5 : même contrôle que le reste de l'API.
    await this.permissions.assert(user.id, 'PARTIE_READ', { partieId: id });
    return this.realtimeEvents.subscribe(partieTopic(id)).pipe(map(() => ({ data: {} })));
  }

  @Sse('users/me/events')
  userEvents(@CurrentUser() user: AuthUser): Observable<MessageEvent> {
    return this.realtimeEvents.subscribe(userTopic(user.id)).pipe(map(() => ({ data: {} })));
  }
}
