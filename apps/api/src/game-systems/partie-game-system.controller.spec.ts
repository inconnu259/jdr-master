import { ForbiddenException, NotFoundException, StreamableFile } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PartieGameSystemController } from './partie-game-system.controller';
import { GameSystemService } from './game-system.service';

function makeGameSystemService() {
  return {
    getAssetFile: jest.fn(),
  };
}

describe('PartieGameSystemController', () => {
  let controller: PartieGameSystemController;
  let gameSystems: ReturnType<typeof makeGameSystemService>;

  beforeEach(async () => {
    gameSystems = makeGameSystemService();
    const module = await Test.createTestingModule({
      controllers: [PartieGameSystemController],
      providers: [{ provide: GameSystemService, useValue: gameSystems }],
    }).compile();
    controller = module.get(PartieGameSystemController);
  });

  it('getAsset() délègue à gameSystems.getAssetFile() avec les 4 paramètres attendus puis retourne un StreamableFile', async () => {
    gameSystems.getAssetFile.mockResolvedValue(Buffer.from('pdf-bytes'));

    const result = await controller.getAsset('p1', 'ryuutama', 'journal', {
      id: 'u1',
    } as any);

    expect(gameSystems.getAssetFile).toHaveBeenCalledWith(
      'p1',
      'ryuutama',
      'journal',
      'u1',
    );
    expect(result).toBeInstanceOf(StreamableFile);
  });

  it('propage sans les intercepter les exceptions levées par getAssetFile() (404 clé inconnue)', async () => {
    gameSystems.getAssetFile.mockRejectedValue(
      new NotFoundException('Fiche introuvable'),
    );

    await expect(
      controller.getAsset('p1', 'ryuutama', 'inexistante', { id: 'u1' } as any),
    ).rejects.toThrow(NotFoundException);
  });

  it('propage sans les intercepter les exceptions levées par getAssetFile() (403 accès refusé)', async () => {
    gameSystems.getAssetFile.mockRejectedValue(new ForbiddenException());

    await expect(
      controller.getAsset('p1', 'ryuutama', 'structure', { id: 'player1' } as any),
    ).rejects.toThrow(ForbiddenException);
  });
});
