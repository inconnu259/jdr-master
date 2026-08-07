import { Strategy } from 'passport-local';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';

// Stratégie Passport "local" : identifiant (email OU pseudo) + mot de passe.
// `usernameField: 'identifier'` indique à passport-local de lire le champ `identifier`
// (et non `username`) du body.
@Injectable()
export class LocalStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({ usernameField: 'identifier' });
  }

  async validate(identifier: string, password: string) {
    const user = await this.authService.validateUser(identifier, password);
    if (!user) {
      throw new UnauthorizedException();
    }
    // Story 28.6, AC3 : un compte restauré par rollbackEmailChange() ne peut se reconnecter
    // qu'après un reset de mot de passe (resetPassword() remet ce champ à false) — bloqué ici,
    // avant toute création de session (req.login() n'est jamais atteint).
    if (user.mustResetPassword) {
      throw new UnauthorizedException(
        'Une réinitialisation de mot de passe est requise avant de vous reconnecter.',
      );
    }
    return user; // attaché à req.user, puis sérialisé en session
  }
}
