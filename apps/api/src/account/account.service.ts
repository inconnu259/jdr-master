import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { AnnouncementDto, Theme } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { toDto as toAnnouncementDto } from '../announcements/announcements.service';
import { toAuthUser } from '../users/to-auth-user.util';
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
        include: { calendarLayers: true },
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
    return toAuthUser(user);
  }

  /** N'applique jamais le thème (AD-13) — lit/écrit uniquement la colonne. */
  async updateTheme(userId: string, theme: Theme) {
    let user;
    try {
      user = await this.prisma.user.update({
        where: { id: userId },
        data: { theme },
        include: { calendarLayers: true },
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
    return toAuthUser(user);
  }

  /** Patch partiel (Story 29.8) — seuls les champs fournis sont mis à jour, même route accueillera
   *  partiesViewMode/charactersSort/charactersViewMode (29.9) sans changer de forme.
   *  `defaultCalendarLayers` (Story 30.4) n'est PAS une colonne scalaire : un lot fourni (même
   *  vide, distinct d'absent) remplace atomiquement les lignes `UserCalendarLayer` existantes et
   *  pose `calendarLayersSetAt`, dans une transaction unique avec le reste des scalaires. */
  async updatePreferences(userId: string, dto: UpdatePreferencesDto) {
    const { defaultCalendarLayers, ...scalarDto } = dto;
    let user;
    try {
      if (defaultCalendarLayers !== undefined) {
        const uniqueKeys = [...new Set(defaultCalendarLayers)];
        const [, , updated] = await this.prisma.$transaction([
          this.prisma.userCalendarLayer.deleteMany({ where: { userId } }),
          this.prisma.userCalendarLayer.createMany({
            data: uniqueKeys.map((layerKey) => ({ userId, layerKey })),
          }),
          this.prisma.user.update({
            where: { id: userId },
            data: { ...scalarDto, calendarLayersSetAt: new Date() },
            include: { calendarLayers: true },
          }),
        ]);
        user = updated;
      } else {
        user = await this.prisma.user.update({
          where: { id: userId },
          data: { ...scalarDto },
          include: { calendarLayers: true },
        });
      }
    } catch (e) {
      // Revue de code : compte supprimé entre l'authentification et cet appel — dans la branche
      // `defaultCalendarLayers`, `userCalendarLayer.createMany()` peut échouer AVANT `user.update()`
      // avec une violation de contrainte FK (P2003) plutôt que P2025 ; les deux doivent aboutir au
      // même 404 propre, jamais un 500 brut.
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        (e.code === 'P2025' || e.code === 'P2003')
      ) {
        throw new NotFoundException('Compte introuvable');
      }
      throw e;
    }
    return toAuthUser(user);
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
