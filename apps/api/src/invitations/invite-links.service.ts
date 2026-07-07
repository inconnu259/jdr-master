import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { InviteLink, Prisma } from '@prisma/client';
import type { InviteLinkPreviewDto } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { CreateInviteLinkDto } from './dto/create-invite-link.dto';

const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000; // +7 jours

@Injectable()
export class InviteLinksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
  ) {}

  /** Le MJ génère un lien d'invitation pour SA partie. */
  async create(partieId: string, mjId: string, dto: CreateInviteLinkDto) {
    await this.parties.getOwned(partieId, mjId);
    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + DEFAULT_TTL_MS);
    if (expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException(
        "La date d'expiration doit être dans le futur.",
      );
    }
    const token = randomBytes(32).toString('base64url');
    return this.prisma.inviteLink.create({
      data: {
        token,
        partieId,
        createdById: mjId,
        maxUses: dto.maxUses ?? null,
        expiresAt,
      },
    });
  }

  /** Liens d'une partie (vue MJ). */
  async listForPartie(partieId: string, mjId: string) {
    await this.parties.getOwned(partieId, mjId);
    return this.prisma.inviteLink.findMany({
      where: { partieId },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Le MJ révoque un lien. */
  async revoke(linkId: string, userId: string) {
    const link = await this.prisma.inviteLink.findUnique({
      where: { id: linkId },
    });
    if (!link) throw new NotFoundException('Lien introuvable');
    await this.parties.getOwned(link.partieId, userId); // MJ uniquement
    await this.prisma.inviteLink.update({
      where: { id: linkId },
      data: { revoked: true },
    });
    return { ok: true };
  }

  /** Prévisualisation publique (sans session) : ne révèle que le nom + le système. */
  async preview(token: string): Promise<InviteLinkPreviewDto> {
    const link = await this.prisma.inviteLink.findUnique({
      where: { token },
      include: { partie: { select: { name: true, gameSystemId: true } } },
    });
    if (!link) throw new NotFoundException('Lien introuvable');
    const { valid, reason } = this.linkStatus(link);
    return {
      partieName: link.partie.name,
      gameSystemId: link.partie.gameSystemId,
      valid,
      reason,
    };
  }

  /** Un utilisateur connecté rejoint une partie via un lien. */
  async join(token: string, userId: string) {
    const link = await this.prisma.$transaction((tx) =>
      this.consumeLink(tx, token, userId),
    );
    return { ok: true, partieId: link.partieId };
  }

  /**
   * Consomme un lien dans une transaction : valide, crée le `Membership`, incrémente `usesCount`.
   * Réutilisé par `join` (utilisateur existant) **et** par l'inscription (`AuthService.register`).
   * L'incrément conditionnel (`updateMany` + quota dans le `WHERE`) protège contre la course sur `maxUses`.
   */
  async consumeLink(
    tx: Prisma.TransactionClient,
    token: string,
    userId: string,
  ): Promise<InviteLink> {
    const link = await tx.inviteLink.findUnique({
      where: { token },
      include: { partie: { select: { mjId: true } } },
    });
    if (!link) throw new NotFoundException('Lien invalide');
    const status = this.linkStatus(link);
    if (!status.valid) throw new ForbiddenException(status.reason);
    if (link.partie.mjId === userId) {
      throw new ConflictException('Vous êtes déjà le MJ de cette partie.');
    }
    const existing = await tx.membership.findUnique({
      where: { userId_partieId: { userId, partieId: link.partieId } },
    });
    if (existing)
      throw new ConflictException('Vous êtes déjà membre de cette partie.');

    const claim = await tx.inviteLink.updateMany({
      where: {
        id: link.id,
        revoked: false,
        expiresAt: { gt: new Date() },
        ...(link.maxUses != null ? { usesCount: { lt: link.maxUses } } : {}),
      },
      data: { usesCount: { increment: 1 } },
    });
    if (claim.count === 0)
      throw new ForbiddenException('Lien invalide ou quota atteint.');

    await tx.membership.create({ data: { userId, partieId: link.partieId } });
    return link;
  }

  /**
   * Retrouve un lien valide déjà émis pour cette adresse sur cette partie, ou en crée un
   * nouveau (usage unique). Dédoublonnage pour l'invitation par e-mail (Story 5.2, FR-3) —
   * ne vérifie pas le rôle MJ ici, délégué à l'appelant (`InvitationsService.inviteByEmail`).
   */
  async findOrCreateForEmail(
    partieId: string,
    mjId: string,
    email: string,
  ): Promise<InviteLink> {
    const existing = await this.prisma.inviteLink.findFirst({
      where: {
        partieId,
        targetEmail: email,
        revoked: false,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return existing;

    const token = randomBytes(32).toString('base64url');
    return this.prisma.inviteLink.create({
      data: {
        token,
        partieId,
        createdById: mjId,
        maxUses: 1,
        targetEmail: email,
        expiresAt: new Date(Date.now() + DEFAULT_TTL_MS),
      },
    });
  }

  /** État de validité d'un lien (révoqué / expiré / quota). */
  private linkStatus(
    link: Pick<InviteLink, 'revoked' | 'expiresAt' | 'maxUses' | 'usesCount'>,
  ): {
    valid: boolean;
    reason?: string;
  } {
    if (link.revoked) return { valid: false, reason: 'Lien révoqué.' };
    if (link.expiresAt.getTime() <= Date.now())
      return { valid: false, reason: 'Lien expiré.' };
    if (link.maxUses != null && link.usesCount >= link.maxUses) {
      return { valid: false, reason: "Nombre maximum d'utilisations atteint." };
    }
    return { valid: true };
  }
}
