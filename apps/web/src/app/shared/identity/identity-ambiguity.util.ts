/** Story 28.3 (AC3) : détecte les `userId` dont le `displayName` est partagé par au moins un
 *  autre élément de la même liste — motif identique répété sur 4-5 écrans « sans personnage »,
 *  factorisé plutôt que dupliqué (creneau-card, scenario-editor, scenario-read-dialog, partie-detail). */
export function ambiguousUserIds(
  entries: { userId: string; displayName: string }[],
): Set<string> {
  const counts = new Map<string, number>();
  for (const e of entries) {
    counts.set(e.displayName, (counts.get(e.displayName) ?? 0) + 1);
  }
  const ambiguous = new Set<string>();
  for (const e of entries) {
    if ((counts.get(e.displayName) ?? 0) > 1) ambiguous.add(e.userId);
  }
  return ambiguous;
}
