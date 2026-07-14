import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
  forwardRef,
} from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { ScenariosService } from '../scenarios/scenarios.service';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChooseDateDto } from './dto/choose-date.dto';
import { PollService } from './poll.service';

@UseGuards(AuthenticatedGuard)
@Controller('parties/:id/poll')
export class PollController {
  private readonly logger = new Logger(PollController.name);

  constructor(
    private readonly poll: PollService,
    // Story 8.8 : P2-AD-2 — PollService reste générique, c'est le contrôleur qui orchestre l'appel
    // cross-module vers ScenariosService.recalculateNextSession() après un choix de date.
    @Inject(forwardRef(() => ScenariosService))
    private readonly scenarios: ScenariosService,
  ) {}

  // Story 8.8 (Décision 2, revue de code) : la route générique de création de poll est retirée —
  // sans la fermeture auto de l'existant (Décision 2), un appel direct pouvait créer un nombre
  // illimité de SessionPoll orphelins, jamais liés à une Séance, invisibles et jamais nettoyés.
  // PollService.create() reste appelé en interne par ScenariosService.createSeancePoll() (Story
  // 8.7) — un vote de date exige désormais toujours un lien vers une Séance.

  @Get()
  findOpen(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.poll.findOpen(partieId, user.id);
  }

  @Post(':pollId/vote')
  castVote(
    @Param('id', ParseUUIDPipe) partieId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CastVoteDto,
  ) {
    return this.poll.castVote(partieId, pollId, user.id, dto);
  }

  @Patch(':pollId/choose')
  async choose(
    @Param('id', ParseUUIDPipe) partieId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChooseDateDto,
  ) {
    await this.poll.choose(partieId, pollId, user.id, dto);
    // Story 8.8 (Décision 2) : recalcule Partie.nextSessionDate/nextSessionSlot comme la date la
    // plus proche parmi toutes les séances actives — un choose() isolé ne peut plus poser
    // directement sa propre date, plusieurs votes pouvant être actifs en parallèle sur la Partie.
    // Revue de code : le choix de date est déjà committé à ce stade — un échec du recalcul (best
    // effort) ne doit pas remonter une 500 pour une action qui a en réalité réussi.
    try {
      await this.scenarios.recalculateNextSession(partieId);
    } catch (err) {
      this.logger.error(
        `recalculateNextSession a échoué après choose() sur poll ${pollId} (partie ${partieId})`,
        err instanceof Error ? err.stack : err,
      );
    }
  }

  @Delete(':pollId')
  close(
    @Param('id', ParseUUIDPipe) partieId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.poll.close(partieId, pollId, user.id);
  }
}
