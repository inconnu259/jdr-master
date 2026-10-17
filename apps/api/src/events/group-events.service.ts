import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { EventCardDto, UpdateEventDto } from '@master-jdr/shared';
import {
  PermissionService,
  RALLIEMENT_UNAVAILABLE_MESSAGE,
  type PartieGrant,
} from '../permissions/permission.service';
import { PARTIE_SIGNALS_PORT, type PartieSignalsPort } from '../poll/ports/partie-signals.port';
import { parseDayKey, todayKeyUtc } from './day-key';
import { CreateEventDto } from './dto/create-event.dto';
import { EventsService, type EventSeanceInput } from './events.service';

/** Refus d'une clé de jour bien formée mais inexistante au calendrier (ex. `2026-02-31`). */
export const INVALID_DAY_MESSAGE = "Cette date n'existe pas";
/** Refus d'un jour passé : aujourd'hui est accepté. */
export const PAST_DAY_MESSAGE = 'La date ne peut pas être passée';

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

    const seance = this.seanceInput(dto);

    const { event } = await this.events.createHosted(grant, userId, {
      title: dto.title.trim(),
      seance,
    });
    // Après validation et après `partie:{id}` (émis par `EventsService.create`) ; ne lève jamais.
    await this.partieSignals.notifyChanged(grant.partieId);

    const [card] = await this.events.listCards(grant, [event.id]);
    return card;
  }

  /**
   * Story 40.2 : l'hôte corrige sa conjonction à venir — remplacement complet (mêmes champs et mêmes
   * règles que la création, l'hôte est immuable). Le droit est décidé par `PermissionService` sur
   * la cible `{ eventId }` (cellule de rôle + « hôte de l'événement ») ; la partie est celle de
   * l'événement, jamais celle de la route : une route de la partie A ne touche pas l'événement de B
   * (404). Le refus d'une conjonction passée, de la capacité sous les participants actuels et
   * l'écriture elle-même (verrou de l'événement) sont dans `EventsService.updateHosted`.
   */
  async update(
    partieId: string,
    eventId: string,
    userId: string,
    dto: UpdateEventDto,
  ): Promise<EventCardDto> {
    const grant = await this.permissions.assert(userId, 'EVENT_UPDATE', { eventId });
    if (grant.partieId !== partieId) throw new NotFoundException('Conjonction introuvable');
    if (grant.partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      throw new ForbiddenException(RALLIEMENT_UNAVAILABLE_MESSAGE);
    }

    await this.events.updateHosted(grant, eventId, {
      title: dto.title.trim(),
      seance: this.seanceInput(dto),
    });
    // Après validation et après `partie:{id}` (émis par `EventsService.updateHosted`) ; ne lève jamais.
    await this.partieSignals.notifyChanged(grant.partieId);

    const [card] = await this.events.listCards(grant, [eventId]);
    return card;
  }

  /**
   * Story 40.3 : un membre s'inscrit à une conjonction (route partagée avec le JDR,
   * `POST scenarios/seances/:id/inscription`, branche « groupe »). Le droit `SEANCE_INSCRIBE` est
   * décidé par l'appelant, qui a déjà résolu la partie DEPUIS la séance (jamais depuis la route) et
   * choisit cette branche selon la famille ; la rencontre isolée (`ONE_SHOT`) est refusée comme en 40.1
   * et 40.2. Les règles et le verrou de l'événement sont dans `EventsService.inscrireConjonction`.
   * Renvoie la carte à jour.
   */
  async inscrire(grant: PartieGrant, userId: string): Promise<EventCardDto> {
    const seanceId = this.seanceOf(grant);
    await this.events.inscrireConjonction(grant, seanceId, userId);
    return this.afterRosterChange(grant);
  }

  /** Story 40.3 : se désinscrire d'une conjonction (`DELETE scenarios/seances/:id/inscription`, branche
   *  « groupe »). Même cadre que `inscrire`. Renvoie la carte à jour. */
  async desinscrire(grant: PartieGrant, userId: string): Promise<EventCardDto> {
    const seanceId = this.seanceOf(grant);
    await this.events.desinscrireConjonction(grant, seanceId, userId);
    return this.afterRosterChange(grant);
  }

  /** Séance visée par l'autorisation ; garde de nature (un groupe `CAMPAGNE_EPISODIQUE` seulement). */
  private seanceOf(grant: PartieGrant): string {
    if (grant.partie.kind !== 'CAMPAGNE_EPISODIQUE') {
      throw new ForbiddenException(RALLIEMENT_UNAVAILABLE_MESSAGE);
    }
    const seanceId = grant.target.seanceId;
    if (!seanceId) throw new NotFoundException('Séance introuvable');
    return seanceId;
  }

  /** Après l'écriture validée (et après `partie:{id}`, émis par `EventsService`) : la liste d'accueil
   *  (« mes conjonctions », statut) est prévenue — ne lève jamais —, puis la carte à jour. */
  private async afterRosterChange(grant: PartieGrant): Promise<EventCardDto> {
    await this.partieSignals.notifyChanged(grant.partieId);
    const [card] = await this.events.listCards(grant, [grant.target.eventId!]);
    return card;
  }

  /** Règles de saisie d'une conjonction (création et modification) : jour réel, jamais passé
   *  (aujourd'hui accepté, clés de jour UTC), textes nettoyés, capacité `null` = tous les membres. */
  private seanceInput(dto: CreateEventDto): EventSeanceInput {
    const date = parseDayKey(dto.date);
    if (!date) throw new BadRequestException(INVALID_DAY_MESSAGE);
    // Comparaison de clés de jour (UTC) : aujourd'hui est accepté, quel que soit le créneau.
    if (dto.date < todayKeyUtc()) throw new BadRequestException(PAST_DAY_MESSAGE);
    return {
      date,
      slot: dto.slot,
      lieu: cleaned(dto.lieu),
      heureRdv: cleaned(dto.heureRdv),
      notePratique: cleaned(dto.notePratique),
      capacity: dto.capacity ?? null,
    };
  }

  /** Les conjonctions du groupe, passées comprises — tout membre du groupe les lit. */
  async list(partieId: string, userId: string): Promise<EventCardDto[]> {
    const grant = await this.permissions.assert(userId, 'EVENT_LIST', { partieId });
    return this.events.listCards(grant);
  }
}
