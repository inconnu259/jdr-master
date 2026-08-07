import {
  Body,
  Controller,
  Get,
  Logger,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { RequestPasswordResetDto } from './dto/request-password-reset.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { ConfirmEmailChangeDto } from './dto/confirm-email-change.dto';
import { RollbackEmailChangeDto } from './dto/rollback-email-change.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthenticatedGuard } from './guards/authenticated.guard';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly auth: AuthService) {}

  // Route sensible (création de compte, non authentifiée) — même limite que forgot-password/
  // reset-password ci-dessous, ne doit jamais dépendre seule du plafond global (300/min, dimensionné
  // pour l'usage GET normal, cf. app.module.ts).
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // Le LocalAuthGuard valide email+mdp et ouvre la session ; on renvoie l'utilisateur.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  async login(@Req() req: Request) {
    await this.auth.recordSession(
      (req.user as { id: string }).id,
      req.sessionID,
    );
    return req.user;
  }

  @UseGuards(AuthenticatedGuard)
  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }

  @Post('logout')
  async logout(@Req() req: Request): Promise<{ ok: boolean }> {
    const sid = req.sessionID;
    await new Promise<void>((resolve, reject) =>
      req.logout((err) => (err ? reject(err) : resolve())),
    );
    // Best-effort : une erreur ici ne doit jamais empêcher la destruction de la session
    // (l'utilisateur doit toujours pouvoir se déconnecter, même si le nettoyage de l'index
    // UserSession échoue — cf. revue de code Story 15.2).
    try {
      await this.auth.forgetSession(sid);
    } catch (e) {
      this.logger.error(`Échec de forgetSession(${sid})`, e);
    }
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    return { ok: true };
  }

  // Routes publiques (utilisateur non connecté) — pas de guard, comme `register`.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('forgot-password')
  forgotPassword(@Body() dto: RequestPasswordResetDto) {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto.token, dto.newPassword);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('confirm-email-change')
  confirmEmailChange(@Body() dto: ConfirmEmailChangeDto) {
    return this.auth.confirmEmailChange(dto.token);
  }

  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Post('rollback-email-change')
  rollbackEmailChange(@Body() dto: RollbackEmailChangeDto) {
    return this.auth.rollbackEmailChange(dto.token);
  }
}
