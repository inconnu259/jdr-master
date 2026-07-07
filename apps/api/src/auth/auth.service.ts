import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from '../users/users.service';
import { InviteLinksService } from '../invitations/invite-links.service';
import { EmailService } from '../email/email.service';
import { RegisterDto } from './dto/register.dto';

const RESET_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // +24h (FR-6)

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly inviteLinks: InviteLinksService,
    private readonly email: EmailService,
  ) {}

  /** Vérifie les identifiants (email OU pseudo) ; renvoie l'utilisateur (sans le hash) ou null. */
  async validateUser(identifier: string, password: string) {
    const user = await this.users.findByEmailOrPseudo(identifier);
    if (!user) return null;

    let ok: boolean;
    try {
      ok = await argon2.verify(user.passwordHash, password);
    } catch {
      // `passwordHash` n'est pas un hash argon2 valide (ex. compte inséré manuellement en base
      // avec un mot de passe en clair) : traiter comme des identifiants invalides plutôt que de
      // laisser l'exception remonter en 500 (qui serait masquée en "identifiants invalides"
      // générique côté front de toute façon, mais sans le bon code HTTP).
      return null;
    }
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

  /**
   * Répond toujours { ok: true }, que l'adresse corresponde ou non à un compte (anti-énumération,
   * AC1) — les deux branches convergent vers le même retour final, pas de court-circuit anticipé.
   */
  async requestPasswordReset(email: string): Promise<{ ok: true }> {
    const user = await this.users.findByEmail(email);
    if (user) {
      const token = randomBytes(32).toString('base64url');
      await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      await this.email.sendMail('password-reset', user.email, {
        link: `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/reset-password/${token}`,
      });
    }
    return { ok: true };
  }

  /**
   * Message générique unique pour token inconnu/expiré/déjà utilisé (AC4) — ne distingue jamais
   * la cause. La réclamation du token (`updateMany` avec garde `WHERE`) est atomique, comme
   * `InviteLinksService.consumeLink` — protège contre la course entre deux requêtes concurrentes
   * utilisant le même token.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.passwordResetToken.updateMany({
        where: { token, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new NotFoundException(
          'Lien invalide ou expiré. Merci de refaire une demande.',
        );
      }
      const reset = await tx.passwordResetToken.findUniqueOrThrow({
        where: { token },
      });
      await tx.user.update({
        where: { id: reset.userId },
        data: { passwordHash },
      });
    });
  }
}
