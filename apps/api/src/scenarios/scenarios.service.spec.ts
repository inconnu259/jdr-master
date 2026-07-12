import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { ScenariosService } from './scenarios.service';

function makePrisma() {
  return {
    scenario: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
  };
}

function makeParties() {
  return { getOwned: jest.fn() };
}

describe('ScenariosService', () => {
  let service: ScenariosService;
  let prisma: ReturnType<typeof makePrisma>;
  let parties: ReturnType<typeof makeParties>;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = makePrisma();
    parties = makeParties();
    const module = await Test.createTestingModule({
      providers: [
        ScenariosService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
      ],
    }).compile();
    service = module.get(ScenariosService);
  });

  describe('create()', () => {
    it('crée un scénario BROUILLON rattaché à la Partie (AC1)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.create.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        title: 'Le Marché aux Ombres',
        description: null,
        status: 'BROUILLON',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });

      const result = await service.create('p1', 'mj1', {
        title: 'Le Marché aux Ombres',
      });

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.scenario.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            partieId: 'p1',
            title: 'Le Marché aux Ombres',
            status: 'BROUILLON',
          }),
        }),
      );
      expect(result.status).toBe('BROUILLON');
      expect(result.id).toBe('s1');
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture (AC2)', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.create('p1', 'stranger', { title: 'Test' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.scenario.create).not.toHaveBeenCalled();
    });

    it('Partie ONE_SHOT → rejet, aucune écriture (FR-1 : un seul scénario, jamais créé manuellement)', async () => {
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'ONE_SHOT',
      });

      await expect(
        service.create('p1', 'mj1', { title: 'Second scénario' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.scenario.create).not.toHaveBeenCalled();
    });

    it('Partie CAMPAGNE_LINEAIRE → autorisée (pas de restriction de kind)', async () => {
      parties.getOwned.mockResolvedValue({
        id: 'p1',
        mjId: 'mj1',
        kind: 'CAMPAGNE_LINEAIRE',
      });
      prisma.scenario.create.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        title: 'Chapitre 1',
        description: null,
        status: 'BROUILLON',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });

      const result = await service.create('p1', 'mj1', {
        title: 'Chapitre 1',
      });
      expect(result.status).toBe('BROUILLON');
    });

    it('plusieurs créations indépendantes créent chacune un BROUILLON, sans contrainte d’ordre (AC6)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.create
        .mockResolvedValueOnce({
          id: 's1',
          partieId: 'p1',
          title: 'A',
          description: null,
          status: 'BROUILLON',
          dureeHeures: null,
          dureeSeances: null,
          resumeFin: null,
          createdAt: new Date('2026-07-12T00:00:00.000Z'),
          closedAt: null,
        })
        .mockResolvedValueOnce({
          id: 's2',
          partieId: 'p1',
          title: 'B',
          description: null,
          status: 'BROUILLON',
          dureeHeures: null,
          dureeSeances: null,
          resumeFin: null,
          createdAt: new Date('2026-07-12T00:00:00.000Z'),
          closedAt: null,
        });

      const first = await service.create('p1', 'mj1', { title: 'A' });
      const second = await service.create('p1', 'mj1', { title: 'B' });

      expect(first.status).toBe('BROUILLON');
      expect(second.status).toBe('BROUILLON');
      expect(prisma.scenario.create).toHaveBeenCalledTimes(2);
    });
  });

  describe('update()', () => {
    it('édite un scénario hors PASSE (AC4)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      prisma.scenario.update.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        title: 'Nouveau titre',
        description: null,
        status: 'A_VENIR',
        dureeHeures: null,
        dureeSeances: null,
        resumeFin: null,
        createdAt: new Date('2026-07-12T00:00:00.000Z'),
        closedAt: null,
      });

      const result = await service.update('s1', 'mj1', {
        title: 'Nouveau titre',
      });

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(prisma.scenario.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 's1' },
          data: expect.objectContaining({ title: 'Nouveau titre' }),
        }),
      );
      expect(result.title).toBe('Nouveau titre');
    });

    it('scénario PASSE → rejet, aucune écriture (AC5)', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        status: 'PASSE',
      });
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

      await expect(
        service.update('s1', 'mj1', { description: 'nouvelle description' }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.scenario.update).not.toHaveBeenCalled();
    });

    it('non-MJ → 403 propagé par getOwned, aucune écriture', async () => {
      prisma.scenario.findUnique.mockResolvedValue({
        id: 's1',
        partieId: 'p1',
        status: 'A_VENIR',
      });
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.update('s1', 'stranger', { title: 'X' }),
      ).rejects.toThrow(ForbiddenException);
      expect(prisma.scenario.update).not.toHaveBeenCalled();
    });
  });
});
