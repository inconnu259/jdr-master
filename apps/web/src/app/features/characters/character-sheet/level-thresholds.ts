/**
 * Seuils XP et table niveau→capacités dupliqués depuis `packages/game-rules/src/ryuutama/leveling.ts`
 * (`LEVEL_TABLE`) — ce package est Node-only, jamais importé côté Angular (cf. Dev Notes Story 6.2,
 * même contrainte appliquée par `XpDistributionPanel`). Seuls les nombres/la table brute sont
 * dupliqués ici, jamais la logique de validation métier (le plafond d'attribut à 12 reste
 * côté serveur uniquement, cf. Dev Notes Story 6.3).
 */
export type CapabilityTypeLocal =
  | 'attribute'
  | 'landscape'
  | 'immunity'
  | 'class'
  | 'type'
  | 'dragon-protection'
  | 'legendary-journey';

export const LEVEL_TABLE_LOCAL: {
  level: number;
  xp: number;
  capabilities: CapabilityTypeLocal[];
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

function levelForXpLocal(xp: number): number {
  let level = 1;
  for (const entry of LEVEL_TABLE_LOCAL) {
    if (xp >= entry.xp) level = entry.level;
  }
  return level;
}

/** Même logique que `pendingLevels()` côté `packages/game-rules` (cf. leveling.ts). */
export function pendingLevelsLocal(xp: number, appliedCount: number): number[] {
  const reached = levelForXpLocal(xp);
  const pending: number[] = [];
  for (let level = 2; level <= reached; level++) {
    const index = level - 1;
    if (index > appliedCount) pending.push(level);
  }
  return pending;
}
