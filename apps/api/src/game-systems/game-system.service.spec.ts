import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

import { readFile } from 'node:fs/promises';
import { GameSystemService } from './game-system.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';

function makePrisma() {
  return {
    gameSystem: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      upsert: jest.fn(),
    },
    contentType: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    contentEntry: {
      upsert: jest.fn(),
    },
  };
}

function makePartiesService() {
  return {
    getOwned: jest.fn(),
    getViewable: jest.fn(),
  };
}

describe('GameSystemService', () => {
  let service: GameSystemService;
  let prisma: ReturnType<typeof makePrisma>;
  let parties: ReturnType<typeof makePartiesService>;
  const mockReadFile = readFile as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = makePrisma();
    parties = makePartiesService();
    const module = await Test.createTestingModule({
      providers: [
        GameSystemService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
      ],
    }).compile();
    service = module.get(GameSystemService);
  });

  it('getContent("ryuutama") → retourne le contenu groupé par clé de ContentType', async () => {
    prisma.contentType.findMany.mockResolvedValue([
      {
        key: 'class',
        entries: [
          { key: 'artisan', data: { label: 'Artisan' } },
          { key: 'chasseur', data: { label: 'Chasseur' } },
        ],
      },
      {
        key: 'weaponCategory',
        entries: [{ key: 'arc', data: { label: 'Arc' } }],
      },
    ]);

    const result = await service.getContent('ryuutama');

    expect(result).toEqual({
      class: [
        { key: 'artisan', data: { label: 'Artisan' } },
        { key: 'chasseur', data: { label: 'Chasseur' } },
      ],
      weaponCategory: [{ key: 'arc', data: { label: 'Arc' } }],
    });
    expect(prisma.contentType.findMany).toHaveBeenCalledWith({
      where: { gameSystemId: 'ryuutama' },
      include: { entries: { where: { scope: 'BASE' } } },
    });
  });

  it('getContent("unknown") → NotFoundException', async () => {
    await expect(service.getContent('unknown')).rejects.toThrow(
      NotFoundException,
    );
    expect(prisma.contentType.findMany).not.toHaveBeenCalled();
  });

  it('getContent() en cache après le premier appel → un seul aller-retour DB pour plusieurs appels', async () => {
    prisma.contentType.findMany.mockResolvedValue([
      { key: 'class', entries: [{ key: 'chasseur', data: {} }] },
    ]);

    const first = await service.getContent('ryuutama');
    const second = await service.getContent('ryuutama');

    expect(prisma.contentType.findMany).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });

  describe('getSchema', () => {
    it('"ryuutama" présent en base → retourne le schéma', async () => {
      prisma.gameSystem.findUnique.mockResolvedValue({
        id: 'ryuutama',
        name: 'Ryuutama',
        version: '1.0.0',
      });
      const schema = await service.getSchema('ryuutama');
      expect(schema.sheetSchema).toBeDefined();
      expect(prisma.gameSystem.findUnique).toHaveBeenCalledWith({
        where: { id: 'ryuutama' },
      });
    });

    it('id absent de la base → NotFoundException "introuvable" (distinct du cas ci-dessous)', async () => {
      prisma.gameSystem.findUnique.mockResolvedValue(null);
      await expect(service.getSchema('ryuutama')).rejects.toThrow(
        'Système de jeu introuvable',
      );
    });

    it('id présent en base mais aucun schéma codé → NotFoundException "aucun schéma implémenté" (pas confondu avec "introuvable")', async () => {
      prisma.gameSystem.findUnique.mockResolvedValue({
        id: 'conte-de-minuit',
        name: 'Conte de Minuit',
        version: '1.0.0',
      });
      await expect(service.getSchema('conte-de-minuit')).rejects.toThrow(
        'Aucun schéma implémenté pour ce système de jeu',
      );
    });
  });

  describe('getAssetFile', () => {
    beforeEach(() => {
      mockReadFile.mockResolvedValue(Buffer.from('pdf-bytes'));
    });

    it('clé "member" (journal) + membre viewable → fichier retourné, getViewable appelé (pas getOwned)', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

      const result = await service.getAssetFile('p1', 'ryuutama', 'journal', 'u1');

      expect(parties.getViewable).toHaveBeenCalledWith('p1', 'u1');
      expect(parties.getOwned).not.toHaveBeenCalled();
      expect(result).toEqual(Buffer.from('pdf-bytes'));
    });

    it('clé "member" (carte) + non-membre → l\'erreur de getViewable est propagée', async () => {
      parties.getViewable.mockRejectedValue(new ForbiddenException());

      await expect(
        service.getAssetFile('p1', 'ryuutama', 'carte', 'stranger'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('clé "mj" (monde) + MJ → fichier retourné, getOwned appelé (pas getViewable)', async () => {
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

      const result = await service.getAssetFile('p1', 'ryuutama', 'monde', 'mj1');

      expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
      expect(parties.getViewable).not.toHaveBeenCalled();
      expect(result).toEqual(Buffer.from('pdf-bytes'));
    });

    it('clé "mj" (structure) + joueur non-MJ → l\'erreur de getOwned est propagée', async () => {
      parties.getOwned.mockRejectedValue(new ForbiddenException());

      await expect(
        service.getAssetFile('p1', 'ryuutama', 'structure', 'player1'),
      ).rejects.toThrow(ForbiddenException);
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('clé inconnue → NotFoundException explicite, aucune vérification d\'accès déclenchée', async () => {
      await expect(
        service.getAssetFile('p1', 'ryuutama', 'inexistante', 'u1'),
      ).rejects.toThrow('Fiche introuvable');
      expect(parties.getViewable).not.toHaveBeenCalled();
      expect(parties.getOwned).not.toHaveBeenCalled();
    });

    it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
      'clé "%s" (propriété héritée d\'Object) → NotFoundException explicite, jamais un crash ni un accès accordé (revue de code)',
      async (key) => {
        await expect(
          service.getAssetFile('p1', 'ryuutama', key, 'u1'),
        ).rejects.toThrow('Fiche introuvable');
        expect(parties.getViewable).not.toHaveBeenCalled();
        expect(parties.getOwned).not.toHaveBeenCalled();
        expect(mockReadFile).not.toHaveBeenCalled();
      },
    );

    it('systemId inconnu → NotFoundException, aucune résolution de clé tentée', async () => {
      await expect(
        service.getAssetFile('p1', 'conte-de-minuit', 'journal', 'u1'),
      ).rejects.toThrow('Système de jeu introuvable');
      expect(parties.getViewable).not.toHaveBeenCalled();
    });

    it('fichier absent du disque → erreur explicite pointant vers le README', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'mj1' });
      mockReadFile.mockRejectedValue(new Error('ENOENT'));

      await expect(
        service.getAssetFile('p1', 'ryuutama', 'journal', 'u1'),
      ).rejects.toThrow(/introuvable sur le disque/);
    });

    describe('fiches réservées au MJ (Story 12.2)', () => {
      const MJ_KEYS = [
        'monde',
        'monstre',
        'ville',
        'objectif-chasse',
        'objectif-quete',
        'objectif-voyage',
        'oeuf-de-bataille',
        'structure',
      ];

      it.each(MJ_KEYS)(
        'clé "%s" + MJ authentifié → fichier retourné, getOwned appelé avec la bonne Partie (AC1)',
        async (key) => {
          parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'mj1' });

          const result = await service.getAssetFile('p1', 'ryuutama', key, 'mj1');

          expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
          expect(parties.getViewable).not.toHaveBeenCalled();
          expect(result).toEqual(Buffer.from('pdf-bytes'));
        },
      );

      it.each(MJ_KEYS)(
        'clé "%s" + joueur non-MJ → ForbiddenException propagée, jamais un fichier vide (AC2)',
        async (key) => {
          parties.getOwned.mockRejectedValue(new ForbiddenException());

          await expect(
            service.getAssetFile('p1', 'ryuutama', key, 'player1'),
          ).rejects.toThrow(ForbiddenException);
          expect(mockReadFile).not.toHaveBeenCalled();
        },
      );

      it('clé MJ inexistante ("objectif-peche") → NotFoundException explicite (AC3)', async () => {
        await expect(
          service.getAssetFile('p1', 'ryuutama', 'objectif-peche', 'mj1'),
        ).rejects.toThrow('Fiche introuvable');
        expect(parties.getOwned).not.toHaveBeenCalled();
      });
    });

    it('les 12 clés de la table sont résolues vers un fichier sans lever d\'erreur "Fiche introuvable"', async () => {
      parties.getViewable.mockResolvedValue({ id: 'p1', mjId: 'u1' });
      parties.getOwned.mockResolvedValue({ id: 'p1', mjId: 'u1' });
      const keys = [
        'journal',
        'carte',
        'evenements',
        'monde',
        'monstre',
        'ville',
        'provisions',
        'objectif-chasse',
        'objectif-quete',
        'objectif-voyage',
        'oeuf-de-bataille',
        'structure',
      ];
      for (const key of keys) {
        await expect(
          service.getAssetFile('p1', 'ryuutama', key, 'u1'),
        ).resolves.toEqual(Buffer.from('pdf-bytes'));
      }
    });
  });
});
