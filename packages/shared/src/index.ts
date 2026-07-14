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

// ─── Palier 4 (suite) : Scénarios ──────────────────────────────────────────────

/** Statut du cycle de vie anti-spoil d'un scénario (Story 7.1). */
export type ScenarioStatus = 'BROUILLON' | 'A_VENIR' | 'COURANT' | 'PASSE';

/** Un scénario tel que renvoyé par l'API — contenu toujours complet (anti-spoil = rendu frontend, AD-6). */
export interface ScenarioDto {
  id: string;
  partieId: string;
  title: string;
  description: string | null;
  status: ScenarioStatus;
  dureeHeures: number | null;
  dureeSeances: number | null;
  resumeFin: string | null;
  createdAt: string;
  closedAt: string | null;
  /** Séances du scénario (Story 8.2) — toujours un tableau, potentiellement vide, quel que soit le kind. */
  seances: SeanceDto[];
  /** Participants (CAMPAGNE_EPISODIQUE uniquement, Story 8.1) — toujours undefined pour ONE_SHOT/CAMPAGNE_LINEAIRE (AD-4). */
  participants?: { userId: string; pseudo: string }[];
  /** Notes de journal associées à la rétrospective (Story 8.6) — peuplé uniquement si `status === 'PASSE'`, sinon `undefined`. */
  retrospectiveNotes?: CharacterNoteDto[];
}

/** Une séance d'un scénario (Story 8.2) — `poll` peuplé si une date a été liée via linkSeancePoll. */
export interface SeanceDto {
  id: string;
  scenarioId: string;
  poll?: SessionPollDto;
  /** Inscription à capacité limitée (CAMPAGNE_EPISODIQUE uniquement, Story 8.3) — peuplé seulement si `inscriptionMax` est défini sur la Seance (AD-4 : jamais en même temps que `poll`). */
  inscription?: SeanceInscriptionDto;
  compteRendu: string | null;
  createdAt: string;
}

/** État d'inscription à capacité limitée d'une Seance (Story 8.3). */
export interface SeanceInscriptionDto {
  min: number;
  max: number;
  inscrits: { userId: string; pseudo: string }[];
  dateValidee: string | null;
}

/** Payload de rédaction du compte-rendu d'une Seance (PATCH /scenarios/seances/:id/compte-rendu). */
export interface SetCompteRenduDto {
  compteRendu: string;
}

/** Payload de définition de la capacité d'une Seance (PATCH /scenarios/seances/:id/capacite). */
export interface SetSeanceCapacityDto {
  inscriptionMin: number;
  inscriptionMax: number;
}

/** Payload de rédaction du résumé de fin d'un Scenario (PATCH /scenarios/:id/resume-fin). */
export interface SetResumeFinDto {
  resumeFin: string;
}

/** Payload de création + liaison d'un SessionPoll pour une Seance (POST /scenarios/seances/:id/poll,
 * Story 8.7) — remplace LinkSeancePollDto : plus de round-trip créer-puis-lier séparé, un seul
 * appel crée le vote (PollService.create() appelé tel quel, CreatePollDto inchangé) ET pose
 * Seance.pollId. */
export interface CreateSeancePollDto {
  options: { date: string; slot: DaySlot }[];
}

/** Payload de création d'un scénario (POST /parties/:id/scenarios). */
export interface CreateScenarioDto {
  title: string;
  description?: string;
  dureeHeures?: number;
  dureeSeances?: number;
}

/** Un document de scénario ou de bibliothèque de Partie (Story 7.2) — `scenarioId: null` = bibliothèque. */
export interface ScenarioDocumentDto {
  id: string;
  partieId: string;
  scenarioId: string | null;
  originalName: string;
  sizeBytes: number;
  createdAt: string;
}

