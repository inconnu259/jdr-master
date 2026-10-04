/** Nom affiché d'un Homme Dragon : valeur normalisée, sinon libellé de repli — même convention que
 *  `characterName()` (`character.util.ts`). Source unique pour la fiche et la liste « Personnages ». */
export function hommeDragonName(nom: string | null | undefined): string {
  return nom?.trim() || 'Homme Dragon sans nom';
}

/** Texte de la carte « Personnages » quand l'Homme Dragon n'a aucune aventure : lisible sans
 *  l'ouvrir, jamais porté par une couleur seule (Story 33.8). */
export const SANS_AVENTURE_LABEL = 'Sans aventure';

/** Séparateur des noms d'aventures sur une carte (« Les Vents du Nord · L'Archipel »). */
const AVENTURES_SEPARATOR = ' · ';

/** Noms des aventures d'un Homme Dragon, joints pour la carte « Personnages » (Story 33.8) ; la
 *  troncature d'un libellé trop long est visuelle (CSS), le texte complet reste lisible au survol et
 *  pour un lecteur d'écran. Sans aventure : « Sans aventure ». */
export function hommeDragonAventuresLabel(
  aventures: readonly { nom: string }[] | null | undefined,
): string {
  const names = (aventures ?? []).map((a) => a.nom.trim()).filter((nom) => nom.length > 0);
  return names.length > 0 ? names.join(AVENTURES_SEPARATOR) : SANS_AVENTURE_LABEL;
}
