import { Test } from '@nestjs/testing';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));
jest.mock('@master-jdr/game-rules', () => ({
  mapToPdfFields: jest.fn(
    (
      _data: unknown,
      derived: { PV: number },
      content: { classLabel: string },
    ) => [
      { field: 'PV max', value: String(derived.PV), kind: 'text' },
      { field: 'Classe 1', value: content.classLabel, kind: 'dropdown' },
    ],
  ),
}));

import { readFile } from 'node:fs/promises';
import { RyuutamaPdfService } from './ryuutama-pdf.service';
import { GameSystemService } from '../game-systems/game-system.service';

const mockSetText = jest.fn();
const mockSelect = jest.fn();
const mockFlatten = jest.fn();
const mockSave = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
const mockForm = {
  getTextField: jest.fn(() => ({ setText: mockSetText })),
  getDropdown: jest.fn(() => ({ select: mockSelect })),
  flatten: mockFlatten,
};
const mockDoc = {
  getForm: jest.fn(() => mockForm),
  save: mockSave,
};

jest.mock('pdf-lib', () => ({
  PDFDocument: { load: jest.fn(() => Promise.resolve(mockDoc)) },
}));

function makeContentService() {
  return {
    getContent: jest.fn().mockResolvedValue({
      class: [
        {
          key: 'chasseur',
          data: {
            label: 'Chasseur',
            talents: [{ name: 'Pistage', effect: 'Suit une piste' }],
          },
        },
      ],
      type: [{ key: 'attaque', data: { label: 'Attaque' } }],
      weaponCategory: [
        {
          key: 'arc',
          data: {
            label: 'Arc',
            touchFormula: 'AGI+INT-2',
            damageFormula: 'AGI',
          },
        },
      ],
    }),
  };
}

function makeCharacter() {
  return {
    id: 'char1',
    userId: 'u1',
    partieId: 'p1',
    gameSystemId: 'ryuutama',
    sheetData: {
      classId: 'chasseur',
      typeId: 'attaque',
      weaponCategoryId: 'arc',
      attributes: { AGI: 4, ESP: 6, INT: 6, VIG: 8 },
    },
    derived: {
      PV: 16,
      PE: 12,
      Condition: 14,
      Initiative: 10,
      Encombrement: 11,
    },
    portraitUrl: null,
    portraitCropData: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  };
}

describe('RyuutamaPdfService', () => {
  let service: RyuutamaPdfService;
  let gameSystems: ReturnType<typeof makeContentService>;

  beforeEach(async () => {
    jest.clearAllMocks();
    (readFile as jest.Mock).mockResolvedValue(Buffer.from('fake-pdf-bytes'));
    gameSystems = makeContentService();
    const module = await Test.createTestingModule({
      providers: [
        RyuutamaPdfService,
        { provide: GameSystemService, useValue: gameSystems },
      ],
    }).compile();
    service = module.get(RyuutamaPdfService);
  });

  it("format 'editable' : ne flatten pas le formulaire", async () => {
    const result = await service.fillCharacterPdf(makeCharacter(), 'editable');
    expect(mockFlatten).not.toHaveBeenCalled();
    expect(result).toBeInstanceOf(Buffer);
  });

  it("format '2pages' : flatten le formulaire après remplissage", async () => {
    await service.fillCharacterPdf(makeCharacter(), '2pages');
    expect(mockFlatten).toHaveBeenCalledTimes(1);
  });

  it('remplit les champs texte et dropdown résolus depuis le contenu', async () => {
    await service.fillCharacterPdf(makeCharacter(), 'editable');
    expect(mockForm.getTextField).toHaveBeenCalledWith('PV max');
    expect(mockSetText).toHaveBeenCalledWith('16');
    expect(mockForm.getDropdown).toHaveBeenCalledWith('Classe 1');
    expect(mockSelect).toHaveBeenCalledWith('Chasseur');
  });

  it('charge le template une seule fois (cache mémoire)', async () => {
    await service.fillCharacterPdf(makeCharacter(), 'editable');
    await service.fillCharacterPdf(makeCharacter(), '2pages');
    expect(readFile).toHaveBeenCalledTimes(1);
  });

  it('template PDF absent => erreur explicite pointant vers le README', async () => {
    (readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
    const gs = makeContentService();
    const module = await Test.createTestingModule({
      providers: [
        RyuutamaPdfService,
        { provide: GameSystemService, useValue: gs },
      ],
    }).compile();
    const freshService = module.get(RyuutamaPdfService);
    await expect(
      freshService.fillCharacterPdf(makeCharacter() as any, 'editable'),
    ).rejects.toThrow(/README/);
  });
});
