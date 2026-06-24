import { GAME_SYSTEMS } from '@master-jdr/shared';
import type { PartieKind } from '@master-jdr/shared';

export function gameSystemName(id: string): string {
  return GAME_SYSTEMS.find((s) => s.id === id)?.name ?? id;
}

const KIND_LABELS: Record<PartieKind, string> = {
  ONE_SHOT: 'One-shot',
  CAMPAGNE_LINEAIRE: 'Campagne',
  CAMPAGNE_EPISODIQUE: 'Campagne épisodique',
};

export function partieKindLabel(kind: PartieKind): string {
  return KIND_LABELS[kind] ?? kind;
}
