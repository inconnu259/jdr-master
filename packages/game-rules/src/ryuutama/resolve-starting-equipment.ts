export interface EquipmentCatalogEntry {
  key: string;
  label: string;
  priceGold: number;
  nature: 'individual' | 'contenant' | 'animal';
  /** Absent pour `nature: 'animal'` — un animal n'a jamais de poids (FR8, Story 6.4/14.1). */
  weight?: number;
  effect?: string;
}

interface ResolvedItem {
  name: string;
  weight: number;
  price: string;
  effect?: string;
}

interface ResolvedAnimal {
  name: string;
  price: string;
  effect?: string;
}

export interface ResolvedStartingEquipment {
  individual: ResolvedItem[];
  contenants: ResolvedItem[];
  animaux: ResolvedAnimal[];
  totalPriceGold: number;
  /** Clés de la sélection absentes du catalogue (contenu incohérent/client corrompu) — jamais une exception. */
  unresolvedKeys: string[];
}

/**
 * Résout une sélection d'équipement de départ (Story 26.1, clés du catalogue `equipmentItem` +
 * quantités) en équipement réel (`equipment.individual`/`contenants`/`animaux`) — une entrée
 * distincte par unité achetée (jamais un hack de quantité dans le nom, décision utilisateur).
 * Fonction pure, jamais de `throw` : toute clé absente du catalogue atterrit dans
 * `unresolvedKeys`, même convention de dégradation gracieuse que `resolveWeaponCategory`.
 */
export function resolveStartingEquipment(
  selection: { key: string; quantity: number }[],
  catalog: EquipmentCatalogEntry[],
): ResolvedStartingEquipment {
  const individual: ResolvedItem[] = [];
  const contenants: ResolvedItem[] = [];
  const animaux: ResolvedAnimal[] = [];
  const unresolvedKeys: string[] = [];
  let totalPriceGold = 0;

  for (const { key, quantity } of selection) {
    const entry = catalog.find((e) => e.key === key);
    // `quantity` vient de `sheetData: Record<string, unknown>` (aucune contrainte de forme au
    // niveau DTO) — un nombre négatif ne pousserait aucune entrée (boucle jamais exécutée) tout
    // en soustrayant du totalPriceGold (contourne le budget de 1000 Po), et un nombre fractionnaire
    // pousserait une entrée complète tout en ne facturant qu'une fraction du prix (revue de code).
    // Traité comme une clé non résolue : même chemin de rejet que le reste de cette fonction.
    if (!entry || !Number.isInteger(quantity) || quantity <= 0) {
      unresolvedKeys.push(key);
      continue;
    }
    totalPriceGold += entry.priceGold * quantity;
    const price = `${entry.priceGold} Po`;
    for (let i = 0; i < quantity; i++) {
      if (entry.nature === 'animal') {
        animaux.push({ name: entry.label, price, effect: entry.effect });
      } else if (entry.nature === 'contenant') {
        contenants.push({
          name: entry.label,
          weight: entry.weight ?? 0,
          price,
          effect: entry.effect,
        });
      } else {
        individual.push({
          name: entry.label,
          weight: entry.weight ?? 0,
          price,
          effect: entry.effect,
        });
      }
    }
  }

  return { individual, contenants, animaux, totalPriceGold, unresolvedKeys };
}
