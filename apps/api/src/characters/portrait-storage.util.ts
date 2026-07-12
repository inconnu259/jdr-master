import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { UPLOADS_ROOT } from '../common/uploads-root';
import {
  isValidPortraitFilename,
  mimeForExtension,
  type DetectedImageMime,
} from './image-mime.util';

export const PORTRAITS_DIR = join(UPLOADS_ROOT, 'portraits');
export const PORTRAITS_URL_PREFIX = '/uploads/portraits/';

/**
 * Un nom de fichier de portrait légitime est toujours `<uuid>.<ext connue>` (généré par
 * `randomUUID()` côté serveur, cf. `image-mime.util.ts`). Un `portraitUrl` corrompu (édité
 * manuellement, migration ratée) ne doit jamais atteindre `unlink`/`readFile` avec un chemin
 * non validé — défense en profondeur contre un path traversal.
 */
export function extractPortraitFilename(
  portraitUrl: string | null,
): string | null {
  if (!portraitUrl || !portraitUrl.startsWith(PORTRAITS_URL_PREFIX))
    return null;
  const filename = portraitUrl.slice(PORTRAITS_URL_PREFIX.length);
  return isValidPortraitFilename(filename) ? filename : null;
}

/**
 * Lit les octets d'un portrait déjà stocké, avec son mime réel (déduit de son extension —
 * jamais du contenu déclaré par un tiers, cohérent avec la validation à l'upload).
 * Retourne `null` si le `portraitUrl` est invalide/absent ou si le fichier est introuvable
 * (jamais une exception — laisser l'appelant décider comment réagir à l'absence de portrait).
 */
export async function readPortraitFile(
  portraitUrl: string | null,
): Promise<{ buffer: Buffer; mime: DetectedImageMime } | null> {
  const filename = extractPortraitFilename(portraitUrl);
  if (!filename) return null;

  const mime = mimeForExtension(extname(filename));
  if (!mime) return null;

  try {
    const buffer = await readFile(join(PORTRAITS_DIR, filename));
    return { buffer, mime };
  } catch {
    return null;
  }
}
