import type { CharacterDto, PartieMemberDto } from '@master-jdr/shared';
import { characterName } from '../../core/characters/character.util';
import { pendingLevelsLocal } from '../characters/character-sheet/level-thresholds';

export interface RosterRow {
  member: PartieMemberDto;
  isMj: boolean;
  character: CharacterDto | null;
  displayName: string;
  classLabel: string;
  ariaLabel: string;
  /** Le personnage a franchi un seuil de niveau pas encore traité par son propriétaire (cf. LevelUpBanner). */
  hasPendingLevelUp: boolean;
  /** La ligne correspond à l'utilisateur courant — seul cas où un slot vide doit proposer de créer un personnage. */
  isSelf: boolean;
  /** Libellé du rôle de groupe assigné à ce personnage, ou null si aucun. Reflète toujours l'état
   *  réel — la priorité d'affichage avec hasPendingLevelUp est une règle de template (Story 27.3),
   *  jamais encodée ici. */
  assignedRoleLabel: string | null;
}

function hasPendingLevelUp(character: CharacterDto | null): boolean {
  if (!character) return false;
  const appliedCount = ((character.sheetData as any)?.levelUps?.length as number | undefined) ?? 0;
  return pendingLevelsLocal(character.xp, appliedCount).length > 0;
}

/** Suffixe d'accessibilité — même info que le badge visuel, jamais un indicateur couleur/icône seul. */
function withLevelUpSuffix(label: string, pending: boolean): string {
  return pending ? `${label} — montée de niveau disponible` : label;
}

/** Suffixe d'accessibilité pour le rôle assigné (Story 27.3) — même discipline que
 *  withLevelUpSuffix : jamais un badge visuel seul sans équivalent textuel. Le rôle n'est annoncé
 *  que si aucune montée de niveau n'est en attente (même priorité que le badge visuel). */
function withRoleSuffix(label: string, assignedRoleLabel: string | null, pending: boolean): string {
  return assignedRoleLabel && !pending ? `${label} — rôle : ${assignedRoleLabel}` : label;
}

/**
 * Construit une ligne de roster par membre — partagé entre `RosterRail` (desktop) et
 * `RosterStrip` (mobile MJ) pour ne pas dupliquer la logique de résolution
 * membre → personnage → libellé d'accessibilité.
 */
export function buildRosterRows(
  members: PartieMemberDto[],
  characters: CharacterDto[],
  mjId: string,
  classLabelFor: (c: CharacterDto) => string,
  roleLabelFor: (c: CharacterDto) => string | null,
  currentUserId?: string,
): RosterRow[] {
  return members.map((member) => {
    const isMj = member.userId === mjId;
    const isSelf = member.userId === currentUserId;
    const character = characters.find((c) => c.userId === member.userId) ?? null;
    if (isMj) {
      const pending = hasPendingLevelUp(character);
      const assignedRoleLabel = character ? roleLabelFor(character) : null;
      return {
        member,
        isMj,
        character,
        displayName: member.pseudo,
        classLabel: '',
        ariaLabel: withRoleSuffix(
          withLevelUpSuffix(`${member.pseudo} — MJ`, pending),
          assignedRoleLabel,
          pending,
        ),
        hasPendingLevelUp: pending,
        isSelf,
        assignedRoleLabel,
      };
    }
    if (!character) {
      return {
        member,
        isMj,
        character,
        displayName: member.pseudo,
        classLabel: '',
        ariaLabel: isSelf
          ? `${member.pseudo} — créer mon personnage`
          : `${member.pseudo} — aucun personnage créé`,
        hasPendingLevelUp: false,
        isSelf,
        assignedRoleLabel: null,
      };
    }
    const name = characterName(character);
    const classLabel = classLabelFor(character);
    const pending = hasPendingLevelUp(character);
    const assignedRoleLabel = roleLabelFor(character);
    return {
      member,
      isMj,
      character,
      displayName: name,
      classLabel,
      ariaLabel: withRoleSuffix(
        withLevelUpSuffix(`${member.pseudo} — ${name} (${classLabel})`, pending),
        assignedRoleLabel,
        pending,
      ),
      hasPendingLevelUp: pending,
      isSelf,
      assignedRoleLabel,
    };
  });
}
