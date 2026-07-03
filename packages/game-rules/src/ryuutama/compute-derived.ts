import type { RyuutamaSheetData, DerivedStats } from './types.ts';

export function computeDerived(data: RyuutamaSheetData): DerivedStats {
  const { AGI, ESP, INT, VIG } = data.attributes;
  return {
    PV: VIG * 2,
    PE: ESP * 2,
    Condition: VIG + ESP,
    Initiative: AGI + INT,
    Encombrement: VIG + 3,
  };
}
