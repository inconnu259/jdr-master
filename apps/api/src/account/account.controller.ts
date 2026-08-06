import { Body, Controller, Patch, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { AuthenticatedGuard } from '../auth/guards/authenticated.guard';
import { AccountService } from './account.service';
import { UpdateDisplayNameDto } from './dto/update-display-name.dto';
import { UpdateThemeDto } from './dto/update-theme.dto';

@UseGuards(AuthenticatedGuard)
@Controller('me')
export class AccountController {
  constructor(private readonly account: AccountService) {}

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
}
