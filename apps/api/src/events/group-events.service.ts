import { BadRequestException, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import type { EventCardDto } from '@master-jdr/shared';
import {
  PermissionService,
  RALLIEMENT_UNAVAILABLE_MESSAGE,
} from '../permissions/permission.service';
import {
  PARTIE_SIGNALS_PORT,
  type PartieSignalsPort,
} from '../poll/ports/partie-signals.port';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService } from './events.service';

/** Refus d'une clé de jour bien formée mais inexistante au calendrier (ex. `2026-02-31`). */
export const INVALID_DAY_MESSAGE = "Cette date n'existe pas";
/** Refus d'un jour passé : aujourd'hui est accepté. */
export const PAST_DAY_MESSAGE = 'La date ne peut pas être passée';

/** Clé `YYYY-MM-DD` du jour courant en UTC — même convention que le calendrier
 *  (`EventsService.recomputeNextSession` compare au début du jour courant en UTC). */
function todayKeyUtc(now: Date = new Date()): string {
  return now.toISOString().substring(0, 10);
}

/** Minuit UTC du jour `dayKey`, ou `null` si la clé ne désigne pas un vrai jour du calendrier. */
function parseDayKey(dayKey: string): Date | null {
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toISOString().substring(0, 10) === dayKey ? date : null;
}

/** Texte saisi nettoyé : espaces de bord retirés, chaîne vide → `null`. */
function cleaned(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/**
 * Événements d'un groupe de ralliement — les conjonctions (Story 40.1, epic 40).
 *
 * Orchestration côté ralliement de `EventsService` (écrivain unique d'`Event`/`Seance`) : décision du
 * droit (`PermissionService.assert`, seul décideur), garde de nature (un groupe
 * `CAMPAGNE_EPISODIQUE` seulement — la rencontre isolée relève de l'epic 41), règles de saisie
 * (jour réel, jamais passé), puis signaux après validation.
 *
 * Service distinct d'`EventsService` pour une raison de graphe : `PartiesService` dépend
 * d'`EventsService`, et le port des signaux (`PARTIE_SIGNALS_PORT`) EST `PartiesService`. Injecter le
 * port dans `EventsService` créerait un cycle de fournisseurs ; ce service-ci n'est requis par
 * personne d'autre que le contrôleur.
 */
@Injectable()
export class GroupEventsService {
  constructor(
    private readonly permissions: PermissionService,
    private readonly events: EventsService,
    @Inject(PARTIE_SIGNALS_PORT) private readonly partieSignals: PartieSignalsPort,
  ) {}

  /**
   * Un membre du groupe propose une conjonction à date fixée, dont il est l'hôte (immuable).
   * L'événement et sa séance datée unique sont écrits dans UNE transaction (`EventsService.create`,
   * qui recalcule aussi la prochaine date de la partie et émet `partie:{id}` après validation) ;
   * la liste d'accueil des membres (statut, prochaine date) est ensuite prévenue.
   */
  async create(partieId: string, userId: string, dto: CreateEventDto): Promise<EventCardDto> {
    const grant = await this.permissions.assert(userId, 'EVENT_CREATE', { partieId });
    // La cellule de politique vaut pour toute la famille : la rencontre isolée (un seul événement,
    // créé avec elle) n'accueille pas de nouvelle conjonction.
    if (grant.partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      throw new ForbiddenException(RALLIEMENT_UNAVAILABLE_MESSAGE);
    }

    const date = parseDayKey(dto.date);
    if (!date) throw new BadRequestException(INVALID_DAY_MESSAGE);
    // Comparaison de clés de jour (UTC) : aujourd'hui est accepté, quel que soit le créneau.
    if (dto.date < todayKeyUtc()) throw new BadRequestException(PAST_DAY_MESSAGE);

    const { event } = await this.events.createHosted(grant, userId, {
      title: dto.title.trim(),
      seance: {
        date,
        slot: dto.slot,
        lieu: cleaned(dto.lieu),
        heureRdv: cleaned(dto.heureRdv),
        notePratique: cleaned(dto.notePratique),
        capacity: dto.capacity ?? null,
      },
    });
    // Après validation et après `partie:{id}` (émis par `EventsService.create`) ; ne lève jamais.
    await this.partieSignals.notifyChanged(grant.partieId);

    const [card] = await this.events.listCards(grant, [event.id]);
    return card;
  }

  /** Les conjonctions du groupe, passées comprises — tout membre du groupe les lit. */
  async list(partieId: string, userId: string): Promise<EventCardDto[]> {
    const grant = await this.permissions.assert(userId, 'EVENT_LIST', { partieId });
    return this.events.listCards(grant);
  }
}
