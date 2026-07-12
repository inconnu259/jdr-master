export type DetectedDocumentMime = 'application/pdf' | 'text/plain';

const MIME_EXTENSION: Record<DetectedDocumentMime, string> = {
  'application/pdf': '.pdf',
  'text/plain': '.txt',
};

const TEXT_SNIFF_WINDOW = 8000;

/**
 * Détecte le type réel d'un document par ses octets, jamais par l'extension du fichier ni
 * le `Content-Type` déclaré par le client (les deux sont trivialement falsifiables) — même
 * principe que `detectImageMime`. Le PDF a une signature magique (`%PDF-`) ; le texte brut
 * n'en a aucune de fiable, donc heuristique : un vrai texte UTF-8/ASCII ne contient jamais
 * de byte NUL, un fichier binaire mal étiqueté `.txt` en contient presque toujours un
 * rapidement — on inspecte les 8000 premiers octets.
 */
export function detectDocumentMime(
  buffer: Buffer,
): DetectedDocumentMime | null {
  if (
    buffer.length >= 5 &&
    buffer.subarray(0, 5).toString('ascii') === '%PDF-'
  ) {
    return 'application/pdf';
  }
  const window = buffer.subarray(0, TEXT_SNIFF_WINDOW);
  if (buffer.length > 0 && !window.includes(0x00)) {
    return 'text/plain';
  }
  return null;
}

export function extensionForDocumentMime(mime: DetectedDocumentMime): string {
  return MIME_EXTENSION[mime];
}

const EXTENSION_MIME: Record<string, DetectedDocumentMime> = {
  '.pdf': 'application/pdf',
  '.txt': 'text/plain',
};

export function mimeForExtension(ext: string): DetectedDocumentMime | null {
  return EXTENSION_MIME[ext.toLowerCase()] ?? null;
}

/**
 * Un nom de fichier de document légitime est toujours `<uuid v4>.<ext connue>` (généré par
 * `randomUUID()` côté serveur, cf. `writeDocumentFile`). Validé avant tout accès disque en
 * défense en profondeur contre un nom corrompu contenant `../` ou un séparateur de chemin.
 */
const DOCUMENT_FILENAME_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(pdf|txt)$/i;

export function isValidDocumentFilename(filename: string): boolean {
  return DOCUMENT_FILENAME_RE.test(filename);
}