/** Payload d'édition d'un scénario (PATCH /scenarios/:id). */
export interface UpdateScenarioDto {
  title?: string;
  description?: string;
  dureeHeures?: number;
  dureeSeances?: number;
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

// ─── Palier P3 : Moteur plugin & Personnages ─────────────────────────────────

/** Système de jeu enregistré dans le registre. */
export interface GameSystemDto {
  id: string;
  name: string;
  version: string;
}

/** Données génériques d'une fiche (structure validée applicativement par validate()). */
export type SheetData = Record<string, unknown>;

/** Stats dérivées d'un personnage. */
export interface DerivedStats {
  PV: number;
  PE: number;
  Condition: number;
  Initiative: number;
  Encombrement: number;
}

/** Fiche de personnage telle que renvoyée par l'API. */
export interface CharacterDto {
  id: string;
  userId: string;
  partieId: string;
  gameSystemId: string;
  sheetData: SheetData;
  derived: DerivedStats;
  portraitUrl: string | null;
  portraitCropData: unknown | null;
  /** Recadrage dédié pour l'export PDF (même forme que `portraitCropData`), indépendant de celui-ci. */
  pdfPortraitCropData: unknown | null;
  createdAt: string;
  updatedAt: string;
  /** Pseudo du propriétaire (joueur ou MJ) — résolu côté serveur, jamais stocké. */
  ownerPseudo: string;
  /** Le propriétaire de ce personnage est le MJ de la partie (distinct d'un personnage de joueur). */
  ownerIsMj: boolean;
  /**
   * L'utilisateur qui a demandé cette fiche (le *viewer* de la requête courante) est le MJ de la
   * Partie — **distinct** de `ownerIsMj` (qui parle du propriétaire du personnage, pas de qui
   * consulte). Introduit Story 6.5 (revue de code) pour remplacer l'heuristique frontend
   * "n'importe quel non-propriétaire = MJ", devenue fausse dès qu'un fellow player (ni
   * propriétaire, ni MJ) a pu consulter la fiche d'un coéquipier.
   */
  viewerIsMj: boolean;
  /** Points d'expérience cumulés — seule source de vérité (jamais dépensés, jamais remis à zéro). */
  xp: number;
  /** Association automatique du journal partagé aux rétrospectives de scénario (Story 8.6). Réglage par personnage, pas par compte joueur. */
  journalAutoAssociate: boolean;
  /**
   * Niveau réellement appliqué (1 + nombre de montées de niveau validées), calculé côté API —
   * jamais écrit directement par le client. **Distinct** du niveau potentiel atteignable avec
   * `xp` (cf. `pendingLevels`/`LevelUpBanner`) : un personnage peut avoir assez d'XP pour monter
   * de niveau sans que `level` n'augmente tant que le joueur n'a pas validé le `LevelUpWizard`.
   */
  level: number;
}

/** Une ligne d'une distribution d'XP : le montant accordé à un personnage. */
export interface XpDistributionEntryDto {
  characterId: string;
  amount: number;
  isBonus: boolean;
}

/** Distribution d'XP faite par le MJ après une session, avec ses entrées par personnage. */
export interface XpDistributionDto {
  id: string;
  partieId: string;
  note?: string;
  createdAt: string;
  entries: XpDistributionEntryDto[];
}

/** Payload de création d'une distribution d'XP (POST /parties/:id/xp-distributions). */
export interface CreateXpDistributionDto {
  /** Calcul assisté (FR-2) — stockés pour audit/affichage uniquement, jamais revérifiés contre `amount`. */
  difficulty?: number;
  breaths?: number;
  monsterLevel?: number;
  entries: { characterId: string; amount: number; isBonus?: boolean }[];
  note?: string;
}

/** Déclencheur d'un instantané de fiche (Story 6.3). */
export type SnapshotTrigger = 'LEVEL_UP' | 'MJ_EDIT';

/** Instantané immuable de la fiche d'un personnage (historique, jamais de restauration). */
export interface CharacterSnapshotDto {
  id: string;
  characterId: string;
  sheetData: SheetData;
  derived: DerivedStats;
  level: number;
  trigger: SnapshotTrigger;
  note?: string;
  createdAt: string;
}

/**
 * Payload de POST /characters/:id/level-up. `capabilities[].type` reste `string` ici (pas
 * `CapabilityType`, qui vit dans `@master-jdr/game-rules` — `packages/shared` ne doit pas en
 * dépendre). Aux niveaux 4/6/10, deux capacités sont octroyées conjointement (Attribut ET
 * spéciale) — le tableau en contient alors deux ; sinon une seule.
 */
export interface CreateLevelUpDto {
  pvAllocated: number;
  peAllocated: number;
  capabilities: { type: string; params: Record<string, unknown> }[];
}

/**
 * Payload de POST /characters/:id/inventory-items. `addedBy` n'existe pas dans ce type —
 * forcé côté serveur, jamais accepté du client (AD-3, Story 6.4).
 */
export interface CreateInventoryItemDto {
  name: string;
  weight?: number; // absent → 0 côté serveur
}

/** Payload de PATCH /characters/:id/inventory-items/:itemId — partiel, au moins un champ. */
export interface UpdateInventoryItemDto {
  name?: string;
  weight?: number;
}

/** Entrée du journal de notes d'un personnage (Story 6.5) — append-only, jamais éditée/supprimée après création. */
export interface CharacterNoteDto {
  id: string;
  characterId: string;
  text: string;
  shared: boolean;
  /** Scénario auquel cette entrée est manuellement associée (Story 8.6), `null` si aucune. Indépendant de l'association automatique. */
  scenarioId: string | null;
  createdAt: string;
}

/** Payload de POST /characters/:id/notes. */
export interface CreateCharacterNoteDto {
  text: string;
}

/** Payload de PATCH /characters/:id/notes/:noteId/share. */
export interface ToggleNoteShareDto {
  shared: boolean;
}

/** Payload de PATCH /characters/:id/sheet-field (AD-6, édition MJ générique). */
export interface SetSheetFieldDto {
  path: string;
  value: unknown;
}

/** Réponse de PATCH /characters/:id/sheet-field : `warnings` = errors[] consultatif de `validate('mj', ...)`, jamais bloquant (AD-7/NFR3). */
export interface SetSheetFieldResultDto {
  character: CharacterDto;
  warnings: string[];
}

/** Payload de PATCH /characters/:id/xp (édition MJ directe, distincte de la distribution d'XP — AD-6). */
export interface SetXpDto {
  value: number;
}

/** Payload de PATCH /characters/:id/journal-auto-associate (Story 8.6, propriétaire seul). */
export interface SetJournalAutoAssociateDto {
  journalAutoAssociate: boolean;
}

/** Payload de PATCH /characters/:id/notes/:noteId/scenario (Story 8.6, propriétaire seul). `null` = désassocier. */
export interface SetNoteScenarioDto {
  scenarioId: string | null;
}

/** Payload de PATCH /characters/:id/narrative-field (Story 6.7, édition propriétaire-seul). */
export interface UpdateNarrativeFieldDto {
  field: 'sex' | 'age' | 'physicalTraits' | 'homeTown' | 'motivation' | 'personality';
  value: unknown;
}

/**
 * Dimensions du cadre portrait de l'export PDF Ryuutama, mesurées empiriquement en Story 4.6
 * (`apps/api/game-systems/ryuutama/assets/README.md`, section "Zone du portrait"). Consommées
 * par `PortraitCropper` (web) pour que son masque de prévisualisation rectangulaire corresponde
 * au cadre réel du PDF.
 *
 * **Dupliquées, pas partagées**, avec `PORTRAIT_WIDTH`/`PORTRAIT_HEIGHT` dans
 * `apps/api/src/characters/ryuutama-pdf.service.ts` : `@master-jdr/shared` est une frontière
 * **types uniquement, effacée au runtime** (CLAUDE.md/project-context.md), donc l'API ne peut
 * pas importer ces constantes comme valeurs (Jest ne transforme pas ce module en tant que
 * dépendance de workspace). Si ces valeurs changent, mettre à jour les deux emplacements.
 */
export const RYUUTAMA_PDF_PORTRAIT_WIDTH = 188.18;
export const RYUUTAMA_PDF_PORTRAIT_HEIGHT = 136.48;
export const RYUUTAMA_PDF_PORTRAIT_ASPECT_RATIO =
  RYUUTAMA_PDF_PORTRAIT_WIDTH / RYUUTAMA_PDF_PORTRAIT_HEIGHT;

/** Payload de création d'un personnage. */
export interface CreateCharacterDto {
  gameSystemId: string;
  sheetData: SheetData;
}

/** Réponse de GET /game-systems/:id/schema. */
export interface GameSystemSchemaDto {
  sheetSchema: unknown;
  creationSteps: unknown[];
}

/** Entrée de contenu générique d'un système de jeu (ex: une classe, un type, une arme). */
export interface ContentEntryDto {
  key: string;
  data: unknown;
}

/** Réponse de GET /game-systems/:id/content — groupé par clé de ContentType. */
export type GameSystemContentDto = Record<string, ContentEntryDto[]>;

// ─── Palier 4 : Infra e-mail & notifications ─────────────────────────────────

/** Payload de POST /auth/forgot-password. */
export interface RequestPasswordResetDto {
  email: string;
}

/** Payload de POST /auth/reset-password. */
export interface ResetPasswordDto {
  token: string;
  newPassword: string;
}
