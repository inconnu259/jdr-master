import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { UsersService } from '../users/users.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(private readonly users: UsersService) {}

  /** Vérifie les identifiants ; renvoie l'utilisateur (sans le hash) ou null. */
  async validateUser(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) return null;
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  }

  // NOTE palier 1a : inscription ouverte pour tester le flux.
  // En 1c, elle exigera un token de lien d'invitation (inscription sur invitation).
  async register(dto: RegisterDto) {
    try {
      const user = await this.users.create(dto);
      const { passwordHash, ...safe } = user;
      return safe;
    } catch (e: unknown) {
      // Email OU pseudo déjà pris → contrainte d'unicité (Prisma P2002) → 409 propre.
      // On teste le `code` (plus robuste que `instanceof` avec le driver adapter Prisma 7).
      const err = e as { code?: string };
      if (err?.code === 'P2002') {
        // Le driver adapter Prisma 7 ne fiabilise pas `meta.target` → message générique.
        throw new ConflictException('Cet e-mail ou ce pseudo est déjà utilisé.');
      }
      throw e;
    }
  }
}
