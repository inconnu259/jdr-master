// `@master-jdr/game-rules` RÉEL (pas de jest.mock) : les règles de la réserve (capacité, souffles
// du temps, autre race, rituels) sont l'objet même de ces tests — les mocker ne prouverait rien.
// Le catalogue est celui seedé en base (`game-systems/ryuutama/data`).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HommeDragonService } from './homme-dragon.service';
import { PrismaService } from '../prisma/prisma.service';
import { PartiesService } from '../parties/parties.service';
import { GameSystemService } from '../game-systems/game-system.service';
import { ScenariosService } from '../scenarios/scenarios.service';
import { RealtimeEventsService, partieTopic } from '../realtime/realtime-events.service';
import { objectLike } from '../common/test-utils/jest-typed';

const DATA_DIR = join(process.cwd(), 'game-systems/ryuutama/data');
const readCatalogue = (file: string) =>
  (JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as { key: string }[]).map((data) => ({
    key: data.key,
    data,
  }));

const CONTENT = {
  hommeDragonArtefact: readCatalogue('homme-dragon-artefacts.json'),
  eveilPower: readCatalogue('eveil-powers.json'),
  souffle: readCatalogue('souffles.json'),
  souffleRituel: readCatalogue('souffles-rituels.json'),
};

const PARTIE = { id: 'p1', mjId: 'mj1', gameSystemId: 'ryuutama' };

// 1 scénario PASSE = niveau 2, 3 = niveau 3, 7 = niveau 4, 12 = niveau 5.
const SCENARIOS_FOR_LEVEL: Record<number, number> = { 1: 0, 2: 1, 3: 3, 4: 7, 5: 12 };

function makeRow(sheetData: Record<string, unknown> = {}) {
  return {
    id: 'hd1',
    userId: 'mj1',
    partieId: 'p1',
    gameSystemId: 'ryuutama',
    sheetData: { race: 'DRAGON_ROUGE', artefact: { key: 'grand-arc' }, nom: 'Ignis', ...sheetData },
    createdAt: new Date('2026-07-16T00:00:00.000Z'),
    updatedAt: new Date('2026-07-16T00:00:00.000Z'),
  };
}

