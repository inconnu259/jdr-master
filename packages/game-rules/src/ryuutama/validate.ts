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

  return { valid: mode === 'strict' ? errors.length === 0 : true, errors };
}
