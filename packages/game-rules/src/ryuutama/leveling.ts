export type CapabilityType =
  | 'attribute'
  | 'landscape'
  | 'immunity'
  | 'class'
  | 'type'
  | 'dragon-protection'
  | 'legendary-journey';

export const LEVEL_TABLE: {
  level: number;
  xp: number;
  capabilities: CapabilityType[];
}[] = [
  { level: 2, xp: 100, capabilities: ['attribute'] },
  { level: 3, xp: 600, capabilities: ['landscape'] },
  { level: 4, xp: 1200, capabilities: ['attribute', 'immunity'] },
  { level: 5, xp: 2000, capabilities: ['class'] },
  { level: 6, xp: 3000, capabilities: ['attribute', 'type'] },
  { level: 7, xp: 4200, capabilities: ['landscape'] },
  { level: 8, xp: 5800, capabilities: ['attribute'] },
  { level: 9, xp: 7500, capabilities: ['dragon-protection'] },
  { level: 10, xp: 10000, capabilities: ['attribute', 'legendary-journey'] },
];

/** Niveau dérivé du total d'XP cumulé — 1 si en dessous du premier seuil (niveau 2, 100 XP). */
export function levelForXp(xp: number): number {
  let level = 1;
  for (const entry of LEVEL_TABLE) {
    if (xp >= entry.xp) level = entry.level;
  }
  return level;
}

/**
 * Niveaux franchis (au-delà du seuil) mais pas encore appliqués (`appliedCount` = nombre
 * d'entrées déjà présentes dans `sheetData.levelUps[]`). Ex. `appliedCount=0`, `xp=700` → `[2, 3]`.
 */
export function pendingLevels(xp: number, appliedCount: number): number[] {
  const reached = levelForXp(xp);
  const pending: number[] = [];
  for (let level = 2; level <= reached; level++) {
    // Niveau 2 = 1ère entrée de levelUps[], niveau 3 = 2e, etc. — index 1-based à partir de 2.
    const index = level - 1;
    if (index > appliedCount) pending.push(level);
  }
  return pending;
}
