import { Body, Controller, Delete, Get, Param, Patch, Put, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { AuthService } from '../auth/auth.service';
import { AccountService } from './account.service';
import { UpdateDisplayNameDto } from './dto/update-display-name.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { RequestEmailChangeDto } from './dto/request-email-change.dto';

@UseGuards(AuthenticatedGuard)
@Controller('me')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly auth: AuthService,
  ) {}

  @Patch('display-name')
  updateDisplayName(@Req() req: Request, @Body() dto: UpdateDisplayNameDto) {
    return this.account.updateDisplayName((req.user as { id: string }).id, dto.displayName);
  }

  @Patch('theme')
  updateTheme(@Req() req: Request, @Body() dto: UpdateThemeDto) {
    return this.account.updateTheme((req.user as { id: string }).id, dto.theme);
  }

  @Patch('preferences')
  updatePreferences(@Req() req: Request, @Body() dto: UpdatePreferencesDto) {
    return this.account.updatePreferences((req.user as { id: string }).id, dto);
  }

  @Put('favorites/:partieId')
  addFavorite(@Req() req: Request, @Param('partieId') partieId: string) {
    return this.account.addFavorite((req.user as { id: string }).id, partieId);
  }

  @Delete('favorites/:partieId')
  removeFavorite(@Req() req: Request, @Param('partieId') partieId: string) {
    return this.account.removeFavorite((req.user as { id: string }).id, partieId);
  }

  @Get('unseen-announcements')
  getUnseenAnnouncements(@Req() req: Request) {
    return this.account.getUnseenAnnouncements((req.user as { id: string }).id);
  }

  @Put('announcements-read/:announcementId')
  markAnnouncementRead(@Req() req: Request, @Param('announcementId') announcementId: string) {
    return this.account.markAnnouncementRead((req.user as { id: string }).id, announcementId);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Patch('password')
  changePassword(@Req() req: Request, @Body() dto: ChangePasswordDto) {
    return this.auth.changePassword(
      (req.user as { id: string }).id,
      dto.currentPassword,
      dto.newPassword,
      req.sessionID,
    );
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Patch('email')
  requestEmailChange(@Req() req: Request, @Body() dto: RequestEmailChangeDto) {
    return this.auth.requestEmailChange(
      (req.user as { id: string }).id,
      dto.currentPassword,
      dto.newEmail,
    );
  }
}
