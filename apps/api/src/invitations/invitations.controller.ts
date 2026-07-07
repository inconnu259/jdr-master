import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import type { AuthUser } from '@master-jdr/shared';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { CurrentUser } from '../common/current-user.decorator';
import { InvitationsService } from './invitations.service';
import { CreateInvitationDto } from './dto/create-invitation.dto';
import { InviteByEmailDto } from './dto/invite-by-email.dto';

@UseGuards(AuthenticatedGuard)
@Controller()
export class InvitationsController {
  constructor(private readonly invitations: InvitationsService) {}

  @Post('parties/:id/invitations')
  invite(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: CreateInvitationDto,
  ) {
    return this.invitations.invite(id, user.id, dto.inviteeUserId);
  }

  @Post('parties/:id/invitations/by-email')
  inviteByEmail(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: InviteByEmailDto,
  ) {
    return this.invitations.inviteByEmail(id, user.id, dto.email);
  }

  @Get('parties/:id/invitations')
  listForPartie(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invitations.listForPartie(id, user.id);
  }

  @Get('invitations')
  received(@CurrentUser() user: AuthUser) {
    return this.invitations.listReceived(user.id);
  }

  @Post('invitations/:id/accept')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invitations.accept(id, user.id);
  }

  @Post('invitations/:id/decline')
  decline(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invitations.decline(id, user.id);
  }

  @Delete('invitations/:id')
  revoke(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.invitations.revoke(id, user.id);
  }
}
