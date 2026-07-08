import type { CharacterDto, PartieMemberDto } from '@master-jdr/shared';
import { characterName } from '../../core/characters/character.util';

export interface RosterRow {
  member: PartieMemberDto;
  isMj: boolean;
  character: CharacterDto | null;
  displayName: string;
  classLabel: string;
  ariaLabel: string;
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
): RosterRow[] {
  return members.map((member) => {
    const isMj = member.userId === mjId;
    const character = characters.find((c) => c.userId === member.userId) ?? null;
    if (isMj) {
      return {
        member,
        isMj,
        character,
        displayName: member.pseudo,
        classLabel: '',
        ariaLabel: `${member.pseudo} — MJ`,
      };
    }
    if (!character) {
      return {
        member,
        isMj,
        character,
        displayName: member.pseudo,
        classLabel: '',
        ariaLabel: `${member.pseudo} — aucun personnage créé`,
      };
    }
    const name = characterName(character);
    const classLabel = classLabelFor(character);
    return {
      member,
      isMj,
      character,
      displayName: name,
      classLabel,
      ariaLabel: `${member.pseudo} — ${name} (${classLabel})`,
    };
  });
}
