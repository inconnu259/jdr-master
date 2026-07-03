import type {
  RyuutamaSheetData,
  ValidationResult,
  ValidationError,
} from './types.ts';

const VALID_CLASSES = [
  'artisan',
  'chasseur',
  'fermier',
  'guerisseur',
  'marchand',
  'menestrel',
  'noble',
];
const VALID_TYPES = ['attaque', 'technique', 'magie'];
const VALID_WEAPONS = ['arc', 'epee-courte', 'epee-longue', 'hache', 'lance'];
const POLYVALENT_PATTERN = [4, 6, 6, 8]; // sorted

export function validate(
  data: RyuutamaSheetData,
  mode: 'strict' | 'mj',
): ValidationResult {
  if (mode === 'mj') return { valid: true, errors: [] }; // no-op réservé à P4

  const errors: ValidationError[] = [];

  // Règle 1 : exactement 1 classe parmi les 7
  if (!data.classId || !VALID_CLASSES.includes(data.classId)) {
    errors.push({
      field: 'classId',
      message: `Classe invalide. Classes acceptées : ${VALID_CLASSES.join(', ')}`,
    });
  }

  // Règle 2 : exactement 1 type parmi les 3
  if (!data.typeId || !VALID_TYPES.includes(data.typeId)) {
    errors.push({
      field: 'typeId',
      message: `Type invalide. Types acceptés : ${VALID_TYPES.join(', ')}`,
    });
  }

  // Règle 3 : attributs conformes au pattern Polyvalent {4,6,6,8}
  const attrs = data.attributes;
  if (!attrs) {
    errors.push({ field: 'attributes', message: 'Les attributs sont requis' });
  } else {
    const values = [attrs.AGI, attrs.ESP, attrs.INT, attrs.VIG].sort(
      (a, b) => a - b,
    );
    const matches =
      values.length === 4 &&
      values.every((v, i) => v === POLYVALENT_PATTERN[i]);
    if (!matches) {
      errors.push({
        field: 'attributes',
        message:
          'Les attributs doivent correspondre au pattern Polyvalent {8,4,6,6}',
      });
    }
  }

  // Règle 4 : arme favorite parmi les 5 catégories
  if (!data.weaponCategoryId || !VALID_WEAPONS.includes(data.weaponCategoryId)) {
    errors.push({
      field: 'weaponCategoryId',
      message: `Arme favorite invalide. Catégories acceptées : ${VALID_WEAPONS.join(', ')}`,
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

  return { valid: errors.length === 0, errors };
}
