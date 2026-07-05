import {
  detectImageMime,
  extensionForImageMime,
  isValidPortraitFilename,
  mimeForExtension,
} from './image-mime.util';

const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00,
]);
const WEBP_HEADER = Buffer.concat([
  Buffer.from('RIFF', 'ascii'),
  Buffer.from([0x00, 0x00, 0x00, 0x00]),
  Buffer.from('WEBP', 'ascii'),
]);

describe('detectImageMime', () => {
  it('détecte un JPEG par ses octets magiques (FF D8 FF)', () => {
    expect(detectImageMime(JPEG_HEADER)).toBe('image/jpeg');
  });

  it('détecte un PNG par sa signature complète', () => {
    expect(detectImageMime(PNG_HEADER)).toBe('image/png');
  });

  it('détecte un WEBP (RIFF....WEBP)', () => {
    expect(detectImageMime(WEBP_HEADER)).toBe('image/webp');
  });

  it("rejette un fichier texte (pas d'octets magiques image)", () => {
    expect(detectImageMime(Buffer.from('not an image', 'ascii'))).toBeNull();
  });

  it('rejette un fichier renommé avec une extension .jpg mais un contenu exécutable (MZ, PE header)', () => {
    expect(detectImageMime(Buffer.from([0x4d, 0x5a, 0x90, 0x00]))).toBeNull();
  });

  it('rejette un buffer trop court pour contenir une signature', () => {
    expect(detectImageMime(Buffer.from([0xff]))).toBeNull();
  });
});

describe('extensionForImageMime', () => {
  it('mappe chaque type détecté vers son extension', () => {
    expect(extensionForImageMime('image/jpeg')).toBe('.jpg');
    expect(extensionForImageMime('image/png')).toBe('.png');
    expect(extensionForImageMime('image/webp')).toBe('.webp');
  });
});

describe('mimeForExtension', () => {
  it('mappe chaque extension connue vers son mime, insensible à la casse', () => {
    expect(mimeForExtension('.jpg')).toBe('image/jpeg');
    expect(mimeForExtension('.PNG')).toBe('image/png');
    expect(mimeForExtension('.webp')).toBe('image/webp');
  });

  it('retourne null pour une extension inconnue', () => {
    expect(mimeForExtension('.gif')).toBeNull();
  });
});

describe('isValidPortraitFilename', () => {
  it('accepte un nom de fichier UUID + extension connue (format généré par randomUUID())', () => {
    expect(
      isValidPortraitFilename('11111111-1111-1111-1111-111111111111.jpg'),
    ).toBe(true);
  });

  it('rejette un chemin contenant un traversal (../)', () => {
    expect(isValidPortraitFilename('../../etc/passwd')).toBe(false);
  });

  it('rejette un nom de fichier ne respectant pas le format UUID', () => {
    expect(isValidPortraitFilename('old.jpg')).toBe(false);
  });

  it('rejette une extension non supportée', () => {
    expect(
      isValidPortraitFilename('11111111-1111-1111-1111-111111111111.exe'),
    ).toBe(false);
  });
});
