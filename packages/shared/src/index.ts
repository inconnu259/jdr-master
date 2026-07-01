/**
 * Types partagés entre l'API (NestJS) et le front (Angular).
 * Import type-only côté apps → effacé à la compilation, aucun coût runtime.
 */

/** Utilisateur authentifié (renvoyé par /auth/login, /auth/me). Jamais le hash. */
export interface AuthUser {
  id: string;
  email: string;
  pseudo: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
}

/** Réponse de l'endpoint GET /health de l'API. */
export interface HealthStatus {
  /** État global de l'API. */
  status: 'ok' | 'error';
  /** État de la connexion à la base de données. */
  db: 'up' | 'down';
  /** Horodatage ISO 8601 de la vérification. */
  timestamp: string;
}

/** Systèmes de jeu proposés (liste constante — le moteur de règles viendra au Palier 2). */
export const GAME_SYSTEMS = [
  { id: 'draconis', name: 'Draconis' },
  { id: 'conte-de-minuit', name: 'Conte de Minuit' },
  { id: 'ryuutama', name: 'Ryuutama' },
  { id: 'esteren', name: 'Esteren' },
] as const;

export type GameSystemId = (typeof GAME_SYSTEMS)[number]['id'];

/** Type d'une partie. En 1b l'UI n'expose que ONE_SHOT + CAMPAGNE_LINEAIRE (libellé « Campagne »). */
export type PartieKind = 'ONE_SHOT' | 'CAMPAGNE_LINEAIRE' | 'CAMPAGNE_EPISODIQUE';

/** Une partie telle que renvoyée par l'API. */
export interface PartieDto {
  id: string;
  name: string;
  kind: PartieKind;
  gameSystemId: string;
  description: string | null;
  mjId: string;
  createdAt: string;
  nextSessionDate: string | null;
  nextSessionSlot: DaySlot | null;
}

/** Statut d'une invitation in-app. */
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';

/** Résultat de recherche d'utilisateur (GET /users/search) — jamais le hash. */
export interface UserSearchResultDto {
  id: string;
  pseudo: string;
  email: string;
}

/** Un joueur d'une partie (GET /parties/:id/members). */
export interface PartieMemberDto {
  userId: string;
  pseudo: string;
  email: string;
  joinedAt: string;
}

/** Invitation reçue, telle qu'affichée au joueur (GET /invitations). */
export interface InvitationDto {
  id: string;
  partie: { id: string; name: string; gameSystemId: string };
  inviterPseudo: string;
  status: InvitationStatus;
  createdAt: string;
}

/** Lien d'invitation (vue MJ — GET /parties/:id/invite-links). */
export interface InviteLinkDto {
  id: string;
  token: string;
  maxUses: number | null;
  usesCount: number;
  expiresAt: string;
  revoked: boolean;
  createdAt: string;
}

/** Prévisualisation publique d'un lien (GET /invite-links/:token, sans session). */
export interface InviteLinkPreviewDto {
  partieName: string;
  gameSystemId: string;
  valid: boolean;
  /** Raison d'invalidité éventuelle (expiré / révoqué / quota atteint). */
  reason?: string;
}

// ─── Palier 2 : Calendrier de disponibilités ──────────────────────────────────

/** Granularité d'un créneau de disponibilité. */
export type DaySlot = 'MORNING' | 'AFTERNOON' | 'EVENING' | 'FULL_DAY';

/** Type d'une déclaration de disponibilité. */
export type AvailKind = 'UNAVAILABLE' | 'AVAILABLE';

/** Récurrence d'une déclaration. */
export type RecurKind = 'RECURRING' | 'PUNCTUAL';

/** Statut calculé d'un créneau pour un utilisateur donné. */
export type SlotStatus = 'AVAILABLE' | 'UNAVAILABLE' | 'UNKNOWN';

/** Statut d'un vote de date. */
export type PollStatus = 'OPEN' | 'CLOSED';

/** Réponse à une option de vote. */
export type VoteAnswer = 'YES' | 'NO' | 'MAYBE';

/** Déclaration de disponibilité telle que renvoyée par l'API. */
export interface AvailabilityDeclarationDto {
  id: string;
  userId: string;
  kind: AvailKind;
  recurKind: RecurKind;
  dayOfWeek: number | null;
  slot: DaySlot;
  startDate: string | null;
  endDate: string | null;
  expiresAt: string;
  createdAt: string;
}

/** Payload de création d'une déclaration de disponibilité. */
export interface CreateAvailabilityDto {
  kind: AvailKind;
  recurKind: RecurKind;
  dayOfWeek?: number | null;
  slot: DaySlot;
  startDate?: string | null;
  endDate?: string | null;
  expiresAt: string;
  /** ID de la déclaration en cours de remplacement (exclue du check de conflits). */
  replacingId?: string;
  /** Résolution choisie après détection de conflit. */
  conflictResolution?: 'overwrite' | 'keep';
}

/** Info sur une déclaration conflictuelle détectée à la création. */
export interface ConflictInfo {
  id: string;
  kind: AvailKind;
  slot: DaySlot;
  recurKind: RecurKind;
  startDate: string | null;
  endDate: string | null;
  dayOfWeek: number | null;
}

/** Résultat d'un POST /availability (avec ou sans résolution de conflit). */
export interface CreateAvailabilityResult {
  created: AvailabilityDeclarationDto[];
}

/** Payload partiel pour la mise à jour d'une déclaration. */
export interface UpdateAvailabilityDto {
  kind?: AvailKind;
  recurKind?: RecurKind;
  dayOfWeek?: number | null;
  slot?: DaySlot;
  startDate?: string | null;
  endDate?: string | null;
  expiresAt?: string;
}

/** Créneau calculé disponible pour une partie (retourné par GET /parties/:id/available-slots). */
export interface AvailableSlotDto {
  date: string;
  slot: DaySlot;
  members: { userId: string; pseudo: string; status: SlotStatus }[];
}

/** Vue agrégée d'un créneau disponible pour un joueur non-MJ (sans identité des membres). */
export interface AggregatedSlotDto {
  date: string;
  slot: DaySlot;
  available: number;
  unavailable: number;
  unknown: number;
  total: number;
}

/** Vote de date (SessionPoll). */
export interface SessionPollDto {
  id: string;
  partieId: string;
  status: PollStatus;
  scenarioRef: string | null;
  expiresAt: string | null;
  chosenDate: string | null;
  chosenSlot: DaySlot | null;
  options: PollOptionDto[];
}

/** Option d'un vote de date. */
export interface PollOptionDto {
  id: string;
  date: string;
  slot: DaySlot;
  votes: PollVoteDto[];
}

/** Vote d'un membre sur une option. */
export interface PollVoteDto {
  userId: string;
  pseudo: string;
  answer: VoteAnswer;
}

/** Payload de création d'un vote de date (POST /parties/:id/poll). */
export interface CreatePollDto {
  options: { date: string; slot: DaySlot }[];
  scenarioRef?: string | null;
}

/** Payload pour voter sur une option (POST /parties/:id/poll/:pollId/vote). */
export interface CastVoteDto {
  optionId: string;
  answer: VoteAnswer;
}

/** Payload pour choisir la date finale d'un vote (PATCH /parties/:id/poll/:pollId/choose). */
export interface ChooseDateDto {
  optionId: string;
}
