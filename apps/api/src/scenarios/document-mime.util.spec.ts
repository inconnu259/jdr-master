import { PDFDocument } from 'pdf-lib';
import {
  detectDocumentMime,
  extensionForDocumentMime,
  isStructurallyValidPdf,
  isValidDocumentFilename,
  mimeForExtension,
} from './document-mime.util';

describe('detectDocumentMime', () => {
  it('détecte un PDF par sa signature magique %PDF-', () => {
    const buffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj');
    expect(detectDocumentMime(buffer)).toBe('application/pdf');
  });

  it('détecte un texte brut sans byte NUL', () => {
    const buffer = Buffer.from(
      'Le marchand Ossian propose un pacte...',
      'utf8',
    );
    expect(detectDocumentMime(buffer)).toBe('text/plain');
  });

  it('rejette un buffer binaire arbitraire contenant un byte NUL (ex. faux .txt)', () => {
    const buffer = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe]);
    expect(detectDocumentMime(buffer)).toBeNull();
  });

  it('rejette un buffer vide', () => {
    expect(detectDocumentMime(Buffer.alloc(0))).toBeNull();
  });

  it('rejette un buffer JPEG (signature image, pas document)', () => {
    const buffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    // Un JPEG contient des bytes NUL rapidement dans son en-tête → correctement rejeté
    expect(detectDocumentMime(buffer)).toBeNull();
  });
});

describe('isStructurallyValidPdf', () => {
  it('accepte un PDF réellement structuré (généré par pdf-lib lui-même)', async () => {
    const doc = await PDFDocument.create();
    doc.addPage();
    const buffer = Buffer.from(await doc.save());
    await expect(isStructurallyValidPdf(buffer)).resolves.toBe(true);
  });

  it('rejette un buffer avec l’en-tête %PDF- valide mais un contenu arbitraire non structuré (load() seul ne suffit pas)', async () => {
    const buffer = Buffer.from('%PDF-1.4\n' + 'garbage'.repeat(500));
    await expect(isStructurallyValidPdf(buffer)).resolves.toBe(false);
  });

  it('rejette un buffer vide', async () => {
    await expect(isStructurallyValidPdf(Buffer.alloc(0))).resolves.toBe(
      false,
    );
  });
});

describe('extensionForDocumentMime / mimeForExtension', () => {
  it('mappe application/pdf ↔ .pdf', () => {
    expect(extensionForDocumentMime('application/pdf')).toBe('.pdf');
    expect(mimeForExtension('.pdf')).toBe('application/pdf');
  });

  it('mappe text/plain ↔ .txt', () => {
    expect(extensionForDocumentMime('text/plain')).toBe('.txt');
    expect(mimeForExtension('.txt')).toBe('text/plain');
  });

  it('mimeForExtension est insensible à la casse', () => {
    expect(mimeForExtension('.PDF')).toBe('application/pdf');
  });

  it('mimeForExtension renvoie null pour une extension inconnue', () => {
    expect(mimeForExtension('.exe')).toBeNull();
  });
});

describe('isValidDocumentFilename', () => {
  it('accepte un nom UUID v4 + extension connue', () => {
    expect(
      isValidDocumentFilename('550e8400-e29b-41d4-a716-446655440000.pdf'),
    ).toBe(true);
    expect(
      isValidDocumentFilename('550e8400-e29b-41d4-a716-446655440000.txt'),
    ).toBe(true);
  });

  it('rejette une tentative de path traversal', () => {
    expect(isValidDocumentFilename('../../etc/passwd')).toBe(false);
  });

  it('rejette une extension non whitelistée', () => {
    expect(
      isValidDocumentFilename('550e8400-e29b-41d4-a716-446655440000.exe'),
    ).toBe(false);
  });

  it('rejette un nom qui ne suit pas le format UUID', () => {
    expect(isValidDocumentFilename('document.pdf')).toBe(false);
  });
});
