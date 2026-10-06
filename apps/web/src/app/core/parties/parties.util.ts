import { GAME_SYSTEMS } from '@master-jdr/shared';
import type { PartieKind } from '@master-jdr/shared';

export function gameSystemName(id: string): string {
  return GAME_SYSTEMS.find((s) => s.id === id)?.name ?? id;
}

/** Clés de ton du libellé court d'un type de partie (sous-titre de tuile, bandeau de la partie).
 *  Les clés suivent l'ordre alphabétique des libellés (Campagne < Campagne épisodique < One-shot) :
 *  le tri « Type » de `party-sort.ts` s'appuie dessus, sans dépendre du thème actif. */
const KIND_LABEL_KEYS: Record<PartieKind, string> = {
  ONE_SHOT: 'core.parties_kind_one_shot',
  CAMPAGNE_LINEAIRE: 'core.parties_kind_campagne',
  CAMPAGNE_EPISODIQUE: 'core.parties_kind_campagne_episodique',
};

/** Clé de ton du libellé du type de partie ; l'appelant la résout (`theme.tone()[clé]`) et retombe
 *  sur la valeur d'API brute si le type est inconnu, comme le faisait l'ancien repli sur `kind`. */
export function partieKindLabelKey(kind: PartieKind): string {
  return KIND_LABEL_KEYS[kind] ?? kind;
}
