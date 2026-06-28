import { ConflictException, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { InviteLinksService } from '../invitations/invite-links.service';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly inviteLinks: InviteLinksService,
  ) {}

  /** Vérifie les identifiants ; renvoie l'utilisateur (sans le hash) ou null. */
  async validateUser(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user) return null;
    const ok = await argon2.verify(user.passwordHash, password);
    if (!ok) return null;
    const { passwordHash, ...safe } = user;
    return safe;
  }

  // Inscription **sur invitation** (spec §2) : un token de lien valide est requis ; le compte créé
  // est rattaché à la partie du lien dans la même transaction (compte + Membership atomiques).
  async register(dto: RegisterDto) {
    try {
      const passwordHash = await argon2.hash(dto.password);
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: { email: dto.email, pseudo: dto.pseudo, passwordHash },
        });
        await this.inviteLinks.consumeLink(tx, dto.token, user.id);
        const { passwordHash: _hash, ...safe } = user;
        return safe;
      });
    } catch (e: unknown) {
      // Email OU pseudo déjà pris → contrainte d'unicité (Prisma P2002) → 409 propre.
      // On teste le `code` (plus robuste que `instanceof` avec le driver adapter Prisma 7).
      const err = e as { code?: string };
      if (err?.code === 'P2002') {
        // Le driver adapter Prisma 7 ne fiabilise pas `meta.target` → message générique.
        throw new ConflictException(
          'Cet e-mail ou ce pseudo est déjà utilisé.',
        );
      }
      throw e;
    }
  }
}
