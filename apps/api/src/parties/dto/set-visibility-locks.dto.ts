import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Autorise les identifiants de sous-clé (camelCase alphanumérique) — jamais une chaîne libre.
const FIELD_KEY_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*$/;

/**
 * Périmètre resserré (décision utilisateur 2026-09-22, cf. Boundaries du spec 31.6) : SEULES ces
 * 10 clés — déjà déclarées `lockable: true` dans `sheetSchema` (`GameSystemService.getSchema`) —
 * sont verrouillables. `classChoices`/`classCapabilities`/`magicSeason`/`knownRitualSpells`/
 * `levelUps` restent hors périmètre : verrouiller `levelUps` en particulier retirerait
 * `sheetData.levelUps` et ferait silencieusement chuter `CharacterDto.level` à 1 sans jamais
 * l'annoncer dans `hiddenFields` (`level` n'est pas dérivé par `toDto()` de la même façon que
 * `derived`) — une régression que ce DTO doit bloquer à l'entrée, pas seulement documenter.
 *
 * Liste FIGÉE ici (pas importée de `GameSystemService.getSchema()`) : `PartiesModule` ne dépend
 * pas de `GameSystemModule` (qui dépend déjà de `PartiesModule` — un import inverse créerait un
 * cycle de modules). Si `sheetSchema` gagne une clé `lockable` supplémentaire, cette liste doit
 * être mise à jour à la main.
 */
const LOCKABLE_FIELD_KEYS = [
  'classId',
  'specialtyTypeId',
  'typeId',
  'attributes',
  'weaponId',
  'customWeapon',
  'fetiqueObject',
  'equipment',
  'startingEquipment',
  'narrative',
] as const;

class VisibilityLockPathInput {
  @IsIn(LOCKABLE_FIELD_KEYS)
  @MaxLength(64)
  fieldKey!: string;

  @IsOptional()
  @IsString()
  @Matches(FIELD_KEY_PATTERN)
  @MaxLength(64)
  subField?: string;
}

/**
 * Story 31.6 — jeu DÉCLARATIF COMPLET des chemins verrouillés pour une Partie, jamais un delta
 * (même patron que `SetPollOptionsDto`, Story 36.10/D-16) : ce qui n'est pas dans `paths` est
 * retiré par `PartiesService.setVisibilityLocks()`.
 *
 * `subField` reste validé par forme seulement (`FIELD_KEY_PATTERN`), pas par une liste figée : les
 * sous-champs valides varient selon `fieldKey` (seul `attributes` en déclare aujourd'hui, cf.
 * `lockableFields` dans `GameSystemService.getSchema`) — un `subField` qui ne correspond à rien de
 * réel reste inerte en lecture (`CharacterService.toDto()` ne retire que ce qui existe dans
 * `sheetData`), même raisonnement que pour `fieldKey` avant ce correctif.
 */
export class SetVisibilityLocksDto {
  @IsArray()
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => VisibilityLockPathInput)
  paths!: VisibilityLockPathInput[];
}
