import type {
  RyuutamaSheetData,
  ValidationResult,
  ValidationError,
  RyuutamaCatalog,
} from './types.ts';

export function validate(
  data: RyuutamaSheetData,
  mode: 'strict' | 'mj',
  catalog: RyuutamaCatalog,
): ValidationResult {
  const { validClasses, validTypes, validWeapons, attributePatterns } =
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

  // Règle 4 : arme favorite parmi les catégories seedées en base
  if (!data.weaponCategoryId || !validWeapons.includes(data.weaponCategoryId)) {
    errors.push({
      field: 'weaponCategoryId',
      message: `Arme favorite invalide. Catégories acceptées : ${validWeapons.join(', ')}`,
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

  return { valid: mode === 'strict' ? errors.length === 0 : true, errors };
}
