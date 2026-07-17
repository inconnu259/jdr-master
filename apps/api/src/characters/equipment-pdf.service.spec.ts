import { Test } from '@nestjs/testing';

jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));
jest.mock('@master-jdr/game-rules', () => ({
  mapEquipmentToPdfFields: jest.fn(() => [
    { field: 'joueur', value: 'Alice', kind: 'text' },
    { field: 'ObjetRow1', value: 'Corde', kind: 'text' },
    { field: 'PrixRow1', value: '', kind: 'text' },
  ]),
}));

import { readFile } from 'node:fs/promises';
import { mapEquipmentToPdfFields } from '@master-jdr/game-rules';
import { EquipmentPdfService } from './equipment-pdf.service';

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

function makeCharacter(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c1',
    userId: 'u1',
    partieId: 'p1',
    gameSystemId: 'ryuutama',
    sheetData: {
      narrative: { name: 'Miren' },
      equipment: { individual: [{ id: 'i1', name: 'Corde', weight: 2, addedBy: 'player' }], group: [] },
    },
    derived: { PV: 10, PE: 8, Condition: 10, Initiative: 5, Encombrement: 11 },
    ownerPseudo: 'Alice',
    ownerIsMj: false,
    viewerIsMj: false,
    createdAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-17T00:00:00.000Z',
    xp: 0,
    level: 1,
    journalAutoAssociate: false,
    ...overrides,
  } as any;
}

describe('EquipmentPdfService', () => {
  let service: EquipmentPdfService;
  const mockReadFile = readFile as jest.Mock;
  const mockMapFields = mapEquipmentToPdfFields as jest.Mock;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockReadFile.mockResolvedValue(Buffer.from('fake-pdf-bytes'));
    mockMapFields.mockReturnValue([
      { field: 'joueur', value: 'Alice', kind: 'text' },
      { field: 'ObjetRow1', value: 'Corde', kind: 'text' },
      { field: 'PrixRow1', value: '', kind: 'text' },
    ]);

    const module = await Test.createTestingModule({
      providers: [EquipmentPdfService],
    }).compile();
    service = module.get(EquipmentPdfService);
  });

  it('remplit les champs non vides retournés par mapEquipmentToPdfFields', async () => {
    await service.fillEquipmentPdf(makeCharacter());

    expect(mockForm.getTextField).toHaveBeenCalledWith('joueur');
    expect(mockForm.getTextField).toHaveBeenCalledWith('ObjetRow1');
    expect(mockSetText).toHaveBeenCalledWith('Alice');
    expect(mockSetText).toHaveBeenCalledWith('Corde');
  });

  it('champ vide ("PrixRow1") ignoré, jamais écrit', async () => {
    await service.fillEquipmentPdf(makeCharacter());

    expect(mockForm.getTextField).not.toHaveBeenCalledWith('PrixRow1');
  });

  it('construit l\'EquipmentPdfInput à partir du personnage (ownerPseudo, nom, encombrementLimit, equipment)', async () => {
    await service.fillEquipmentPdf(makeCharacter());

    expect(mockMapFields).toHaveBeenCalledWith({
      ownerPseudo: 'Alice',
      characterName: 'Miren',
      encombrementLimit: 11,
      equipment: {
        individual: [{ name: 'Corde', weight: 2 }],
        group: [],
      },
    });
  });

  it('template introuvable → erreur explicite pointant vers le README', async () => {
    mockReadFile.mockRejectedValue(new Error('ENOENT'));

    await expect(service.fillEquipmentPdf(makeCharacter())).rejects.toThrow(
      'Template PDF équipement Ryuutama introuvable',
    );
  });

  it("échec de setText sur un champ → erreur explicite, pas un crash silencieux", async () => {
    mockForm.getTextField.mockImplementationOnce(() => {
      throw new Error('champ inconnu');
    });

    await expect(service.fillEquipmentPdf(makeCharacter())).rejects.toThrow(
      /introuvable\/incompatible/,
    );
  });
});
