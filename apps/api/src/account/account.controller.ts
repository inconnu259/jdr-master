import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { AuthService } from '../auth/auth.service';
import { AccountService } from './account.service';
import { UpdateDisplayNameDto } from './dto/update-display-name.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';
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
  updateDisplayName(
    @Req() req: Request,
    @Body() dto: UpdateDisplayNameDto,
  ) {
    return this.account.updateDisplayName(
      (req.user as { id: string }).id,
      dto.displayName,
    );
  }

  @Patch('theme')
  updateTheme(@Req() req: Request, @Body() dto: UpdateThemeDto) {
    return this.account.updateTheme(
      (req.user as { id: string }).id,
      dto.theme,
    );
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
