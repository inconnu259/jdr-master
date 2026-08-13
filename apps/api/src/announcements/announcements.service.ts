import { Injectable, NotFoundException } from '@nestjs/common';
import type { AnnouncementDto } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import {
  RealtimeEventsService,
  partieTopic,
} from '../realtime/realtime-events.service';
import { CreateAnnouncementDto } from './dto/create-announcement.dto';

/** Exporté pour réutilisation par `AccountService.getUnseenAnnouncements()` (Story 29.13, AD-17 :
 *  extraction, jamais duplication). */
export function toDto(
  announcement: any,
  mj: { pseudo: string; displayName: string },
): AnnouncementDto {
  return {
    id: announcement.id,
    partieId: announcement.partieId,
    scenarioId: announcement.scenarioId,
    text: announcement.text,
    createdAt: announcement.createdAt.toISOString(),
    authorPseudo: mj.pseudo,
    authorDisplayName: mj.displayName,
  };
}

@Injectable()
export class AnnouncementsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
    private readonly scenarios: ScenariosService,
    private readonly realtimeEvents: RealtimeEventsService,
  ) {}

  async create(
    partieId: string,
    mjId: string,
    dto: CreateAnnouncementDto,
  ): Promise<AnnouncementDto> {
    await this.parties.getOwned(partieId, mjId);

    if (dto.scenarioId !== undefined) {
      await this.scenarios.verifyScenarioBelongsToPartie(
        dto.scenarioId,
        partieId,
      );
    }

    // L'auteur est toujours le MJ de la Partie (seul autorisé à publier, cf. getOwned ci-dessus) —
    // Announcement n'a aucune relation vers User, dérivé plutôt que stocké (AD-2, Story 28.2).
    // Résolu AVANT la création (revue de code 28.2) : un MJ introuvable échoue alors sans avoir rien
    // persisté, et l'émission temps réel reste immédiatement après le create — une requête glissée
    // entre les deux aurait laissé l'annonce écrite sans jamais notifier les autres membres.
    const mj = await this.prisma.user.findUnique({
      where: { id: mjId },
      select: { pseudo: true, displayName: true },
    });
    if (!mj) {
      throw new NotFoundException('MJ introuvable.');
    }

    const announcement = await this.prisma.announcement.create({
      data: {
        partieId,
        scenarioId: dto.scenarioId ?? null,
        text: dto.text,
      },
    });

    this.realtimeEvents.emit(partieTopic(partieId));
    return toDto(announcement, mj);
  }

  /** Story 9.2 (AD-9/AD-6) : lecture ouverte à tout membre (getViewable), retourne TOUTES les
   * annonces de la Partie sans filtrage de statut de scénario — l'anti-spoil (AC6) est un rendu
   * Angular conditionnel côté consommateur, jamais un filtrage serveur. */
  async findAll(partieId: string, userId: string): Promise<AnnouncementDto[]> {
    await this.parties.getViewable(partieId, userId);
    const announcements = await this.prisma.announcement.findMany({
      where: { partieId },
      orderBy: { createdAt: 'desc' },
      include: {
        partie: {
          select: { mj: { select: { pseudo: true, displayName: true } } },
        },
      },
    });
    return announcements.map((a) => toDto(a, a.partie.mj));
  }
}
