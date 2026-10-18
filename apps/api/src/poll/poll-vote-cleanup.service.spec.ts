import { PollVoteCleanupService } from './poll-vote-cleanup.service';

describe('PollVoteCleanupService — départ du groupe (Story 40.8)', () => {
  it('supprime les réponses de la personne sur les sondages OUVERTS de la partie seulement', async () => {
    const tx = { pollVote: { deleteMany: jest.fn().mockResolvedValue({ count: 4 }) } };
    await expect(
      new PollVoteCleanupService().removeOpenVotesInTx(tx as never, 'p1', 'u1'),
    ).resolves.toBe(4);
    expect(tx.pollVote.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u1', poll: { partieId: 'p1', status: 'OPEN' } },
    });
  });
});
