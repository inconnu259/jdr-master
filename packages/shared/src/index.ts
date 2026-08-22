/**
 * Types partagés entre l'API (NestJS) et le front (Angular).
 * Import type-only côté apps → effacé à la compilation, aucun coût runtime.
 */

/** Thèmes disponibles — liste déclarée une seule fois (AD-13), la validation API s'y réfère
 *  directement (`@IsIn(THEMES)`), jamais une seconde liste côté serveur. */
export const THEMES = ['grimoire-emeraude', 'foret-ancienne', 'medieval-steampunk'] as const;

export type Theme = (typeof THEMES)[number];

/** Critères de tri de la liste des parties (FR-10, AD-1, Story 29.8) — union fermée, validée
 *  côté serveur via `@IsIn(PARTIE_SORTS)`, jamais une chaîne libre. */
export const PARTIE_SORTS = ['urgence', 'date', 'nom', 'type', 'statut'] as const;

export type PartieSort = (typeof PARTIE_SORTS)[number];

/** Modes de densité d'affichage des listes (FR-45, AD-1, Story 29.9) — union fermée **partagée**
 *  entre la liste des parties et la vue « mes personnages » (CAP-18 : « une seule grammaire »),
 *  chacune gardant sa propre valeur mémorisée (`partiesViewMode`/`charactersViewMode`). Littéral
 *  `"medium"` (pas `'moyen'`) : doit rester synchronisé avec le défaut Prisma du Structural Seed. */
export const LIST_VIEW_MODES = ['large', 'medium', 'compact'] as const;

export type ListViewMode = (typeof LIST_VIEW_MODES)[number];

/** Critères de tri de la vue « mes personnages » (FR-45, AD-1, Story 29.9) — union fermée
 *  distincte de `PARTIE_SORTS` (AD-1 : « niveau, partie, nom pour les personnages »), pas de
 *  vocabulaire partagé au-delà de `'nom'`, présent dans les deux unions. */
export const CHARACTER_SORTS = ['niveau', 'partie', 'nom'] as const;

export type CharacterSort = (typeof CHARACTER_SORTS)[number];

/** Couches d'affichage du calendrier (FR-46, AD-16, Story 30.4) — union fermée, validée côté
 *  serveur via `@IsIn(CALENDAR_LAYER_KEYS, { each: true })`, jamais une chaîne libre. La couche
 *  `disponibilite-groupe` n'a de sens que dans le calendrier d'une partie — c'est la **lecture**
 *  qui l'ignore hors contexte (Story 30.6), pas le stockage/le défaut qui la refuse (AD-16). */
export const CALENDAR_LAYER_KEYS = [
  'mes-indisponibilites',
  'mes-disponibilites',
  'mes-seances',
  'votes-en-cours',
  'inscriptions-ouvertes',
  'disponibilite-groupe',
] as const;

export type CalendarLayerKey = (typeof CALENDAR_LAYER_KEYS)[number];

/** Jeu de couches actives par défaut pour un compte qui n'a jamais réglé cette préférence
 *  (`calendarLayersSetAt === null`, AD-16) — toutes actives, y compris `disponibilite-groupe`. */
export const DEFAULT_CALENDAR_LAYER_KEYS: CalendarLayerKey[] = [...CALENDAR_LAYER_KEYS];

