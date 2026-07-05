export type DetectedImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

const MIME_EXTENSION: Record<DetectedImageMime, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
};

/**
 * Détecte le type réel d'une image par ses octets magiques (signatures binaires),
 * jamais par l'extension du fichier ni le `Content-Type` déclaré par le client
 * (les deux sont trivialement falsifiables). Retourne `null` si le buffer ne
 * correspond à aucun des 3 formats acceptés.
 */
export function detectImageMime(buffer: Buffer): DetectedImageMime | null {
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return 'image/jpeg';
  }
  if (
    buffer.length >= 8 &&
    buffer
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (
    buffer.length >= 12 &&
    buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buffer.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }
  return null;
}

export function extensionForImageMime(mime: DetectedImageMime): string {
  return MIME_EXTENSION[mime];
}

const EXTENSION_MIME: Record<string, DetectedImageMime> = {
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};

export function mimeForExtension(ext: string): DetectedImageMime | null {
  return EXTENSION_MIME[ext.toLowerCase()] ?? null;
}

/**
 * Un nom de fichier de portrait légitime est TOUJOURS `<uuid v4>.<ext connue>` (généré par
 * `randomUUID()` côté serveur, cf. `updatePortrait`). Validé avant tout accès disque
 * (`unlink`/`readFile`) en défense en profondeur contre un `portraitUrl` corrompu qui
 * contiendrait `../` ou un séparateur de chemin.
 */
const PORTRAIT_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/i;

export function isValidPortraitFilename(filename: string): boolean {
  return PORTRAIT_FILENAME_RE.test(filename);
}
