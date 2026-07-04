import type { CharacterDto, ContentEntryDto, GameSystemContentDto } from '@master-jdr/shared';

/** Nom narratif du personnage, ou libellé de repli si le joueur ne l'a pas renseigné. */
export function characterName(character: CharacterDto): string {
  const narrative = character.sheetData?.['narrative'] as { name?: string } | undefined;
  return narrative?.name?.trim() || 'Personnage sans nom';
}

/** Résout `data` de l'entrée de `GameSystemContent` dont la clé correspond, ou `null` si absent. */
export function findContentEntry<T>(
  content: GameSystemContentDto | null | undefined,
  contentType: string,
  key: string | undefined,
): T | null {
  if (!key) return null;
  const entry = content?.[contentType]?.find((e: ContentEntryDto) => e.key === key);
  return (entry?.data as T) ?? null;
}