/** Utilisateur authentifié (renvoyé par /auth/login, /auth/me). Jamais le hash. */
export interface AuthUser {
  id: string;
  email: string;
  pseudo: string;
  /** Nom affiché aux autres utilisateurs. Initialisé au pseudo, librement modifiable, sans contrainte d'unicité (AD-1). */
  displayName: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  /** Thème choisi sur le compte. `null` = jamais choisi — le thème local est alors adopté une
   *  seule fois et poussé vers le compte (AD-13). Toujours présent, jamais `undefined`. */
  theme: Theme | null;
  /** Préférence « masquer les parties terminées » (FR-3, AD-1, Story 29.8) — appliquée côté front
   *  à la liste déjà chargée, jamais par un filtre serveur. */
  hideFinishedParties: boolean;
  /** Critère de tri mémorisé de la liste des parties (FR-10, AD-1, Story 29.8). */
  partiesSort: PartieSort;
  /** Mode d'affichage mémorisé de la liste des parties (FR-45, AD-1, Story 29.9). */
  partiesViewMode: ListViewMode;
  /** Mode d'affichage mémorisé de la vue « mes personnages » (FR-45, AD-1, Story 29.9). */
  charactersViewMode: ListViewMode;
  /** Critère de tri mémorisé de la vue « mes personnages » (FR-45, AD-1, Story 29.9). */
  charactersSort: CharacterSort;
  /** Couches actives du calendrier (FR-46, AD-16, Story 30.4) — toujours résolu côté serveur,
   *  jamais `undefined` : si le compte n'a jamais réglé cette préférence, porte
   *  `DEFAULT_CALENDAR_LAYER_KEYS` ; si réglé (y compris à vide), porte exactement ce qui a été
   *  enregistré. Contrairement à `theme`, aucun sentinel `null` n'est exposé au client — la
   *  distinction « jamais réglé » / « tout éteint » est résolue en interne (AD-16). */
  defaultCalendarLayers: CalendarLayerKey[];
}

