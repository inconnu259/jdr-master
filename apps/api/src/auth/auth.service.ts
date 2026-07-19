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
const RESET_TOKEN_INVALID_MESSAGE =
  'Lien invalide ou expiré. Merci de refaire une demande.';

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
   * Crée l'index inverse UserSession — appelé juste après req.login() (AuthController.login).
   * `upsert` (pas `create`) : `sid` est `@unique` (Story 15.2, revue de code) — un appel en double
   * pour le même sessionID (retry client) est idempotent plutôt que de lever une erreur P2002.
   */
  async recordSession(userId: string, sid: string): Promise<void> {
    await this.prisma.userSession.upsert({
      where: { sid },
      create: { userId, sid },
      update: { userId },
    });
  }

  /**
   * Supprime l'index inverse UserSession — appelé juste avant req.session.destroy()
   * (AuthController.logout). `deleteMany` (pas `delete`) : idempotent, ne lève pas si la ligne
   * n'existe déjà plus.
   */
  async forgetSession(sid: string): Promise<void> {
    await this.prisma.userSession.deleteMany({ where: { sid } });
  }

  /**
   * Répond toujours { ok: true }, que l'adresse corresponde ou non à un compte (anti-énumération,
   * AC1) — les deux branches convergent vers le même retour final, pas de court-circuit anticipé.
   */
  async requestPasswordReset(email: string): Promise<{ ok: true }> {
    const user = await this.users.findByEmail(email);
    if (user) {
      // Le secret est l'unique donnée capable de prouver la possession du lien ; jamais stocké
      // tel quel (AD-4) — seul son hash argon2 va en base. `id` (retourné par `create()`) sert de
      // clé de recherche publique côté vérification, un hash argon2 n'étant pas indexable.
      const secret = randomBytes(32).toString('base64url');
      const tokenHash = await argon2.hash(secret);
      const created = await this.prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
        },
      });
      await this.email.sendMail('password-reset', user.email, {
        link: `${process.env.WEB_ORIGIN ?? 'http://localhost:4200'}/reset-password/${created.id}.${secret}`,
      });
    }
    return { ok: true };
  }

  /**
   * Message générique unique pour token malformé/inconnu/expiré/déjà utilisé/secret invalide —
   * ne distingue jamais la cause côté appelant.
   *
   * Le secret doit être vérifié (`argon2.verify`) **avant** la réclamation atomique (`updateMany`) :
   * inverser l'ordre brûlerait le token légitime de l'utilisateur dès qu'une tentative avec un
   * mauvais secret sur un `id` valide serait soumise, l'empêchant de réutiliser son propre lien.
   *
   * Le hachage (`argon2.verify`/`argon2.hash`, CPU-bound) reste hors de la transaction Prisma —
   * seule la réclamation atomique du token et la mise à jour du mot de passe (les deux opérations
   * qui doivent rester ensemble) sont transactionnelles, pour ne pas tenir une connexion DB
   * pendant tout le temps de calcul du hachage.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const separatorIndex = token.indexOf('.');
    if (separatorIndex <= 0 || separatorIndex === token.length - 1) {
      throw new NotFoundException(RESET_TOKEN_INVALID_MESSAGE);
    }
    const id = token.slice(0, separatorIndex);
    const secret = token.slice(separatorIndex + 1);

    const record = await this.prisma.passwordResetToken.findUnique({
      where: { id },
    });
    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new NotFoundException(RESET_TOKEN_INVALID_MESSAGE);
    }

    let valid: boolean;
    try {
      valid = await argon2.verify(record.tokenHash, secret);
    } catch {
      valid = false;
    }
    if (!valid) {
      throw new NotFoundException(RESET_TOKEN_INVALID_MESSAGE);
    }

    const passwordHash = await argon2.hash(newPassword);

    await this.prisma.$transaction(async (tx) => {
      const claim = await tx.passwordResetToken.updateMany({
        where: { id, usedAt: null, expiresAt: { gt: new Date() } },
        data: { usedAt: new Date() },
      });
      if (claim.count === 0) {
        throw new NotFoundException(RESET_TOKEN_INVALID_MESSAGE);
      }

      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash },
      });

      // Invalidation des sessions actives (AD-3, FR-11) : les deux tables (Session, gérée par
      // connect-pg-simple, et UserSession, notre index inverse) doivent rester synchronisées —
      // une session supprimée d'un côté sans l'autre serait soit un fantôme soit non révoquée.
      const activeSessions = await tx.userSession.findMany({
        where: { userId: record.userId },
        select: { sid: true },
      });
      const sids = activeSessions.map((s) => s.sid);
      await tx.session.deleteMany({ where: { sid: { in: sids } } });
      await tx.userSession.deleteMany({ where: { userId: record.userId } });
    });
  }
}
