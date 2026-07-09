import {
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';

// `CharacterService` (importé ci-dessous comme token DI) importe `@master-jdr/game-rules`
// (module ESM) — le mocker évite l'échec de transform Jest, même pattern que
// `character.service.spec.ts`.
jest.mock('@master-jdr/game-rules', () => ({
  validate: jest.fn(),
  computeDerived: jest.fn(),
  levelForXp: jest.fn(),
  pendingLevels: jest.fn(),
}));

import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { CharacterService } from '../characters/character.service';
import { XpDistributionsService } from './xp-distributions.service';

function makePrisma() {
  return {
    character: { findMany: jest.fn() },
    xpDistribution: { create: jest.fn(), findMany: jest.fn() },
  };
}

function makeParties() {
  return { getOwned: jest.fn() };
}

function makeCharacters() {
  return { applyXpDelta: jest.fn().mockResolvedValue(undefined) };
}

describe('XpDistributionsService', () => {
  let service: XpDistributionsService;
  let prisma: ReturnType<typeof makePrisma>;
  let parties: ReturnType<typeof makeParties>;
  let characters: ReturnType<typeof makeCharacters>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = makePrisma();
    parties = makeParties();
    characters = makeCharacters();
    const module = await Test.createTestingModule({
      providers: [
        XpDistributionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
        { provide: CharacterService, useValue: characters },
      ],
    }).compile();
    service = module.get(XpDistributionsService);
  });

  describe('createDistribution()', () => {
    it('non-MJ → 403 (getOwned rejette), aucune écriture', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.createDistribution('p1', 'stranger', {
          entries: [{ characterId: 'c1', amount: 100 }],
        }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.xpDistribution.create).not.toHaveBeenCalled();
    });

    it("characterId n'appartenant pas à la Partie → 400, aucune écriture, applyXpDelta jamais appelé", async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.character.findMany.mockResolvedValue([
        { id: 'c1', partieId: 'p1' },
        { id: 'c2', partieId: 'AUTRE_PARTIE' },
      ]);

      await expect(
        service.createDistribution('p1', 'mj1', {
          entries: [
            { characterId: 'c1', amount: 100 },
            { characterId: 'c2', amount: 50 },
          ],
        }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.xpDistribution.create).not.toHaveBeenCalled();
      expect(characters.applyXpDelta).toHaveBeenCalledTimes(0);
    });

    it('succès → crée la distribution et appelle applyXpDelta une fois par entrée', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.character.findMany.mockResolvedValue([
        { id: 'c1', partieId: 'p1' },
        { id: 'c2', partieId: 'p1' },
      ]);
      prisma.xpDistribution.create.mockResolvedValue({
        id: 'd1',
        partieId: 'p1',
        note: 'Bien joué',
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        entries: [
          { characterId: 'c1', amount: 250, isBonus: false },
          { characterId: 'c2', amount: 50, isBonus: true },
        ],
      });

      const result = await service.createDistribution('p1', 'mj1', {
        entries: [
          { characterId: 'c1', amount: 250 },
          { characterId: 'c2', amount: 50, isBonus: true },
        ],
        note: 'Bien joué',
      });

      expect(prisma.xpDistribution.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            partieId: 'p1',
            mjId: 'mj1',
            note: 'Bien joué',
          }),
        }),
      );
      expect(characters.applyXpDelta).toHaveBeenCalledWith('c1', 250);
      expect(characters.applyXpDelta).toHaveBeenCalledWith('c2', 50);
      expect(characters.applyXpDelta).toHaveBeenCalledTimes(2);
      expect(result.id).toBe('d1');
      expect(result.entries).toHaveLength(2);
    });

    it('montant + bonus du même personnage agrégés en un seul appel applyXpDelta (évite un double e-mail level-up)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.character.findMany.mockResolvedValue([
        { id: 'c1', partieId: 'p1' },
      ]);
      prisma.xpDistribution.create.mockResolvedValue({
        id: 'd1',
        partieId: 'p1',
        note: undefined,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        entries: [
          { characterId: 'c1', amount: 250, isBonus: false },
          { characterId: 'c1', amount: 50, isBonus: true },
        ],
      });

      await service.createDistribution('p1', 'mj1', {
        entries: [
          { characterId: 'c1', amount: 250 },
          { characterId: 'c1', amount: 50, isBonus: true },
        ],
      });

      expect(characters.applyXpDelta).toHaveBeenCalledTimes(1);
      expect(characters.applyXpDelta).toHaveBeenCalledWith('c1', 300);
    });

    it('un échec isolé de applyXpDelta est loggé et n’interrompt pas les increments restants', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.character.findMany.mockResolvedValue([
        { id: 'c1', partieId: 'p1' },
        { id: 'c2', partieId: 'p1' },
      ]);
      prisma.xpDistribution.create.mockResolvedValue({
        id: 'd1',
        partieId: 'p1',
        note: undefined,
        createdAt: new Date('2026-07-01T00:00:00.000Z'),
        entries: [
          { characterId: 'c1', amount: 100, isBonus: false },
          { characterId: 'c2', amount: 100, isBonus: false },
        ],
      });
      characters.applyXpDelta.mockRejectedValueOnce(
        new Error('personnage supprimé'),
      );
      const loggerSpy = jest
        .spyOn(Logger.prototype, 'error')
        .mockImplementation(() => undefined);

      const result = await service.createDistribution('p1', 'mj1', {
        entries: [
          { characterId: 'c1', amount: 100 },
          { characterId: 'c2', amount: 100 },
        ],
      });

      expect(characters.applyXpDelta).toHaveBeenCalledTimes(2);
      expect(loggerSpy).toHaveBeenCalled();
      expect(result.id).toBe('d1'); // la distribution reste créée malgré l'échec partiel

      loggerSpy.mockRestore();
    });
  });

  describe('listForPartie()', () => {
    it('non-MJ → 403', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());
      await expect(service.listForPartie('p1', 'stranger')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('trie par createdAt desc (délégué à Prisma orderBy)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.xpDistribution.findMany.mockResolvedValue([]);

      await service.listForPartie('p1', 'mj1');

      expect(prisma.xpDistribution.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { partieId: 'p1' },
          orderBy: { createdAt: 'desc' },
        }),
      );
    });
  });
});
