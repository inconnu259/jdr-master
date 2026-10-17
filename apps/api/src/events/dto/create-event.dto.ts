import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateIf,
} from 'class-validator';
import type {
  CreateEventDto as CreateEventPayload,
  EventSlot,
  UpdateEventDto as UpdateEventPayload,
} from '@master-jdr/shared';

/** `HH:MM` en 24 h, heures et minutes paddées — même règle que les informations pratiques d'une
 *  séance (Story 36.5) : la valeur n'est jamais reparsée en aval, c'est ici qu'on garantit sa forme. */
const HEURE_HH_MM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Au moins un caractère non blanc. */
const NON_BLANK = /\S/;

/** Clé de jour `YYYY-MM-DD` (la validité calendaire et le refus d'un jour passé sont vérifiés par
 *  le service). */
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Créneaux admis pour une conjonction : jamais `FULL_DAY`, jamais vide (Story 40.1). */
export const EVENT_SLOTS: readonly EventSlot[] = ['MORNING', 'AFTERNOON', 'EVENING'];

/**
 * Création d'une conjonction à date fixée (Story 40.1, `POST /parties/:id/events`).
 *
 * 🚨 `heureRdv` est une **étiquette** `"HH:MM"`, jamais un instant : rien ne la parse, ne la compare
 * ni ne la trie (addendum §5.7). Bornes des informations pratiques reprises de la Story 36.5 (lieu
 * ≤ 80, note ≤ 200). `capacity` absente ou `null` = « Tous les membres » ; sinon un entier ≥ 2 (l'hôte
 * occupe une place), sans plafond.
 */
export class CreateEventDto implements CreateEventPayload {
  @IsString({ message: 'Le nom doit être un texte' })
  @MaxLength(120, { message: 'Le nom ne peut pas dépasser 120 caractères' })
  @Matches(NON_BLANK, { message: 'Le nom ne peut pas être vide' })
  title!: string;

  @IsString({ message: 'La date doit être au format AAAA-MM-JJ' })
  @Matches(DAY_KEY, { message: 'La date doit être au format AAAA-MM-JJ' })
  date!: string;

  @IsIn(EVENT_SLOTS, { message: 'Le créneau doit être le matin, l’après-midi ou le soir' })
  slot!: EventSlot;

  @IsOptional()
  @IsString({ message: 'Le lieu doit être un texte' })
  @MaxLength(80, { message: 'Le lieu ne peut pas dépasser 80 caractères' })
  @Matches(NON_BLANK, { message: 'Le lieu ne peut pas être une chaîne vide' })
  lieu?: string | null;

  @IsOptional()
  @IsString({ message: "L'heure de rendez-vous doit être au format HH:MM (24 h)" })
  @Matches(HEURE_HH_MM, { message: "L'heure de rendez-vous doit être au format HH:MM (24 h)" })
  heureRdv?: string | null;

  @IsOptional()
  @IsString({ message: 'La note pratique doit être un texte' })
  @MaxLength(200, { message: 'La note pratique ne peut pas dépasser 200 caractères' })
  @Matches(NON_BLANK, { message: 'La note pratique ne peut pas être une chaîne vide' })
  notePratique?: string | null;

  @ValidateIf((_, value) => value !== null && value !== undefined)
  @IsInt({ message: 'Le nombre de places doit être un entier' })
  @Min(2, { message: 'Des places limitées en comptent au moins 2, hôte compris' })
  capacity?: number | null;
}

/**
 * Modification d'une conjonction (Story 40.2, `PATCH /parties/:id/events/:eventId`) : remplacement
 * complet, MÊMES champs et MÊMES règles que la création — l'hôte reste immuable (aucun champ ne le
 * désigne).
 */
export class UpdateEventDto extends CreateEventDto implements UpdateEventPayload {}
