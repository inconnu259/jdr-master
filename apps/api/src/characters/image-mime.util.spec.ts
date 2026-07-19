import sharp from 'sharp';
import {
  detectImageMime,
  extensionForImageMime,
  isValidPortraitFilename,
  mimeForExtension,
  stripImageMetadata,
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

describe('stripImageMetadata', () => {
  it('supprime les métadonnées EXIF (GPS) d\'une image réelle', async () => {
    const withExif = await sharp({
      create: { width: 8, height: 8, channels: 3, background: { r: 255, g: 0, b: 0 } },
    })
      .jpeg()
      .withExif({
        IFD0: { Copyright: 'Test' },
        IFD3: {
          GPSLatitudeRef: 'N',
          GPSLatitude: '51/1 30/1 3230/100',
          GPSLongitudeRef: 'W',
          GPSLongitude: '0/1 7/1 4366/100',
        },
      })
      .toBuffer();
    const inputMeta = await sharp(withExif).metadata();
    expect(inputMeta.exif).toBeDefined(); // sanity check : l'input a bien des métadonnées

    const cleaned = await stripImageMetadata(withExif);
    const outputMeta = await sharp(cleaned).metadata();
    expect(outputMeta.exif).toBeUndefined();
  });

  it('applique la rotation EXIF aux pixels avant de retirer le tag Orientation (AC2)', async () => {
    const oriented = await sharp({
      create: { width: 8, height: 4, channels: 3, background: { r: 0, g: 255, b: 0 } },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const cleaned = await stripImageMetadata(oriented);
    const meta = await sharp(cleaned).metadata();
    expect(meta.width).toBe(4); // dimensions inversées : la rotation 90° a bien été appliquée
    expect(meta.height).toBe(8);
    expect(meta.orientation).toBeUndefined();
  });

  it('préserve le format d\'entrée (JPEG reste JPEG, AC3)', async () => {
    const buf = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .jpeg()
      .toBuffer();
    const cleaned = await stripImageMetadata(buf);
    const meta = await sharp(cleaned).metadata();
    expect(meta.format).toBe('jpeg');
  });

  it('préserve le format d\'entrée (PNG reste PNG, AC3)', async () => {
    const buf = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .png()
      .toBuffer();
    const cleaned = await stripImageMetadata(buf);
    const meta = await sharp(cleaned).metadata();
    expect(meta.format).toBe('png');
  });

  it('préserve le format d\'entrée (WEBP reste WEBP, AC3)', async () => {
    const buf = await sharp({
      create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 255 } },
    })
      .webp()
      .toBuffer();
    const cleaned = await stripImageMetadata(buf);
    const meta = await sharp(cleaned).metadata();
    expect(meta.format).toBe('webp');
  });

  it('laisse une image sans tag EXIF Orientation inchangée (pas de rotation intempestive)', async () => {
    const buf = await sharp({
      create: { width: 8, height: 4, channels: 3, background: { r: 10, g: 20, b: 30 } },
    })
      .jpeg()
      .toBuffer();
    const inputMeta = await sharp(buf).metadata();
    expect(inputMeta.orientation).toBeUndefined();

    const cleaned = await stripImageMetadata(buf);
    const meta = await sharp(cleaned).metadata();
    expect(meta.width).toBe(8);
    expect(meta.height).toBe(4);
    expect(meta.orientation).toBeUndefined();
  });

  it('rejette (lève) un buffer avec une signature magique valide mais un contenu indécodable', async () => {
    const fakeJpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
    await expect(stripImageMetadata(fakeJpeg)).rejects.toThrow();
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
