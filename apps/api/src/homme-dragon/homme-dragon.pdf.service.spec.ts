import { Test } from '@nestjs/testing';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));
jest.mock('@master-jdr/game-rules', () => ({
  mapHommeDragonToPdfFields: jest.fn(() => [
    { field: 'nom', value: 'Ignis', kind: 'text' },
    { field: 'niveau', value: '3', kind: 'text' },
    { field: 'inscription', value: '', kind: 'text' },
  ]),
}));

import { readFile } from 'node:fs/promises';
import { mapHommeDragonToPdfFields } from '@master-jdr/game-rules';
import { HommeDragonPdfService } from './homme-dragon.pdf.service';
import { GameSystemService } from '../game-systems/game-system.service';

const mockSetText = jest.fn();
const mockSave = jest.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
const mockForm = {
  getTextField: jest.fn(() => ({ setText: mockSetText })),
};
const mockDoc = {
  getForm: jest.fn(() => mockForm),
  save: mockSave,
};

jest.mock('pdf-lib', () => ({
  PDFDocument: { load: jest.fn(() => Promise.resolve(mockDoc)) },
}));

function makeGameSystems() {
  return {
    getContent: jest.fn().mockResolvedValue({
      eveilPower: [
        { key: 'escorte-du-dragon', data: { key: 'escorte-du-dragon', label: 'Escorte du dragon' } },
      ],
    }),
  };
}

function makeHommeDragon(overrides: Record<string, unknown> = {}) {
  return {
    id: 'hd1',
    userId: 'mj1',
    partieId: 'p1',
    gameSystemId: 'ryuutama',
    sheetData: { race: 'DRAGON_ROUGE', artefact: { key: 'grand-arc' }, nom: 'Ignis' },
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
    voyageursProteges: [],
    historique: [],
    derived: { level: 3, PS: 5 },
    eveilPowers: [],
    pendingEveilLevels: [],
    ...overrides,
  } as any;
}

describe('HommeDragonPdfService', () => {
  let service: HommeDragonPdfService;
  let gameSystems: ReturnType<typeof makeGameSystems>;
  const mockReadFile = readFile as jest.Mock;
  const mockMapFields = mapHommeDragonToPdfFields as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    gameSystems = makeGameSystems();
    mockReadFile.mockResolvedValue(Buffer.from('fake-pdf-bytes'));
    mockMapFields.mockReturnValue([
      { field: 'nom', value: 'Ignis', kind: 'text' },
      { field: 'niveau', value: '3', kind: 'text' },
      { field: 'inscription', value: '', kind: 'text' },
    ]);

    const module = await Test.createTestingModule({
      providers: [HommeDragonPdfService, { provide: GameSystemService, useValue: gameSystems }],
    }).compile();
    service = module.get(HommeDragonPdfService);
  });

  it('remplit les champs non vides retournés par mapHommeDragonToPdfFields', async () => {
    await service.fillHommeDragonPdf(makeHommeDragon(), 'admin');

    expect(mockForm.getTextField).toHaveBeenCalledWith('nom');
    expect(mockForm.getTextField).toHaveBeenCalledWith('niveau');
    expect(mockSetText).toHaveBeenCalledWith('Ignis');
    expect(mockSetText).toHaveBeenCalledWith('3');
  });

  it('champ vide ("inscription") ignoré, jamais écrit', async () => {
    await service.fillHommeDragonPdf(makeHommeDragon(), 'admin');

    expect(mockForm.getTextField).not.toHaveBeenCalledWith('inscription');
  });

  it('résout le libellé du pouvoir d\'éveil via GameSystemService.getContent()', async () => {
    await service.fillHommeDragonPdf(makeHommeDragon(), 'admin');

    expect(gameSystems.getContent).toHaveBeenCalledWith('ryuutama');
    expect(mockMapFields).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        raceLabel: 'Dragon Rouge',
        mjPseudo: 'admin',
        eveilPowerLabels: { 'escorte-du-dragon': 'Escorte du dragon' },
      }),
    );
  });

  it('template introuvable → erreur explicite pointant vers le README', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    await expect(service.fillHommeDragonPdf(makeHommeDragon(), 'admin')).rejects.toThrow(
      'Template PDF Homme Dragon introuvable',
    );
  });

  it("échec de setText sur un champ → erreur explicite, pas un crash silencieux", async () => {
    mockForm.getTextField.mockImplementationOnce(() => {
      throw new Error('champ inconnu');
    });

    await expect(service.fillHommeDragonPdf(makeHommeDragon(), 'admin')).rejects.toThrow(
      /introuvable\/incompatible/,
    );
  });
});
