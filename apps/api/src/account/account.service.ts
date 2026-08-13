import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnnouncementDto, Theme } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toDto as toAnnouncementDto } from '../announcements/announcements.service';
import { UpdatePreferencesDto } from './dto/update-preferences.dto';

@Injectable()
export class AccountService {
  constructor(private readonly prisma: PrismaService) {}

  async updateDisplayName(userId: string, displayName: string) {
    let user;
    try {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { displayName },
      });
    } catch (e) {
      // Session référant un compte supprimé entre-temps (cas normalement impossible en usage
      // courant) — jamais un 500 brut, même pattern que resolveScenarioOrThrow().
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Compte introuvable');
      }
      throw e;
    }
    const { passwordHash, ...safe } = user;
    return safe;
  }

  /** N'applique jamais le thème (AD-13) — lit/écrit uniquement la colonne. */
  async updateTheme(userId: string, theme: Theme) {
    let user;
    try {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { theme },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Compte introuvable');
      }
      throw e;
    }
    const { passwordHash, ...safe } = user;
    return safe;
  }

  /** Patch partiel (Story 29.8) — seuls les champs fournis sont mis à jour, même route accueillera
   *  partiesViewMode/charactersSort/charactersViewMode (29.9) sans changer de forme. */
  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    let user;
    try {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { ...dto },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2025'
      ) {
        throw new NotFoundException('Compte introuvable');
      }
      throw e;
    }
    const { passwordHash, ...safe } = user;
    return safe;
  }

  /** Idempotent (sémantique PUT) : un favori déjà posé n'est jamais une erreur (P2002 absorbé).
   *  Aucune vérification d'appartenance à la partie — un favori sur une partie non visible par
   *  l'utilisateur n'a aucun effet observable (listForUser() ne liste que ses propres parties). */
  async addFavorite(userId: string, partieId: string): Promise<{ ok: true }> {
    try {
      await this.prisma.partieFavorite.create({ data: { userId, partieId } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') return { ok: true };
        if (e.code === 'P2003')
          throw new NotFoundException('Partie introuvable');
      }
      throw e;
    }
    return { ok: true };
  }

  /** Idempotent par nature (`deleteMany` ne lève jamais si 0 ligne). */
  async removeFavorite(
    userId: string,
    partieId: string,
  ): Promise<{ ok: true }> {
    await this.prisma.partieFavorite.deleteMany({
      where: { userId, partieId },
    });
    return { ok: true };
  }

  /** Agrégation batchée sur toutes les parties de l'utilisateur (AD-3, jamais de fan-out par
   *  partie, cf. l'anti-pattern d'OpenPollsService). `toDto` réutilisé depuis AnnouncementsService
   *  (AD-17 : extraction, jamais duplication). */
  async getUnseenAnnouncements(userId: string): Promise<AnnouncementDto[]> {
    const announcements = await this.prisma.announcement.findMany({
      where: {
        partie: {
          OR: [{ mjId: userId }, { memberships: { some: { userId } } }],
        },
        reads: { none: { userId } },
      },
      orderBy: { createdAt: 'desc' },
      include: {
        partie: {
          select: { mj: { select: { pseudo: true, displayName: true } } },
        },
      },
    });
    return announcements.map((a) => toAnnouncementDto(a, a.partie.mj));
  }

  /** Idempotent (sémantique PUT), même pattern que addFavorite(). */
  async markAnnouncementRead(
    userId: string,
    announcementId: string,
  ): Promise<{ ok: true }> {
    try {
      await this.prisma.announcementRead.create({
        data: { userId, announcementId },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError) {
        if (e.code === 'P2002') return { ok: true };
        if (e.code === 'P2003')
          throw new NotFoundException('Annonce introuvable');
      }
      throw e;
    }
    return { ok: true };
  }
}
