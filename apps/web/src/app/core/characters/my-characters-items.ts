import type { CharacterSort, MyCharacterDto, MyHommeDragonDto } from '@master-jdr/shared';
import { characterName } from './character.util';
import { sortCharacters } from './character-sort';
import { hommeDragonName } from '../homme-dragon/homme-dragon.util';

/**
 * Élément de la liste « Personnages » (Story 33.5) : un personnage joueur ou un Homme Dragon du
 * MJ. Module pur, voisin de `character-sort.ts` (qui reste inchangé et ne connaît que les
 * personnages) : fusion, recherche et tri des deux natures.
 */
export type MyListItem =
  | { kind: 'character'; id: string; character: MyCharacterDto }
  | { kind: 'hommeDragon'; id: string; hommeDragon: MyHommeDragonDto };

/** Personnages d'abord, puis Hommes Dragons (ordre d'entrée conservé dans chaque groupe). */
export function mergeMyItems(
  characters: readonly MyCharacterDto[],
  hommesDragons: readonly MyHommeDragonDto[],
): MyListItem[] {
  return [
    ...characters.map((character): MyListItem => ({ kind: 'character', id: character.id, character })),
    ...hommesDragons.map(
      (hommeDragon): MyListItem => ({ kind: 'hommeDragon', id: hommeDragon.id, hommeDragon }),
    ),
  ];
}

/** Nom affiché (celui que la recherche et le tri « Nom » lisent). */
export function itemName(item: MyListItem): string {
  return item.kind === 'character'
    ? characterName(item.character)
    : hommeDragonName(item.hommeDragon.nom);
}

export function itemPartieName(item: MyListItem): string {
  return item.kind === 'character' ? item.character.partieName : item.hommeDragon.partieName;
}

/** Recherche sur le nom affiché, insensible à la casse ; requête vide = tout. */
export function filterMyItems(items: readonly MyListItem[], query: string): MyListItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...items];
  return items.filter((item) => itemName(item).toLowerCase().includes(q));
}

/**
 * Tri des deux natures — ne mute jamais l'entrée. « Partie » et « Nom » s'appliquent aux deux
 * natures ; « Niveau » : un Homme Dragon n'en a pas (aucun calcul de scénarios dans la lecture
 * agrégée), il passe après tous les personnages, triés entre eux par nom de partie.
 */
export function sortMyItems(items: readonly MyListItem[], sort: CharacterSort): MyListItem[] {
  const copy = [...items];
  switch (sort) {
    case 'niveau': {
      const characters = copy.filter(
        (item): item is Extract<MyListItem, { kind: 'character' }> => item.kind === 'character',
      );
      const ordered = sortCharacters(
        characters.map((item) => item.character),
        'niveau',
      );
      const byId = new Map(characters.map((item) => [item.id, item]));
      const dragons = copy
        .filter((item) => item.kind === 'hommeDragon')
        .sort((a, b) => itemPartieName(a).localeCompare(itemPartieName(b)));
      return [...ordered.map((c) => byId.get(c.id) as MyListItem), ...dragons];
    }
    case 'partie':
      return copy.sort((a, b) => itemPartieName(a).localeCompare(itemPartieName(b)));
    case 'nom':
      return copy.sort((a, b) => itemName(a).localeCompare(itemName(b)));
    default:
      // Repli défensif (même patron que sortCharacters) : valeur de compte périmée.
      return copy;
  }
}
