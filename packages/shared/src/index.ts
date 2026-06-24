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
}