/** Corps de la requête PATCH /me/display-name. */
export interface UpdateDisplayNameDto {
  displayName: string;
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

/** Statut d'une partie — dérivé côté serveur à partir de `Partie.closedAt` et de la présence de
 *  scénarios (AD-8), jamais recalculé côté client (Story 29.6). */
export type PartieStatus = 'A_VENIR' | 'EN_COURS' | 'TERMINEE';

// ─────────────────────────────────────────────────────────────────────────────
// Conversion du type d'une partie (Story 29.14)
//
// POINT DE DÉRIVATION UNIQUE de la matrice de conversion. Le serveur (garde de
// `PartiesService.convertKind()`) et le formulaire d'édition consomment tous deux
// `checkPartieKindTransition()` — il n'existe pas deux tables de règles, qui
// divergeraient (Règle B de la story, esprit d'AD-17).
//
// Le `kind` gouverne des invariants dans quatre services :
//   - ONE_SHOT              : exactement un scénario, créé avec la partie (AD-7)
//   - CAMPAGNE_LINEAIRE     : au plus un scénario COURANT à la fois (AD-10)
//   - CAMPAGNE_EPISODIQUE   : participation individuelle + inscriptions à capacité
// Jusqu'à cette story, `update()` écrivait `kind` sans aucune vérification.
// ─────────────────────────────────────────────────────────────────────────────

/** État de la partie au moment où une conversion est évaluée. Lu par le serveur dans la
 *  transaction ; reconstitué côté client depuis la liste des scénarios de la partie. */
export interface PartieKindTransitionState {
  scenarioCount: number;
  /** Nombre de scénarios au statut `COURANT`. */
  courantCount: number;
  /** `Partie.closedAt !== null`. */
  isClosed: boolean;
}

/** Motifs de refus — union fermée. Le serveur renvoie un code, jamais une phrase : le libellé
 *  est thématisable côté client, et un code se teste sans dépendre d'une formulation. */
export type PartieKindTransitionRefusal =
  /** Règle C : une partie clôturée se rouvre avant d'être convertie. */
  | 'PARTIE_CLOSED'
  /** Cas 3 et 5 : un one-shot n'a qu'un scénario (AD-7), on ne sait pas lequel garder. */
  | 'TOO_MANY_SCENARIOS_FOR_ONE_SHOT';

/** Effets à appliquer dans la transaction de conversion, en plus de l'écriture du `kind`. */
export type PartieKindTransitionEffect =
  /** Cas 3 et 5 à zéro scénario : en créer un (+ sa séance), comme le fait `PartiesService.create()`
   *  pour un ONE_SHOT. Sans cela la partie serait définitivement coincée sans scénario —
   *  `ScenariosService.create()` refuse d'en créer un sur un ONE_SHOT. */
  | 'CREATE_SCENARIO'
  /** Cas 2 et 4 : inscrire les membres actuels comme participants de chaque scénario existant.
   *  Ce n'est pas une invention : hors épisodique, le code tient déjà pour vrai que « tous les
   *  membres actuels sont réputés participer » (`homme-dragon.service.ts`). Sans ce semis, la
   *  conversion viderait les notes de rétrospective et ferait refuser les associations de journal. */
  | 'SEED_PARTICIPANTS'
  /** Cas 6 avec plusieurs COURANT : rétrograder en `A_VENIR` tous ceux que le MJ n'a pas retenus.
   *  Séances, votes et dates sont conservés (Règle A — rien n'est jamais effacé). */
  | 'DEMOTE_EXTRA_COURANTS';

export type PartieKindTransitionVerdict =
  | { allowed: false; refusal: PartieKindTransitionRefusal }
  | {
      allowed: true;
      effects: PartieKindTransitionEffect[];
      /** Vrai quand `DEMOTE_EXTRA_COURANTS` s'applique : le MJ doit désigner le scénario qui reste
       *  Courant. Le serveur exige alors `courantScenarioId`. */
      requiresCourantChoice: boolean;
    };

/**
 * Évalue une conversion de type de partie. Fonction **pure** : aucune dépendance à Prisma,
 * Nest ou Angular, testable isolément.
 *
 * Une transition identité (`from === to`) est toujours autorisée et sans effet — le formulaire
 * renvoie systématiquement `kind`, y compris inchangé.
 */
export function checkPartieKindTransition(
  from: PartieKind,
  to: PartieKind,
  state: PartieKindTransitionState,
): PartieKindTransitionVerdict {
  if (from === to) {
    return { allowed: true, effects: [], requiresCourantChoice: false };
  }

  // Règle C — évaluée avant tout le reste : une partie clôturée ne se convertit pas.
  if (state.isClosed) {
    return { allowed: false, refusal: 'PARTIE_CLOSED' };
  }

  const effects: PartieKindTransitionEffect[] = [];

  if (to === 'ONE_SHOT') {
    // Cas 3 et 5. À deux scénarios ou plus, aucune règle ne dit lequel survivrait : refus.
    if (state.scenarioCount >= 2) {
      return { allowed: false, refusal: 'TOO_MANY_SCENARIOS_FOR_ONE_SHOT' };
    }
    if (state.scenarioCount === 0) {
      effects.push('CREATE_SCENARIO');
    }
    return { allowed: true, effects, requiresCourantChoice: false };
  }

  if (to === 'CAMPAGNE_EPISODIQUE') {
    // Cas 2 et 4 — toujours autorisés, la réparation rend la conversion non destructive.
    return {
      allowed: true,
      effects: ['SEED_PARTICIPANTS'],
      requiresCourantChoice: false,
    };
  }

  // to === 'CAMPAGNE_LINEAIRE' — cas 1 et 6.
  // Le verrou « un seul COURANT » d'AD-10 ne s'applique qu'aux nouveaux passages en COURANT ; il
  // ne répare pas l'existant. Sans rétrogradation, l'invariant naîtrait déjà violé.
  const requiresCourantChoice = state.courantCount >= 2;
  if (requiresCourantChoice) {
    effects.push('DEMOTE_EXTRA_COURANTS');
  }
  return { allowed: true, effects, requiresCourantChoice };
}

/** Une partie telle que renvoyée par l'API. */
export interface PartieDto {
  id: string;
  name: string;
  kind: PartieKind;
  gameSystemId: string;
  description: string | null;
  mjId: string;
  /** Renseigné uniquement par `GET /parties/:id` (`findOneDto`) — jamais par `GET /parties`
   *  (`listForUser`, tableau de bord), qui reste volontairement hors du périmètre de l'homonymie
   *  (Story 28.3, Task 1). Toujours vérifier avant usage plutôt que supposer présent. */
  mjPseudo?: string;
  mjDisplayName?: string;
  createdAt: string;
  nextSessionDate: string | null;
  nextSessionSlot: DaySlot | null;
  /** Rôle de l'appelant sur cette partie — calculé serveur (`mjId === userId`), jamais dérivé
   *  côté client (Story 29.1, AD-15). Toujours présent, contrairement à `mjPseudo`/`mjDisplayName`. */
  role: 'mj' | 'player';
  /** Toujours présent, calculé serveur (AD-8) — jamais dérivé côté client (Story 29.6). */
  status: PartieStatus;
  /** Toujours présent, calculé serveur (Story 29.8) — jamais dérivé côté client. */
  isFavorite: boolean;
  /** Jeton de version de la couverture (Story 29.12, AD-19) — dérivé de `Partie.coverImageUrl`,
   *  change à chaque dépôt. Sert à la fois d'indicateur de présence (`null` = pas d'image, la
   *  bannière générée s'applique) et de paramètre de cache-busting pour
   *  `GET /parties/:id/cover` : jamais le chemin de stockage lui-même, qui n'apporte rien côté
   *  client (l'URL se construit depuis l'`id` de la partie, même patron que
   *  `CharacterAvatar.absolutePortraitUrl`). */
  coverImageVersion: string | null;
}

/** Code de signal d'état d'une partie (FR-12, AD-3) — union fermée, jamais un booléen libre ni
 *  une chaîne construite à la volée côté client (Story 29.7). */
export type PartySignalCode =
  | 'PERSONNAGE_A_CREER'
  | 'VOTE_EN_COURS_SANS_REPONSE'
  | 'COMPTE_RENDU_NON_REDIGE'
  | 'HOMME_DRAGON_A_CREER'
  | 'AUCUN_MEMBRE_INVITE'
  | 'AUCUN_SCENARIO_EN_COURS'
  | 'AUCUNE_DATE_NI_VOTE'
  | 'RAPPORT_FIN_MANQUANT'
  | 'PROCHAINE_SEANCE_CONNUE'
  | 'PARTIE_TERMINEE';

/** Réponse de `GET /me/party-signals` — une entrée par partie de l'utilisateur, jamais une entrée
 *  absente (`signals: []` si aucun signal actif). `role`/`status` sont dupliqués depuis `PartieDto`
 *  volontairement (AD-3) : l'écran de liste n'a besoin d'aucun autre appel. */
export interface PartySignalsDto {
  role: 'mj' | 'player';
  status: PartieStatus;
  signals: PartySignalCode[];
}

/** Statut d'une invitation in-app. */
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'REVOKED';

/** Résultat de recherche d'utilisateur (GET /users/search) — jamais le hash, jamais l'e-mail,
 *  jamais le nom affiché (AD-2 : seule exception à « pseudo et displayName toujours les deux »). */
export interface UserSearchResultDto {
  id: string;
  pseudo: string;
}

/** Un joueur d'une partie (GET /parties/:id/members). */
export interface PartieMemberDto {
  userId: string;
  pseudo: string;
  displayName: string;
  /** Renseigné uniquement lorsque le demandeur est le MJ de la partie (AD-2) — omis pour tout autre membre. */
  email?: string;
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
  participants?: { userId: string; pseudo: string; displayName: string }[];
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
  /** Informations pratiques (Story 36.5, D-15 amendée le 2026-08-19) — trois champs
   *  facultatifs, séparés pour qu'on puisse en lâcher un quand la place manque.
   *  `heureRdv` est une ÉTIQUETTE `"HH:MM"`, jamais un instant : rien ne la parse, ne la
   *  compare ni ne la trie, et la chaîne de disponibilité reste au créneau de journée. */
  heureRdv: string | null;
  lieu: string | null;
  notePratique: string | null;
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

/** Payload des informations pratiques d'une Seance (PATCH /scenarios/seances/:id/infos-pratiques,
 *  Story 36.5). Un seul payload pour les trois champs : le MJ les saisit ensemble, et une écriture
 *  partielle compliquerait la remise à vide. `null` VIDE le champ — le distinguer de `undefined`
 *  n'aurait pas de sens ici, les trois étant toujours envoyés ensemble. */
export interface SetInfosPratiquesDto {
  heureRdv: string | null;
  lieu: string | null;
  notePratique: string | null;
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

// ─── Epic 9 : Annonces MJ ──────────────────────────────────────────────────

/** Une annonce MJ à portée variable (Story 9.1) — `scenarioId: null` = portée Partie/campagne entière. */
export interface AnnouncementDto {
  id: string;
  partieId: string;
  scenarioId: string | null;
  text: string;
  createdAt: string;
  /** Identité du MJ auteur — dérivée de `Partie.mjId`, jamais stockée sur l'annonce (AD-2, Story 28.2). */
  authorPseudo: string;
  authorDisplayName: string;
}

/** Payload de publication d'une annonce (POST /parties/:id/announcements). */
export interface CreateAnnouncementDto {
  text: string;
  scenarioId?: string;
}

/** Rôle de groupe assigné à un personnage (Story 27.2) — `roleKey` référence le catalogue
 *  `groupRole` (Story 27.1), jamais une FK stricte (même pattern que l'Homme Dragon). */
export interface CharacterGroupRoleDto {
  id: string;
  characterId: string;
  partieId: string;
  roleKey: string;
  assignedAt: string;
}

/** Payload d'assignation (POST /parties/:id/characters/:characterId/role). */
export interface AssignGroupRoleDto {
  roleKey: string;
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
  /** Conflit INTERNE au lot (entre deux items du même lot, `id` synthétique
   *  `batch-item-{index}`) : irrésoluble, aucun choix de résolution n'y a de sens (AC14).
   *  Absent/`false` = conflit avec une déclaration persistée, résoluble. Story 36.4. */
  internal?: boolean;
}

/** Résultat d'un POST /availability (avec ou sans résolution de conflit). */
export interface CreateAvailabilityResult {
  created: AvailabilityDeclarationDto[];
}

/** Élément d'un lot d'écriture groupée (POST /availability/batch) : forme de
 *  CreateAvailabilityDto sans replacingId — cet identifiant n'a de sens que depuis le
 *  panneau, qui remplace une déclaration précise.
 *
 *  `conflictResolution` est en revanche porté PAR ITEM depuis la Story 36.4 (dérogation
 *  D-18) : la route groupée n'échoue plus en bloc sur conflit, elle absorbe l'écrasement
 *  et la découpe. C'est un renversement assumé de l'AC2 de la Story 30.2 et de la phrase
 *  3 d'AD-21 — les phrases 1 (un seul appel) et 2 (écriture transactionnelle tout-ou-rien)
 *  restent vraies. La résolution est par item, et non globale au lot, parce que le
 *  parcours « Au cas par cas » décide créneau par créneau : un seul contrat couvre donc
 *  les trois issues (Remplacer / Conserver / Au cas par cas). */
export interface CreateAvailabilityBatchItem {
  kind: AvailKind;
  recurKind: RecurKind;
  dayOfWeek?: number | null;
  slot: DaySlot;
  startDate?: string | null;
  endDate?: string | null;
  expiresAt: string;
  /** Résolution choisie pour CE créneau après détection de conflit (Story 36.4, D-18).
   *  Absente = aucune résolution : un conflit sur cet item fait échouer le lot avec un 409
   *  qui énumère TOUS les conflits, ce que le dialogue de résolution consomme. */
  conflictResolution?: 'overwrite' | 'keep';
}

/** Payload de POST /availability/batch. */
export interface CreateAvailabilityBatchDto {
  items: CreateAvailabilityBatchItem[];
}

/** Résultat de POST /availability/batch. ⚠️ `created.length` n'égale PAS forcément
 *  `items.length` et son ordre ne correspond PAS positionnellement à `items` : un item
 *  résolu `keep` peut produire 0 à N pièces (découpe « à trous » autour des conflits
 *  conservés), quand tout autre item en produit exactement une. Ne jamais indexer
 *  `created[i]` en supposant qu'il correspond à `items[i]` (Story 36.4). */
export interface CreateAvailabilityBatchResult {
  created: AvailabilityDeclarationDto[];
}

/** Conflit détecté dans un lot : ConflictInfo enrichi de l'index de l'élément fautif. */
export interface BatchConflictInfo extends ConflictInfo {
  /** Index (0-based) de l'élément du lot en conflit avec cette déclaration. */
  batchIndex: number;
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

/** Statut d'un membre de la troupe sur un créneau donné, avec son identité.
 *
 *  Forme UNIQUE, partagée par `AvailableSlotDto.members` et par le `members` que
 *  `GET /parties/:id/heatmap` sert **au seul MJ** (Story 36.8). Deux définitions voisines
 *  divergeraient à la première évolution — c'est exactement le défaut à deux dénominateurs que
 *  `participantCount()` a corrigé côté effectif. */
export interface SlotMemberDto {
  userId: string;
  pseudo: string;
  displayName: string;
  status: SlotStatus;
}

/** Créneau calculé disponible pour une partie (retourné par GET /parties/:id/available-slots). */
export interface AvailableSlotDto {
  date: string;
  slot: DaySlot;
  members: SlotMemberDto[];
}

/** Vue agrégée d'un créneau disponible pour un joueur non-MJ (sans identité des membres). */
export interface AggregatedSlotDto {
  date: string;
  slot: DaySlot;
  available: number;
  unavailable: number;
  unknown: number;
  total: number;
  /** Story 36.8 (FR-53) — le détail nominatif du créneau, servi **au seul MJ**, pour la couche
   *  « disponibilité du groupe » : une pastille par membre, la POSITION identifiant la personne.
   *
   *  🚨 **Absent, jamais `[]`, pour un joueur.** Un tableau vide laisserait déduire qu'une liste
   *  existe ailleurs ; l'omission ne dit rien. Même discipline que `listMembers()`, qui met
   *  `email: undefined` et non `null` pour un non-MJ.
   *
   *  Optionnel par nécessité (les appelants existants ne le connaissent pas), et c'est la seule
   *  raison : côté front, la projection qui en dérive est **requise** (`| null`), pour que le
   *  compilateur attrape toute surface qui l'oublierait. */
  members?: SlotMemberDto[];
}

/** Séance datée d'une de mes parties (couche `mes-seances`, `GET /me/calendar`, AD-18, Story 30.5).
 *  Identité de partie/scénario incluse : ce sont mes propres parties, la notion de partie tierce
 *  n'existe pas dans le calendrier personnel (AD-9, AC4 Story 30.5). */
export interface MyCalendarSeanceEntry {
  seanceId: string;
  partieId: string;
  partieName: string;
  scenarioId: string;
  scenarioTitle: string;
  date: string;
  slot: DaySlot;
  /** Informations pratiques (Story 36.5). Elles doivent transiter par CE chemin aussi : sans
   *  cela le calendrier personnel ne les verrait jamais, le contexte de partie étant le seul à
   *  disposer du `SeanceDto` complet. Aucun appel supplémentaire — les scalaires de `Seance`
   *  sont déjà chargés par le `findMany` de `getMyCalendar`. */
  heureRdv: string | null;
  lieu: string | null;
  notePratique: string | null;
}

/** Une option d'un vote en cours, telle que la voit le calendrier PERSONNEL (Story 36.6, D-17).
 *
 *  ⚠️ Contrairement à `PollOptionDto` (contexte de partie, AD-20 : la charge utile porte l'identité
 *  de tous les votants), cette forme est **strictement anonyme** : des compteurs, et ma seule
 *  réponse. Le calendrier personnel agrège des parties entre lesquelles rien ne doit transiter
 *  (AD-9/AD-2) — n'y ajouter jamais un `userId`, un `pseudo` ni un `displayName`. */
export interface MyCalendarPollOption {
  /** Story 36.6 — sans lui, ni ma réponse ni un agrégat ne sont adressables, et le sélecteur de
   *  réponse (story 36.7) ne pourrait pas voter depuis le calendrier personnel. */
  optionId: string;
  date: string;
  slot: DaySlot;
  yes: number;
  maybe: number;
  no: number;
  /** `null` = je n'ai pas répondu. Jamais `undefined` : « pas de réponse » a une seule
   *  représentation, comme l'absence de ligne `PollVote` côté base (AD-10). */
  myAnswer: VoteAnswer | null;
}

/** Vote de date en cours sur une de mes parties (couche `votes-en-cours`, `GET /me/calendar`,
 *  Story 30.5). Une entrée par sondage, pas par option — le client éclate par option. Depuis la
 *  Story 36.6, porte aussi l'effectif de la troupe (`membersCount`) et, par option, les agrégats
 *  de réponses et ma réponse (`MyCalendarPollOption`) — l'appel unique existant suffit désormais
 *  à alimenter la piste de participation, sans appel réseau supplémentaire (AD-20). */
export interface MyCalendarPollEntry {
  pollId: string;
  partieId: string;
  partieName: string;
  /** Story 36.6 — effectif de la troupe : **le MJ + ses membres** (`participantCount()`), le
   *  dénominateur de la piste de participation. Même nombre que `SessionPollDto.membersCount`
   *  et que `AggregatedSlotDto.total`. Agrégat anonyme : aucune identité ne s'en déduit. */
  membersCount: number;
  options: MyCalendarPollOption[];
}

/** Séance à inscription ouverte d'une de mes parties CAMPAGNE_EPISODIQUE (couche
 *  `inscriptions-ouvertes`, `GET /me/calendar`, Story 30.5, D-13). Non filtrée par plage de dates :
 *  une séance en attente d'inscriptions n'a pas encore de date propre. */
export interface MyCalendarOpenInscriptionEntry {
  seanceId: string;
  partieId: string;
  partieName: string;
  scenarioTitle: string;
  inscriptionMin: number;
  inscriptionMax: number;
  inscritsCount: number;
  jeSuisInscrit: boolean;
}

/** Réponse de `GET /me/calendar` (AD-18, Story 30.5) : un seul appel pour toute la plage,
 *  indexé par couche. `disponibilite-groupe` n'y figure jamais (AD-16) — elle n'a de sens que
 *  dans le calendrier d'une partie, pas dans le calendrier personnel. Une couche sans contenu
 *  porte un tableau vide, jamais une clé absente. */
export interface MeCalendarDto {
  'mes-indisponibilites': AvailabilityDeclarationDto[];
  'mes-disponibilites': AvailabilityDeclarationDto[];
  'mes-seances': MyCalendarSeanceEntry[];
  'votes-en-cours': MyCalendarPollEntry[];
  'inscriptions-ouvertes': MyCalendarOpenInscriptionEntry[];
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
  /** Story 36.6 — effectif de la troupe : **le MJ + ses membres** (`participantCount()`), le même
   *  nombre que `AggregatedSlotDto.total`. C'est le DÉNOMINATEUR de la piste de participation.
   *
   *  Il vit ici et non dans `PollOptionDto` pour deux raisons. (1) C'est une propriété de la
   *  partie, pas de l'option. (2) 🚨 Les deux `toSessionPollDto` (`poll.service.ts`,
   *  `scenarios.service.ts`) typent leur entrée en `any`, donc `options: (…).map(…)` produit un
   *  `any[]` que TypeScript ne vérifie **pas** : un champ ajouté à l'intérieur des options
   *  manquerait silencieusement. À la racine du littéral, le compilateur l'attrape.
   *
   *  Requis, jamais optionnel : un effectif absent rendrait une piste au dénominateur indéfini. */
  membersCount: number;
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
  /** Nom affiché du votant (AD-2). Étendu par la revue de code de la story 28.2 : sans lui, la liste
   *  des votants nommait le joueur par son pseudo pendant que la liste des manquants, juste en
   *  dessous, le nommait par son nom affiché. */
  displayName: string;
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
  /** Nom affiché du propriétaire — résolu côté serveur, jamais stocké (AD-2, Story 28.2). */
  ownerDisplayName: string;
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

/** Personnage enrichi du nom de sa Partie d'origine — forme de réponse propre à `GET /me/characters`
 *  (Story 29.2, D-10), jamais utilisée ailleurs : `CharacterDto` reste inchangé pour tous les autres
 *  appelants. */
export interface MyCharacterDto extends CharacterDto {
  partieName: string;
  /** Libellé de classe résolu côté serveur (Story 29.9, contenu de jeu du système du personnage) —
   *  `null` si `sheetData.classId` est absent ou ne référence aucune entrée du catalogue. */
  classLabel: string | null;
  /** Libellé de type résolu côté serveur, même patron que `classLabel`. */
  typeLabel: string | null;
  /** Libellé du rôle de groupe assigné à ce personnage sur sa Partie (Story 27.2), résolu côté
   *  serveur — `null` si aucun rôle n'est assigné. */
  groupRoleLabel: string | null;
}

/** Une ligne d'une distribution d'XP : le montant accordé à un personnage. */
export interface XpDistributionEntryDto {
  characterId: string;
  amount: number;
  isBonus: boolean;
  /** Identité du propriétaire du personnage crédité — pas celle du MJ qui distribue (AD-2, Story 28.2). */
  ownerPseudo: string;
  ownerDisplayName: string;
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
  price?: string;
  effect?: string;
}

/** Payload de PATCH /characters/:id/inventory-items/:itemId — partiel, au moins un champ. */
export interface UpdateInventoryItemDto {
  name?: string;
  weight?: number;
  price?: string;
  effect?: string;
}

/**
 * Payload de POST /characters/:id/contenants (Story 14.1/14.2) — même forme qu'`individual`,
 * poids obligatoire (contrairement à `individual`, dont le poids reste facultatif — gap
 * pré-existant Story 6.4, non reproduit ici).
 */
export interface CreateContenantDto {
  name: string;
  weight: number;
  price?: string;
  effect?: string;
}

/** Payload de PATCH /characters/:id/contenants/:itemId — partiel, au moins un champ. */
export interface UpdateContenantDto {
  name?: string;
  weight?: number;
  price?: string;
  effect?: string;
}

/**
 * Payload de POST /characters/:id/animaux (Story 14.1/14.2) — **jamais** de propriété `weight`,
 * même optionnelle : un animal n'a jamais de poids (FR8), absence structurelle.
 */
export interface CreateAnimalDto {
  name: string;
  price?: string;
  effect?: string;
}

/** Payload de PATCH /characters/:id/animaux/:itemId — partiel, au moins un champ. */
export interface UpdateAnimalDto {
  name?: string;
  price?: string;
  effect?: string;
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

// ─── Epic 10 : Homme Dragon (MJ) ───────────────────────────────────────────

/** Race de l'Homme Dragon (Story 10.1) — fixée à la création, détermine les artefacts proposés. */
export type HommeDragonRace = 'DRAGON_VERT' | 'DRAGON_BLEU' | 'DRAGON_ROUGE' | 'DRAGON_NOIR';

/** Fiche du personnage du MJ pour Ryuutama (Story 10.1). Forme minimale — `derived`/
 * `voyageursProteges`/`historique` seront ajoutés par les Stories 10.2/10.3, pas encore calculés. */
export interface HommeDragonSheetData {
  race: HommeDragonRace;
  artefact: { key: string; nom?: string; inscription?: string };
  nom: string;
  apparence?: string;
  caractere?: string;
  vocation?: string;
  demeure?: string;
  avatar?: string;
  mondesProteges?: string;
  /** Pouvoirs d'éveil choisis, un par niveau franchi (2-5) — jamais recalculé, c'est un choix
   * du MJ (Story 10.4). Absent sur les fiches créées avant cette story. */
  eveilPowers?: { level: number; key: string }[];
}

export interface HommeDragonDto {
  id: string;
  userId: string;
  partieId: string;
  gameSystemId: string;
  sheetData: HommeDragonSheetData;
  createdAt: string;
  updatedAt: string;
  /** Membres actuels de la Partie (hors MJ) — calculé à la lecture, jamais stocké (AD-3, Story 10.2). */
  voyageursProteges: { userId: string; pseudo: string }[];
  /** Scénarios `PASSE` de la Partie — calculé à la lecture, jamais stocké (AD-3, Story 10.2). */
  historique: { scenarioTitle: string; date: string; participants: string[] }[];
  /** Niveau (1-5) et Points de Souffle max — calculés à la lecture depuis le nombre de scénarios
   * `PASSE`, jamais stockés (AD-3, Story 10.3). */
  derived: { level: number; PS: number };
  /** Miroir de `sheetData.eveilPowers`, toujours un tableau (jamais `undefined`). */
  eveilPowers: { level: number; key: string }[];
  /** Niveaux 2-5 en attente d'un choix de pouvoir d'éveil — calculé à la lecture (AD-3),
   * jamais stocké. Vide si aucun choix n'est en attente. */
  pendingEveilLevels: number[];
}

/** Payload de création (POST /parties/:id/homme-dragon) — mêmes champs que la fiche, à plat. */
export type CreateHommeDragonDto = HommeDragonSheetData;

/** Payload de mise à jour (PATCH /parties/:id/homme-dragon) — race jamais éditable après création. */
export type UpdateHommeDragonDto = Partial<Omit<HommeDragonSheetData, 'race'>>;

/** Payload de choix d'un pouvoir d'éveil (POST /parties/:id/homme-dragon/eveil-power).
 * Décision utilisateur (Story 10.4) : le catalogue `eveilPower` est un pool commun à toutes les
 * races, sans niveau de déblocage par pouvoir — `level` désigne ici le seuil de niveau franchi
 * pour lequel ce choix est fait (doit appartenir à `pendingEveilLevels`), pas un attribut du
 * pouvoir lui-même. */
export interface ChooseEveilPowerDto {
  level: number;
  key: string;
}