describe('HommeDragonService.setReserveSlot() (Story 33.6, règles réelles)', () => {
  let service: HommeDragonService;
  const tx = {
    $queryRaw: jest.fn(),
    hommeDragon: { findUnique: jest.fn(), update: jest.fn() },
  };
  const prisma = {
    $transaction: jest.fn((cb: (t: typeof tx) => unknown) => cb(tx)),
  };
  const parties = { getOwned: jest.fn(), getViewable: jest.fn(), listMembers: jest.fn() };
  const gameSystems = { getContent: jest.fn() };
  const scenarios = { findAllForPartie: jest.fn() };
  const realtimeEvents = { emit: jest.fn() };

  /** Dragon rouge au niveau demandé, avec la réserve stockée donnée. */
  function arrange(level: number, reserve?: (string | null)[]) {
    parties.getOwned.mockResolvedValue(PARTIE);
    parties.listMembers.mockResolvedValue([]);
    scenarios.findAllForPartie.mockResolvedValue(
      Array.from({ length: SCENARIOS_FOR_LEVEL[level] }, (_, i) => ({
        id: `s${i}`,
        title: `Scénario ${i}`,
        status: 'PASSE',
        closedAt: '2026-07-10T00:00:00.000Z',
      })),
    );
    const row = makeRow(reserve ? { reserve } : {});
    tx.hommeDragon.findUnique.mockResolvedValue(row);
    tx.hommeDragon.update.mockImplementation(({ data }: { data: { sheetData: object } }) =>
      Promise.resolve({ ...row, sheetData: data.sheetData }),
    );
    return row;
  }

  const written = () =>
    (tx.hommeDragon.update.mock.calls[0] as [{ data: { sheetData: { reserve: unknown } } }])[0].data
      .sheetData.reserve;

  beforeEach(async () => {
    jest.clearAllMocks();
    gameSystems.getContent.mockResolvedValue(CONTENT);
    const module = await Test.createTestingModule({
      providers: [
        HommeDragonService,
        { provide: PrismaService, useValue: prisma },
        { provide: PartiesService, useValue: parties },
        { provide: GameSystemService, useValue: gameSystems },
        { provide: ScenariosService, useValue: scenarios },
        { provide: RealtimeEventsService, useValue: realtimeEvents },
      ],
    }).compile();
    service = module.get(HommeDragonService);
  });

  it('place un souffle valide : verrou de ligne, écriture, émission, DTO avec la réserve', async () => {
    arrange(4);

    const dto = await service.setReserveSlot('p1', 'mj1', 1, { key: 'courage' });

    expect(parties.getOwned).toHaveBeenCalledWith('p1', 'mj1');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(tx.hommeDragon.update).toHaveBeenCalledWith({
      where: {
        userId_partieId_gameSystemId: { userId: 'mj1', partieId: 'p1', gameSystemId: 'ryuutama' },
      },
      data: { sheetData: objectLike({ nom: 'Ignis', reserve: ['courage'] }) },
    });
    expect(realtimeEvents.emit).toHaveBeenCalledWith(partieTopic('p1'));
    expect(dto.sheetData.reserve).toEqual(['courage']);
    expect(dto.derived.level).toBe(4);
  });

  it('applique le geste à la liste lue sous verrou : les autres emplacements sont conservés', async () => {
    arrange(4, ['courage', null, 'chance']);

    await service.setReserveSlot('p1', 'mj1', 2, { key: 'defi' });

    expect(written()).toEqual(['courage', 'defi', 'chance']);
  });

  it('remplit les emplacements intermédiaires par null (positionnel)', async () => {
    arrange(4);

    await service.setReserveSlot('p1', 'mj1', 3, { key: 'chance' });

    expect(written()).toEqual([null, null, 'chance']);
  });

  it('retire un souffle avec { key: null }', async () => {
    arrange(4, ['courage', 'chance']);

    await service.setReserveSlot('p1', 'mj1', 1, { key: null });

    expect(written()).toEqual([null, 'chance']);
  });

  it("retirer au-delà de la fin de la liste n'allonge pas la réserve", async () => {
    arrange(4, ['courage']);

    await service.setReserveSlot('p1', 'mj1', 3, { key: null });

    expect(written()).toEqual(['courage']);
  });

  it('un même souffle commun ou de la race peut occuper plusieurs emplacements', async () => {
    arrange(4, ['courage', 'chance']);

    await service.setReserveSlot('p1', 'mj1', 3, { key: 'courage' });

    expect(written()).toEqual(['courage', 'chance', 'courage']);
  });

  it("ne mute jamais l'objet sheetData lu (copie)", async () => {
    const row = arrange(4, ['courage']);
    const originalReserve = (row.sheetData as unknown as { reserve: string[] }).reserve;

    await service.setReserveSlot('p1', 'mj1', 2, { key: 'chance' });

    expect(originalReserve).toEqual(['courage']);
  });

  it('montée de niveau : la réserve existante est conservée, le nouvel emplacement est vide', async () => {
    arrange(5, ['courage', 'chance']);

    const dto = await service.setReserveSlot('p1', 'mj1', 1, { key: 'defi' });

    expect(dto.derived.level).toBe(5);
    expect(dto.sheetData.reserve).toEqual(['defi', 'chance']);
  });

  describe('refus (400, rien écrit, rien émis)', () => {
    async function expectRejected(slot: number, key: string | null) {
      await expect(service.setReserveSlot('p1', 'mj1', slot, { key })).rejects.toThrow(
        BadRequestException,
      );
      expect(tx.hommeDragon.update).not.toHaveBeenCalled();
      expect(realtimeEvents.emit).not.toHaveBeenCalled();
    }

    it('niveau 1 : toute écriture refusée, retrait compris', async () => {
      arrange(1);
      await expectRejected(1, 'chance');
      await expectRejected(1, null);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('emplacement au-delà de la capacité (niveau 2 : un seul emplacement)', async () => {
      arrange(2);
      await expectRejected(2, 'chance');
    });

    it.each([0, -1, 5, 1.5, Number.NaN])('numéro d’emplacement invalide : %s', async (slot) => {
      arrange(5);
      await expectRejected(slot, 'chance');
    });

    it('souffle du temps (Passé, Futur)', async () => {
      arrange(5);
      await expectRejected(1, 'passe');
      await expectRejected(1, 'futur');
    });

    it('clé inconnue nouvellement placée', async () => {
      arrange(5);
      await expectRejected(1, 'souffle-fantome');
    });

    it('souffle d’une autre race au niveau 2', async () => {
      arrange(2);
      await expectRejected(1, 'nostalgie');
    });

    it('niveau 3+ : un deuxième souffle d’une autre race', async () => {
      arrange(3, ['nostalgie', null]);
      await expectRejected(2, 'amour');
    });

    it('niveau 3+ : le même souffle d’une autre race une seconde fois', async () => {
      arrange(3, ['nostalgie', null]);
      await expectRejected(2, 'nostalgie');
    });

    it('rituel au niveau 4', async () => {
      arrange(4);
      await expectRejected(1, 'rituel-du-tabou');
    });
  });

  it('niveau 3 : un souffle d’une autre race est accepté (sur un seul emplacement)', async () => {
    arrange(3);

    await service.setReserveSlot('p1', 'mj1', 1, { key: 'nostalgie' });

    expect(written()).toEqual(['nostalgie']);
  });

  it('niveau 3+ : changer le souffle d’une autre race sur son propre emplacement reste possible', async () => {
    arrange(3, ['nostalgie', null]);

    await service.setReserveSlot('p1', 'mj1', 1, { key: 'amour' });

    expect(written()).toEqual(['amour', null]);
  });

  it('niveau 5 : un rituel est accepté et ne compte pas comme « autre race »', async () => {
    arrange(5, ['nostalgie', null, null, null]);

    await service.setReserveSlot('p1', 'mj1', 2, { key: 'rituel-du-tabou' });

    expect(written()).toEqual(['nostalgie', 'rituel-du-tabou', null, null]);
  });

  it('souffle retiré du catalogue déjà présent : toléré, retirable, « Changer » possible', async () => {
    arrange(4, ['souffle-fantome', null, null]);
    await service.setReserveSlot('p1', 'mj1', 2, { key: 'chance' });
    expect(written()).toEqual(['souffle-fantome', 'chance', null]);

    jest.clearAllMocks();
    arrange(4, ['souffle-fantome', null, null]);
    await service.setReserveSlot('p1', 'mj1', 1, { key: null });
    expect(written()).toEqual([null, null, null]);

    jest.clearAllMocks();
    arrange(4, ['souffle-fantome', null, null]);
    await service.setReserveSlot('p1', 'mj1', 1, { key: 'courage' });
    expect(written()).toEqual(['courage', null, null]);
  });

  it('baisse de niveau : aucune purge du surplus, le retrait du surplus reste possible', async () => {
    // Réserve de 3 emplacements stockée, niveau actuel 3 (capacité 2).
    arrange(3, ['courage', 'chance', 'defi']);
    await service.setReserveSlot('p1', 'mj1', 3, { key: null });
    expect(written()).toEqual(['courage', 'chance', null]);

    // Une autre écriture légitime ne purge pas le surplus.
    jest.clearAllMocks();
    arrange(3, ['courage', 'chance', 'defi']);
    await service.setReserveSlot('p1', 'mj1', 1, { key: 'chance' });
    expect(written()).toEqual(['chance', 'chance', 'defi']);
  });

  it('non-MJ → ForbiddenException propagée par getOwned, aucune transaction', async () => {
    parties.getOwned.mockRejectedValue(new ForbiddenException());

    await expect(service.setReserveSlot('p1', 'joueur1', 1, { key: 'chance' })).rejects.toThrow(
      ForbiddenException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.hommeDragon.update).not.toHaveBeenCalled();
  });

  it('Partie hors Ryuutama → BadRequestException, aucune transaction', async () => {
    parties.getOwned.mockResolvedValue({ ...PARTIE, gameSystemId: 'draconis' });

    await expect(service.setReserveSlot('p1', 'mj1', 1, { key: 'chance' })).rejects.toThrow(
      BadRequestException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('aucun Homme Dragon → NotFoundException', async () => {
    arrange(4);
    tx.hommeDragon.findUnique.mockResolvedValue(null);

    await expect(service.setReserveSlot('p1', 'mj1', 1, { key: 'chance' })).rejects.toThrow(
      NotFoundException,
    );
    expect(tx.hommeDragon.update).not.toHaveBeenCalled();
  });
});
