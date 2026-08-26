import { Injectable } from '@nestjs/common';
import type { PartieDto, PartySignalCode, PartySignalsDto } from '@master-jdr/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from './parties.service';

type OpenPollWithVotes = {
  partieId: string;
  options: { votes: { userId: string }[] }[];
};

/**
 * `GET /me/party-signals` (AD-3, Story 29.7) : dérive les 10 signaux de FR-12 pour toutes les
 * parties de l'utilisateur en un seul aller-retour par table concernée — jamais une requête par
 * partie. `role`/`status` sont lus tels quels depuis `PartiesService.listForUser()` (AD-8/AD-15,
 * Story 29.6), jamais redérivés ici.
 */
@Injectable()
export class PartySignalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly parties: PartiesService,
  ) {}

  async getSignals(userId: string): Promise<Record<string, PartySignalsDto>> {
    const [mjParties, playerParties] = await Promise.all([
      this.parties.listForUser(userId, 'mj'),
      this.parties.listForUser(userId, 'player'),
    ]);
    const mjPartieIds = mjParties.map((p) => p.id);
    const playerPartieIds = playerParties.map((p) => p.id);
    const allPartieIds = [...mjPartieIds, ...playerPartieIds];

    const [
      charactersOwned,
      hommeDragonsOwned,
      membershipCounts,
      courantScenarios,
      scenariosMissingResume,
      seancesMissingCompteRendu,
      openPolls,
    ] = await Promise.all([
      this.prisma.character.findMany({
        where: { userId, partieId: { in: playerPartieIds } },
        select: { partieId: true },
      }),
      this.prisma.hommeDragon.findMany({
        where: { userId, partieId: { in: mjPartieIds } },
        select: { partieId: true },
      }),
      this.prisma.membership.groupBy({
        by: ['partieId'],
        where: { partieId: { in: mjPartieIds } },
        _count: { _all: true },
      }),
      this.prisma.scenario.groupBy({
        by: ['partieId'],
        where: { partieId: { in: mjPartieIds }, status: 'COURANT' },
        _count: { _all: true },
      }),
      this.prisma.scenario.findMany({
        where: {
          partieId: { in: mjPartieIds },
          status: 'PASSE',
          resumeFin: null,
        },
        select: { partieId: true },
      }),
      // COMPTE_RENDU_NON_REDIGE : décision retenue (Dev Notes, story 29.7) — signal MJ-only, la
      // rédaction du compte-rendu (Seance.compteRendu) étant une action exclusivement MJ.
      this.prisma.seance.findMany({
        where: {
          compteRendu: null,
          scenario: { partieId: { in: mjPartieIds } },
          OR: [{ dateValidee: { not: null } }, { poll: { chosenDate: { not: null } } }],
        },
        select: { scenario: { select: { partieId: true } } },
      }),
      // Une seule requête groupée sert à la fois VOTE_EN_COURS_SANS_REPONSE (joueur, filtré sur
      // les votes de l'utilisateur) et AUCUNE_DATE_NI_VOTE (MJ, simple présence d'un poll OPEN).
      this.prisma.sessionPoll.findMany({
        where: { partieId: { in: allPartieIds }, status: 'OPEN' },
        select: {
          partieId: true,
          options: {
            select: { votes: { where: { userId }, select: { userId: true } } },
          },
        },
      }),
    ]);

    const characterPartieIds = new Set(charactersOwned.map((c) => c.partieId));
    const hommeDragonPartieIds = new Set(hommeDragonsOwned.map((h) => h.partieId));
    const partiesWithMembers = new Set(membershipCounts.map((m) => m.partieId));
    const partiesWithCourantScenario = new Set(courantScenarios.map((s) => s.partieId));
    const partiesMissingResume = new Set(scenariosMissingResume.map((s) => s.partieId));
    const partiesMissingCompteRendu = new Set(
      seancesMissingCompteRendu.map((s) => s.scenario.partieId),
    );
    const openPollsByPartie = new Map<string, OpenPollWithVotes[]>();
    for (const poll of openPolls as OpenPollWithVotes[]) {
      const list = openPollsByPartie.get(poll.partieId) ?? [];
      list.push(poll);
      openPollsByPartie.set(poll.partieId, list);
    }

    const now = Date.now();

    const computeSignals = (partie: PartieDto, role: 'mj' | 'player'): PartySignalCode[] => {
      const signals: PartySignalCode[] = [];
      // Deferred-work (2026-08-25) : `Partie.nextSessionDate` n'est jamais effacé après la date
      // passée (AD-3 interdit de le recalculer depuis les séances ici — c'est un champ matérialisé,
      // recalculé uniquement par `recalculateNextSession()` sur événement). Une date passée non
      // recalculée depuis désynchronise ces deux signaux si on la traite comme "connue" ; on la
      // lit donc comme absente ici, sans jamais réécrire le champ.
      const hasFutureSessionDate =
        !!partie.nextSessionDate && new Date(partie.nextSessionDate).getTime() > now;

      // AC5 : une partie clôturée ne porte jamais un signal d'action, seuls les signaux de fin
      // subsistent — appliqué en premier, avant toute autre dérivation. Les deux signaux de fin
      // sont MJ-only (garde explicite, revue de code) : `partiesMissingCompteRendu`/
      // `partiesMissingResume` ne sont dérivés que sur `mjPartieIds`, mais le rester même si ces
      // requêtes étaient un jour élargies à `allPartieIds`.
      if (partie.status === 'TERMINEE') {
        if (role === 'mj' && partiesMissingCompteRendu.has(partie.id))
          signals.push('COMPTE_RENDU_NON_REDIGE');
        if (role === 'mj' && partiesMissingResume.has(partie.id))
          signals.push('RAPPORT_FIN_MANQUANT');
        signals.push('PARTIE_TERMINEE');
        return signals;
      }

      if (role === 'player') {
        if (!characterPartieIds.has(partie.id)) signals.push('PERSONNAGE_A_CREER');
        const openPollsHere = openPollsByPartie.get(partie.id) ?? [];
        const hasUnanswered = openPollsHere.some((poll) =>
          poll.options.some((opt) => opt.votes.length === 0),
        );
        if (hasUnanswered) signals.push('VOTE_EN_COURS_SANS_REPONSE');
      } else {
        if (!hommeDragonPartieIds.has(partie.id)) signals.push('HOMME_DRAGON_A_CREER');
        if (!partiesWithMembers.has(partie.id)) signals.push('AUCUN_MEMBRE_INVITE');
        if (!partiesWithCourantScenario.has(partie.id)) signals.push('AUCUN_SCENARIO_EN_COURS');
        if (!hasFutureSessionDate && !openPollsByPartie.has(partie.id)) {
          signals.push('AUCUNE_DATE_NI_VOTE');
        }
        if (partiesMissingResume.has(partie.id)) signals.push('RAPPORT_FIN_MANQUANT');
        if (partiesMissingCompteRendu.has(partie.id)) signals.push('COMPTE_RENDU_NON_REDIGE');
      }

      if (hasFutureSessionDate) signals.push('PROCHAINE_SEANCE_CONNUE');
      return signals;
    };

    const result: Record<string, PartySignalsDto> = {};
    for (const p of mjParties) {
      result[p.id] = {
        role: 'mj',
        status: p.status,
        signals: computeSignals(p, 'mj'),
      };
    }
    for (const p of playerParties) {
      result[p.id] = {
        role: 'player',
        status: p.status,
        signals: computeSignals(p, 'player'),
      };
    }
    return result;
  }
}
