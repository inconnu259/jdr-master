import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Theme } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
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
}
