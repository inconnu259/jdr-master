import type { PartieMemberDto, PollOptionDto, SessionPollDto } from '@master-jdr/shared';

/** Membres n'ayant pas répondu à TOUTES les options du poll (a répondu = a voté sur chaque option). */
export function getMissingVoters(poll: SessionPollDto, members: PartieMemberDto[]): PartieMemberDto[] {
  return members.filter(m =>
    !poll.options.every(opt => opt.votes.some(v => v.userId === m.userId)),
  );
}

export function getRespondedCount(poll: SessionPollDto, members: PartieMemberDto[]): number {
  return members.length - getMissingVoters(poll, members).length;
}

/** Membres n'ayant pas voté sur CETTE option précise (granularité par date, pas globale). */
export function getMissingVotersForOption(opt: PollOptionDto, members: PartieMemberDto[]): PartieMemberDto[] {
  return members.filter(m => !opt.votes.some(v => v.userId === m.userId));
}
