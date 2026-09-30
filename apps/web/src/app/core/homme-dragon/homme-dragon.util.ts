/** Nom affiché d'un Homme Dragon : valeur normalisée, sinon libellé de repli — même convention que
 *  `characterName()` (`character.util.ts`). Source unique pour la fiche et la liste « Personnages ». */
export function hommeDragonName(nom: string | null | undefined): string {
  return nom?.trim() || 'Homme Dragon sans nom';
}
