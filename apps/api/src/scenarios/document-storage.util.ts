import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, join } from 'node:path';
import { Logger } from '@nestjs/common';
import { UPLOADS_ROOT } from '../common/uploads-root';
import {
  extensionForDocumentMime,
  isValidDocumentFilename,
  mimeForExtension,
  type DetectedDocumentMime,
} from './document-mime.util';

export const DOCUMENTS_DIR = join(UPLOADS_ROOT, 'scenario-documents');

const logger = new Logger('DocumentStorage');

/**
 * Écrit un document sur disque sous un nom `<uuid v4>.<ext>` généré côté serveur (jamais le
 * nom fourni par le client) — même pattern que `updatePortrait`. Retourne le nom de fichier
 * à persister en base (`ScenarioDocument.filename`).
 */
export async function writeDocumentFile(
  buffer: Buffer,
  mime: DetectedDocumentMime,
): Promise<string> {
  await mkdir(DOCUMENTS_DIR, { recursive: true });
  const filename = `${randomUUID()}${extensionForDocumentMime(mime)}`;
  await writeFile(join(DOCUMENTS_DIR, filename), buffer);
  return filename;
}

/**
 * Lit les octets d'un document déjà stocké. Valide `isValidDocumentFilename` avant tout accès
 * disque (défense en profondeur, même principe que `readPortraitFile`). Retourne `null` si le
 * nom est invalide ou le fichier introuvable — jamais une exception, l'appelant (service) décide
 * comment réagir (404).
 */
export async function readDocumentFile(
  filename: string,
): Promise<{ buffer: Buffer; mime: DetectedDocumentMime } | null> {
  if (!isValidDocumentFilename(filename)) return null;
  const mime = mimeForExtension(extname(filename));
  if (!mime) return null;
  try {
    const buffer = await readFile(join(DOCUMENTS_DIR, filename));
    return { buffer, mime };
  } catch {
    return null;
  }
}

/**
 * Supprime un fichier écrit sur disque, uniquement pour nettoyer un fichier orphelin
 * (ex. insertion Prisma échouée après `writeDocumentFile`) — jamais une exception,
 * ne fait que logger un avertissement si la suppression échoue (même pattern que
 * `unlinkPortraitFile`, Story 4.5).
 */
export async function deleteDocumentFile(filename: string): Promise<void> {
  try {
    await unlink(join(DOCUMENTS_DIR, filename));
  } catch (e) {
    logger.warn(
      `Échec de suppression du document orphelin ${filename}`,
      e as Error,
    );
  }
}
