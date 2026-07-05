jest.mock('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

import { readFile } from 'node:fs/promises';
import {
  extractPortraitFilename,
  readPortraitFile,
} from './portrait-storage.util';

const VALID_FILENAME = '11111111-1111-1111-1111-111111111111.jpg';
const VALID_URL = `/uploads/portraits/${VALID_FILENAME}`;

describe('extractPortraitFilename', () => {
  it('extrait le nom de fichier depuis une URL de portrait valide', () => {
    expect(extractPortraitFilename(VALID_URL)).toBe(VALID_FILENAME);
  });

  it('retourne null pour une URL nulle', () => {
    expect(extractPortraitFilename(null)).toBeNull();
  });

  it("retourne null si l'URL ne commence pas par le préfixe attendu", () => {
    expect(extractPortraitFilename('/uploads/other/x.jpg')).toBeNull();
  });

  it('retourne null pour un nom de fichier ne respectant pas le format UUID (défense path traversal)', () => {
    expect(
      extractPortraitFilename('/uploads/portraits/../../etc/passwd'),
    ).toBeNull();
  });
});

describe('readPortraitFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retourne null si portraitUrl est null', async () => {
    await expect(readPortraitFile(null)).resolves.toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('retourne null si le nom de fichier est invalide, sans toucher au disque', async () => {
    await expect(
      readPortraitFile('/uploads/portraits/not-a-uuid.jpg'),
    ).resolves.toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('lit le fichier et retourne le buffer + mime déduit de l’extension', async () => {
    (readFile as jest.Mock).mockResolvedValue(Buffer.from('bytes'));
    const result = await readPortraitFile(VALID_URL);
    expect(result).toEqual({
      buffer: Buffer.from('bytes'),
      mime: 'image/jpeg',
    });
  });

  it('retourne null si le fichier est introuvable sur disque (jamais une exception)', async () => {
    (readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
    await expect(readPortraitFile(VALID_URL)).resolves.toBeNull();
  });
});
