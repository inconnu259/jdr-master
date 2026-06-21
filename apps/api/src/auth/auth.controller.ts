import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LocalAuthGuard } from './guards/local-auth.guard';
import { AuthenticatedGuard } from './guards/authenticated.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto);
  }

  // Le LocalAuthGuard valide email+mdp et ouvre la session ; on renvoie l'utilisateur.
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @UseGuards(LocalAuthGuard)
  @Post('login')
  login(@Req() req: Request) {
    return req.user;
  }

  @UseGuards(AuthenticatedGuard)
  @Get('me')
  me(@Req() req: Request) {
    return req.user;
  }

  @Post('logout')
  async logout(@Req() req: Request): Promise<{ ok: boolean }> {
    await new Promise<void>((resolve, reject) =>
      req.logout((err) => (err ? reject(err) : resolve())),
    );
    await new Promise<void>((resolve) => req.session.destroy(() => resolve()));
    return { ok: true };
  }
}
