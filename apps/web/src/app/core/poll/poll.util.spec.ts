import type { PartieMemberDto, SessionPollDto } from '@master-jdr/shared';
import { getMissingVoters, getMissingVotersForOption, getRespondedCount } from './poll.util';

const members: PartieMemberDto[] = [
  { userId: 'u1', pseudo: 'Alice', email: 'alice@test.com', joinedAt: '' },
  { userId: 'u2', pseudo: 'Bob', email: 'bob@test.com', joinedAt: '' },
];

function makePoll(options: SessionPollDto['options']): SessionPollDto {
  return {
    id: 'poll1', partieId: 'p1', status: 'OPEN', scenarioRef: null,
    expiresAt: null, chosenDate: null, chosenSlot: null,
    options,
  };
}

describe('poll.util', () => {
  it('getMissingVoters : aucun manquant si tous ont voté sur toutes les options', () => {
    const poll = makePoll([
      { id: 'opt1', date: '2026-08-01T00:00:00.000Z', slot: 'MORNING',
        votes: [{ userId: 'u1', pseudo: 'Alice', answer: 'YES' }, { userId: 'u2', pseudo: 'Bob', answer: 'NO' }] },
    ]);
    expect(getMissingVoters(poll, members)).toEqual([]);
  });

  it('getMissingVoters : tous manquants si personne n\'a voté', () => {
    const poll = makePoll([
      { id: 'opt1', date: '2026-08-01T00:00:00.000Z', slot: 'MORNING', votes: [] },
    ]);
    expect(getMissingVoters(poll, members)).toEqual(members);
  });

  it('getMissingVoters : réponse partielle (1/2 options) → toujours manquant', () => {
    const poll = makePoll([
      { id: 'opt1', date: '2026-08-01T00:00:00.000Z', slot: 'MORNING',
        votes: [{ userId: 'u1', pseudo: 'Alice', answer: 'YES' }, { userId: 'u2', pseudo: 'Bob', answer: 'NO' }] },
      { id: 'opt2', date: '2026-08-08T00:00:00.000Z', slot: 'AFTERNOON',
        votes: [{ userId: 'u1', pseudo: 'Alice', answer: 'YES' }] },
    ]);
    expect(getMissingVoters(poll, members)).toEqual([members[1]]);
  });

  it('getMissingVoters : liste de membres vide → tableau vide', () => {
    const poll = makePoll([
      { id: 'opt1', date: '2026-08-01T00:00:00.000Z', slot: 'MORNING', votes: [] },
    ]);
    expect(getMissingVoters(poll, [])).toEqual([]);
  });

  it('getMissingVoters : poll sans options → aucun manquant', () => {
    const poll = makePoll([]);
    expect(getMissingVoters(poll, members)).toEqual([]);
  });

  it('getRespondedCount : reflète le nombre de membres ayant répondu', () => {
    const poll = makePoll([
      { id: 'opt1', date: '2026-08-01T00:00:00.000Z', slot: 'MORNING',
        votes: [{ userId: 'u1', pseudo: 'Alice', answer: 'YES' }] },
    ]);
    expect(getRespondedCount(poll, members)).toBe(1);
  });

  it('getMissingVotersForOption : ne considère que les votes de CETTE option (granularité par date)', () => {
    const opt1 = { id: 'opt1', date: '2026-08-01T00:00:00.000Z', slot: 'MORNING' as const,
      votes: [{ userId: 'u1', pseudo: 'Alice', answer: 'YES' as const }] };
    // Alice a voté sur opt1 → absente des manquants ; Bob n'a pas voté sur opt1 → présent
    expect(getMissingVotersForOption(opt1, members)).toEqual([members[1]]);
  });

  it('getMissingVotersForOption : aucun manquant si tous ont voté sur cette option précise', () => {
    const opt1 = { id: 'opt1', date: '2026-08-01T00:00:00.000Z', slot: 'MORNING' as const,
      votes: [
        { userId: 'u1', pseudo: 'Alice', answer: 'YES' as const },
        { userId: 'u2', pseudo: 'Bob', answer: 'NO' as const },
      ] };
    expect(getMissingVotersForOption(opt1, members)).toEqual([]);
  });

  it('getMissingVotersForOption : un membre ayant voté sur une AUTRE option mais pas celle-ci reste manquant ici', () => {
    // Bob a voté sur opt2 mais pas opt1 : pour opt1 spécifiquement, il doit être listé comme manquant
    const opt1 = { id: 'opt1', date: '2026-08-01T00:00:00.000Z', slot: 'MORNING' as const,
      votes: [{ userId: 'u1', pseudo: 'Alice', answer: 'YES' as const }] };
    expect(getMissingVotersForOption(opt1, members).map(m => m.userId)).toEqual(['u2']);
  });
});
