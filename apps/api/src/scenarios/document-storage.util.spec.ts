jest.mock('node:fs/promises', () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  writeFile: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(),
  unlink: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('node:crypto', () => ({
  randomUUID: jest.fn(() => '11111111-1111-1111-1111-111111111111'),
}));

import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import {
  DOCUMENTS_DIR,
  deleteDocumentFile,
  readDocumentFile,
  writeDocumentFile,
} from './document-storage.util';

describe('writeDocumentFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('écrit un PDF sous un nom uuid.pdf généré côté serveur', async () => {
    const buffer = Buffer.from('%PDF-1.4\n...');
    const filename = await writeDocumentFile(buffer, 'application/pdf');
    expect(filename).toBe('11111111-1111-1111-1111-111111111111.pdf');
    expect(mkdir).toHaveBeenCalledWith(DOCUMENTS_DIR, { recursive: true });
    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining(filename),
      buffer,
    );
  });

  it('écrit un texte sous un nom uuid.txt', async () => {
    const filename = await writeDocumentFile(
      Buffer.from('texte'),
      'text/plain',
    );
    expect(filename).toBe('11111111-1111-1111-1111-111111111111.txt');
  });
});

describe('readDocumentFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('retourne null pour un nom de fichier invalide (path traversal), sans toucher au disque', async () => {
    const result = await readDocumentFile('../../etc/passwd');
    expect(result).toBeNull();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('lit le fichier et retourne le buffer + mime déduit de l’extension', async () => {
    (readFile as jest.Mock).mockResolvedValue(Buffer.from('bytes'));
    const result = await readDocumentFile(
      '11111111-1111-1111-1111-111111111111.pdf',
    );
    expect(result).toEqual({
      buffer: Buffer.from('bytes'),
      mime: 'application/pdf',
    });
  });

  it('retourne null si le fichier est introuvable sur disque (jamais une exception)', async () => {
    (readFile as jest.Mock).mockRejectedValue(new Error('ENOENT'));
    const result = await readDocumentFile(
      '11111111-1111-1111-1111-111111111111.txt',
    );
    expect(result).toBeNull();
  });
});

describe('deleteDocumentFile', () => {
  beforeEach(() => jest.clearAllMocks());

  it('supprime le fichier sur disque', async () => {
    await deleteDocumentFile('11111111-1111-1111-1111-111111111111.pdf');
    expect(unlink).toHaveBeenCalledWith(
      expect.stringContaining('11111111-1111-1111-1111-111111111111.pdf'),
    );
  });

  it('ne relance jamais d’exception si la suppression échoue (best-effort)', async () => {
    (unlink as jest.Mock).mockRejectedValueOnce(new Error('ENOENT'));
    await expect(
      deleteDocumentFile('11111111-1111-1111-1111-111111111111.pdf'),
    ).resolves.toBeUndefined();
  });
});

describe('DOCUMENTS_DIR', () => {
  it('est un sous-dossier dédié, distinct de portraits', () => {
    expect(DOCUMENTS_DIR).toContain('scenario-documents');
    expect(DOCUMENTS_DIR).not.toContain('portraits');
  });
});
