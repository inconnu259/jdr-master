export interface RyuutamaSheetData {
  classId: string;
  specialtyTypeId?: string; // obligatoire si classId === "artisan"
  typeId: string;
  attributes: { AGI: number; ESP: number; INT: number; VIG: number };
  weaponCategoryId: string;
  fetiqueObject?: string;
  equipment?: { individual: string[]; group: string[] };
  narrative?: {
    sex?: string;
    age?: string;
    physicalTraits?: string;
    homeTown?: string;
    motivation?: string;
    name?: string;
    personality?: string;
  };
}

export interface DerivedStats {
  PV: number; // VIG × 2
  PE: number; // ESP × 2
  Condition: number; // VIG + ESP
  Initiative: number; // AGI + INT
  Encombrement: number; // VIG + 3
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Catalogue de contenu Ryuutama valide, dérivé du contenu seedé en base
 * (`GameSystemService.getContent`) — évite que `validate()` code en dur ses propres listes
 * déconnectées du contenu réellement seedé.
 */
export interface RyuutamaCatalog {
  validClasses: string[];
  validTypes: string[];
  validWeapons: string[];
  /** Chaque pattern est un tableau de 4 valeurs déjà trié (ex. [4, 6, 6, 8] pour "Polyvalent"). */
  attributePatterns: number[][];
}
