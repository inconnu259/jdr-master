import { Controller, Get, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { HommeDragonService } from './homme-dragon.service';

/**
 * `GET /me/homme-dragons` (Story 33.5) : contrôleur dédié, distinct de `HommeDragonController`
 * (`parties/:id/homme-dragon`, scopé à une seule partie) — même patron que `MyCharactersController`.
 * Restreint aux Hommes Dragons de l'appelant, sur les parties dont il est MJ.
 */
@UseGuards(AuthenticatedGuard)
@Controller('me/homme-dragons')
export class MyHommeDragonsController {
  constructor(private readonly hommeDragon: HommeDragonService) {}

  @Get()
  findMine(@CurrentUser() user: AuthUser) {
    return this.hommeDragon.findMine(user.id);
  }
}
