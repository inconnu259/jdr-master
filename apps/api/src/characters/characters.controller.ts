import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CharacterService } from './character.service';

@UseGuards(AuthenticatedGuard)
@Controller('characters')
export class CharactersController {
  constructor(private readonly characters: CharacterService) {}

  @Get(':id')
  findOne(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.characters.findOne(id, user.id);
  }
}
