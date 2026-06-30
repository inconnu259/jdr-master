import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { CastVoteDto } from './dto/cast-vote.dto';
import { ChooseDateDto } from './dto/choose-date.dto';
import { CreatePollDto } from './dto/create-poll.dto';
import { PollService } from './poll.service';

@UseGuards(AuthenticatedGuard)
@Controller('parties/:id/poll')
export class PollController {
  constructor(private readonly poll: PollService) {}

  @Post()
  create(
    @Param('id', ParseUUIDPipe) partieId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: CreatePollDto,
  ) {
    return this.poll.create(partieId, user.id, dto);
  }

  @Get()
  findOpen(@Param('id', ParseUUIDPipe) partieId: string, @CurrentUser() user: AuthUser) {
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
  choose(
    @Param('id', ParseUUIDPipe) partieId: string,
    @Param('pollId', ParseUUIDPipe) pollId: string,
    @CurrentUser() user: AuthUser,
    @Body() dto: ChooseDateDto,
  ) {
    return this.poll.choose(partieId, pollId, user.id, dto);
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
