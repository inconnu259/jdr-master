import type {
  RyuutamaSheetData,
  ValidationResult,
  ValidationError,
  RyuutamaCatalog,
} from './types.ts';

/**
 * Catégorie sans choix d'arme précise (Story 25.1, `NO_ITEM_CHOICE_CATEGORY` côté web) — l'assistant
 * n'affiche jamais la carte « Créer une arme libre » pour elle (auto-assignation directe de son
 * unique `weaponItem`). Revue de code Story 25.2 : `validate()` doit refuser explicitement un
 * `customWeapon.categoryId` égal à cette catégorie (atteignable seulement via un appel API direct,
 * hors assistant), pour ne pas laisser une incohérence narrative passer la validation stricte.
 */
const NO_CUSTOM_WEAPON_CATEGORY = 'mains-nues';

/** Limite alignée sur les champs de nom similaires du modèle (`InventoryItem`/`Contenant`/`Animal`,
 *  tous `@MaxLength(200)` via DTO dédié — revue de code Story 25.2). */
const CUSTOM_WEAPON_NAME_MAX_LENGTH = 200;

export function validate(
  data: RyuutamaSheetData,
  mode: 'strict' | 'mj',
  catalog: RyuutamaCatalog,
): ValidationResult {
  const { validClasses, validTypes, validWeaponItems, attributePatterns } =
    catalog;
  const errors: ValidationError[] = [];

  // Règle 1 : exactement 1 classe parmi celles seedées en base
  if (!data.classId || !validClasses.includes(data.classId)) {
    errors.push({
      field: 'classId',
      message: `Classe invalide. Classes acceptées : ${validClasses.join(', ')}`,
    });
  }

  // Règle 2 : exactement 1 type parmi ceux seedés en base
  if (!data.typeId || !validTypes.includes(data.typeId)) {
    errors.push({
      field: 'typeId',
      message: `Type invalide. Types acceptés : ${validTypes.join(', ')}`,
    });
  }

  // Règle 3 : attributs conformes à l'un des patterns seedés en base (ex. Polyvalent {4,6,6,8})
  const attrs = data.attributes;
  if (!attrs) {
    errors.push({ field: 'attributes', message: 'Les attributs sont requis' });
  } else {
    const values = [attrs.AGI, attrs.ESP, attrs.INT, attrs.VIG].sort(
      (a, b) => a - b,
    );
    const matches = attributePatterns.some(
      (pattern) =>
        values.length === pattern.length &&
        values.every((v, i) => v === pattern[i]),
    );
    if (!matches) {
      errors.push({
        field: 'attributes',
        message: 'Les attributs ne correspondent à aucun pattern connu',
      });
    }
  }

  // Règle 4 : arme précise parmi celles seedées en base (Story 25.1 : catalogue weaponItem),
  // OU arme libre (Story 25.2) — sibling exclusif : jamais les deux, jamais aucun des deux.
  // `field: 'weaponId'` conservé sur toutes les branches (routage FIELD_TO_STEP_KEY inchangé).
  if (data.weaponId && data.customWeapon) {
    errors.push({
      field: 'weaponId',
      message:
        'Une seule arme doit être renseignée : choisie dans le catalogue ou libre, jamais les deux',
    });
  } else if (data.weaponId) {
    if (!validWeaponItems.includes(data.weaponId)) {
      errors.push({
        field: 'weaponId',
        message: `Arme invalide. Armes acceptées : ${validWeaponItems.join(', ')}`,
      });
    }
  } else if (data.customWeapon) {
    const validWeaponCategories = catalog.validWeaponCategories ?? [];
    const { name, categoryId } = data.customWeapon;
    // `data.customWeapon` vient de `sheetData: Record<string, unknown>` (aucune contrainte de
    // forme au niveau du DTO, cf. create-character.dto.ts) — un client pourrait envoyer n'importe
    // quelle valeur JSON pour `name`/`categoryId`. Sans ces gardes de type, `name.trim()` lèverait
    // une exception non interceptée (500) plutôt qu'une erreur de validation propre (400) si `name`
    // n'est pas une chaîne (même piège que `knownRitualSpells`, Règle 7, corrigé en revue de code).
    const isValidName =
      typeof name === 'string' &&
      !!name.trim() &&
      name.length <= CUSTOM_WEAPON_NAME_MAX_LENGTH;
    const isValidCategory =
      typeof categoryId === 'string' &&
      categoryId !== NO_CUSTOM_WEAPON_CATEGORY &&
      validWeaponCategories.includes(categoryId);
    if (!isValidName || !isValidCategory) {
      errors.push({
        field: 'weaponId',
        message: `Arme libre invalide. Un nom (max ${CUSTOM_WEAPON_NAME_MAX_LENGTH} caractères) et une catégorie parmi : ${validWeaponCategories
          .filter((c) => c !== NO_CUSTOM_WEAPON_CATEGORY)
          .join(', ')} sont requis`,
      });
    }
  } else {
    errors.push({
      field: 'weaponId',
      message: `Arme invalide. Armes acceptées : ${validWeaponItems.join(', ')}`,
    });
  }

  // Règle 5 : sous-choix Artisan obligatoire
  if (data.classId === 'artisan' && !data.specialtyTypeId?.trim()) {
    errors.push({
      field: 'specialtyTypeId',
      message:
        "Le type d'objet de spécialité est obligatoire pour la classe Artisan",
    });
  }

  // Règle 6 : choix requis à la création propres à certaines classes (Story 23.8), ex.
  // Métier d'appoint (Fermier/Ermite), Métamorphose (Ermite), Autorité (Dresseur),
  // Climatophile (Météomancien). Le choix Climatophile (kind "landscape-capability") est
  // stocké dans `classCapabilities` plutôt que `classChoices` (cf. types.ts) — `kind` est donc
  // requis ici pour ne délester vers `classCapabilities` QUE ce choix précis (revue de code,
  // 2026-07-26) : sans cette distinction, un `classCapabilities` non vide validerait à tort
  // n'importe quel autre choix manquant de la même classe (ex. l'Ermite, qui n'a aucun choix
  // "landscape-capability" mais deux choix "eligible-talent"/"landscape-flavor" à ne jamais
  // pouvoir contourner ainsi).
  const requiredChoices = data.classId
    ? catalog.requiredChoicesByClass?.[data.classId]
    : undefined;
  if (requiredChoices) {
    for (const choice of requiredChoices) {
      const answered =
        choice.kind === 'landscape-capability'
          ? Boolean(data.classCapabilities && data.classCapabilities.length > 0)
          : Boolean(data.classChoices?.[choice.key]?.trim());
      if (!answered) {
        errors.push({
          field: choice.key,
          message: `Le choix requis "${choice.key}" est obligatoire pour cette classe`,
        });
      }
    }
  }

  // Règle 7 : choix de magie à la création pour le type Magie (Story 23.9). Contrairement à la
  // magie des saisons (choix unique de saison, le personnage connaît automatiquement ses sorts,
  // cf. docs/magie.md), la magie rituelle exige un choix explicite : exactement 2 sorts du
  // catalogue rituel débutant. Ne pas se contenter de vérifier la présence (leçon de la revue de
  // code Règle 6, Story 23.8) : vérifier aussi le contenu (appartenance au catalogue, absence de
  // doublon, nombre exact) pour ne jamais faire confiance au seul client.
  if (data.typeId === 'magie') {
    const validSeasons = catalog.validSeasons ?? [];
    if (!data.magicSeason || !validSeasons.includes(data.magicSeason)) {
      errors.push({
        field: 'magicSeason',
        message:
          validSeasons.length > 0
            ? `Saison d'affinité invalide. Saisons acceptées : ${validSeasons.join(', ')}`
            : "Saison d'affinité invalide (aucune saison disponible dans le catalogue)",
      });
    }

    // `data.knownRitualSpells` vient de `sheetData: Record<string, unknown>` (aucune contrainte
    // de forme au niveau du DTO, cf. create-character.dto.ts) — un client pourrait envoyer
    // n'importe quelle valeur JSON pour ce champ. Sans cette garde, `new Set(...)`/`.every(...)`
    // lèveraient une exception non interceptée (500) plutôt qu'une erreur de validation propre
    // (400) si la valeur n'est pas un tableau (revue de code, 2026-07-26).
    const knownRitualSpells = Array.isArray(data.knownRitualSpells)
      ? data.knownRitualSpells
      : undefined;
    const validRitualSpells = catalog.validDebutantRitualSpells ?? [];
    const hasNoDuplicates =
      !!knownRitualSpells &&
      new Set(knownRitualSpells).size === knownRitualSpells.length;
    const allValid =
      !!knownRitualSpells &&
      knownRitualSpells.every((key) => validRitualSpells.includes(key));
    if (
      !knownRitualSpells ||
      knownRitualSpells.length !== 2 ||
      !hasNoDuplicates ||
      !allValid
    ) {
      errors.push({
        field: 'knownRitualSpells',
        message:
          'Exactement 2 sorts de magie rituelle débutants distincts sont requis pour le type Magie',
      });
    }
  }

  return { valid: mode === 'strict' ? errors.length === 0 : true, errors };
}
