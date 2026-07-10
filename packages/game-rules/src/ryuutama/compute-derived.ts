import type { RyuutamaSheetData, DerivedStats } from './types.ts';

export function computeDerived(data: RyuutamaSheetData): DerivedStats {
  const { AGI, ESP, INT, VIG } = data.attributes;
  const levelUps = data.levelUps ?? [];
  const pvAllocated = levelUps.reduce((sum, entry) => sum + entry.pvAllocated, 0);
  const peAllocated = levelUps.reduce((sum, entry) => sum + entry.peAllocated, 0);
  return {
    PV: VIG * 2 + pvAllocated,
    PE: ESP * 2 + peAllocated,
    Condition: VIG + ESP,
    Initiative: AGI + INT,
    Encombrement: VIG + 3 + levelUps.length,
  };
}
