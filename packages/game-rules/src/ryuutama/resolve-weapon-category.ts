export interface WeaponItemEntry {
  key: string;
  label: string;
  categoryId: string;
}

export interface WeaponCategoryEntry {
  key: string;
  label: string;
  touchFormula: string;
  damageFormula: string;
}

/**
 * Forme du champ `data` d'un `ContentEntryDto` de type `weaponItem`/`weaponCategory` — dérivée de
 * `WeaponItemEntry`/`WeaponCategoryEntry` (sans `key`, déjà porté par `ContentEntryDto.key`).
 * Partagée entre `character-sheet.ts`, `weapon-step.ts` et `ryuutama-pdf.service.ts` pour éviter 3
 * redéclarations locales identiques qui pourraient diverger.
 */
export type WeaponItemContentData = Omit<WeaponItemEntry, 'key'>;
export type WeaponCategoryContentData = Omit<WeaponCategoryEntry, 'key'>;

/**
 * Catalogue dédié à la résolution d'affichage (Story 25.1) — DISTINCT de `RyuutamaCatalog`, qui
 * reste une projection minimale de clés valides pour `validate()`. Ce catalogue porte le contenu
 * riche (labels, formules) nécessaire pour dériver l'arme + sa catégorie à la lecture, construit
 * à la demande par chaque consommateur depuis les `ContentEntryDto[]` bruts qu'il a déjà.
 */
export interface WeaponResolutionCatalog {
  weaponItems: WeaponItemEntry[];
  weaponCategories: WeaponCategoryEntry[];
}

export interface ResolvedWeapon {
  weaponLabel: string;
  categoryId: string;
  categoryLabel: string;
  touchFormula: string;
  damageFormula: string;
}

/**
 * Dérive l'arme précise ET sa catégorie (formules de toucher/dégâts) depuis `weaponId` — jamais
 * stockées en double sur `RyuutamaSheetData` (Story 25.1, AC3). `null` si l'arme ou sa catégorie
 * ne se résout pas (donnée absente/incohérente), jamais une exception.
 */
export function resolveWeaponCategory(
  weaponId: string,
  catalog: WeaponResolutionCatalog,
): ResolvedWeapon | null {
  const item = catalog.weaponItems.find((w) => w.key === weaponId);
  if (!item) return null;
  const category = catalog.weaponCategories.find((c) => c.key === item.categoryId);
  if (!category) return null;
  return {
    weaponLabel: item.label,
    categoryId: category.key,
    categoryLabel: category.label,
    touchFormula: category.touchFormula,
    damageFormula: category.damageFormula,
  };
}

/**
 * Point d'entrée unique de résolution pour tous les consommateurs de lecture (Story 25.2) —
 * `weaponId` (catalogue) et `customWeapon` (arme libre, hérite des formules de sa catégorie)
 * sont sibling **exclusifs** sur `RyuutamaSheetData`, mais peuvent transitoirement coexister en
 * mode d'édition MJ (`validate(data, 'mj', catalog)`, permissif) — la résolution privilégie
 * alors toujours `weaponId` en premier, un seul chemin déterministe. Enveloppe
 * `resolveWeaponCategory()` pour la branche `weaponId`, ne la duplique jamais.
 */
export function resolveWeapon(
  data: { weaponId?: string; customWeapon?: { name: string; categoryId: string } },
  catalog: WeaponResolutionCatalog,
): ResolvedWeapon | null {
  if (data.weaponId) return resolveWeaponCategory(data.weaponId, catalog);
  if (data.customWeapon) {
    const category = catalog.weaponCategories.find(
      (c) => c.key === data.customWeapon!.categoryId,
    );
    if (!category) return null;
    return {
      weaponLabel: data.customWeapon.name,
      categoryId: category.key,
      categoryLabel: category.label,
      touchFormula: category.touchFormula,
      damageFormula: category.damageFormula,
    };
  }
  return null;
}
