import type { CapabilityType } from './leveling.ts';

/**
 * Un objet de l'inventaire individuel (Story 6.4). `addedBy` n'est jamais lu depuis l'entrée
 * client — toujours forcé côté serveur selon la route (AD-3). `id` (UUID généré serveur, à
 * l'ajout ou par la migration one-off pour les entrées legacy) adresse l'objet de façon stable
 * — jamais par position de tableau (revue de code Story 6.4 : l'adressage par index laissait un
 * client périmé modifier/supprimer le mauvais objet sans jamais déclencher de 409).
 */
export interface InventoryItem {
  id: string;
  name: string;
  weight: number;
  price?: string; // texte libre (ex. "3 po") — aucun type monétaire structuré
  effect?: string;
  addedBy: 'player' | 'mj';
}

/** Même forme que InventoryItem (poids obligatoire) — catégorie structurellement séparée (FR7). */
export type Contenant = InventoryItem;

/** Jamais de poids (FR8) — absence structurelle du champ, pas juste optionnel/undefined. */
export type Animal = Omit<InventoryItem, 'weight'>;

export interface RyuutamaSheetData {
  classId: string;
  specialtyTypeId?: string; // obligatoire si classId === "artisan"
  typeId: string;
  attributes: { AGI: number; ESP: number; INT: number; VIG: number };
  /**
   * Arme précise choisie (Story 25.1), clé du catalogue `weaponItem` — remplace l'ancien
   * `weaponCategoryId` qui stockait directement une catégorie abstraite. La catégorie (et ses
   * formules de toucher/dégâts) se dérive désormais à la lecture via `resolveWeaponCategory()`,
   * jamais stockée en double. Optionnel depuis la Story 25.2 : sibling **exclusif** de
   * `customWeapon` — jamais les deux renseignés, jamais aucun des deux.
   */
  weaponId?: string;
  /**
   * Arme libre créée par le joueur (Story 25.2), sibling exclusif de `weaponId` — jamais les
   * deux renseignés, jamais aucun des deux (appliqué par `validate()` Règle 4). Hérite
   * exactement des formules de toucher/dégâts de la catégorie référencée par `categoryId`,
   * résolues à la lecture via `resolveWeapon()`, jamais stockées en double. Ne crée jamais de
   * `ContentEntry` — reste strictement inline, jamais partagée entre personnages.
   */
  customWeapon?: { name: string; categoryId: string };
  fetiqueObject?: string;
  equipment?: { individual: InventoryItem[]; contenants: Contenant[]; animaux: Animal[] };
  narrative?: {
    sex?: string;
    age?: string;
    physicalTraits?: string;
    homeTown?: string;
    motivation?: string;
    name?: string;
    personality?: string;
  };
  /** Montées de niveau appliquées (Story 6.3). Absent sur les personnages créés avant ce palier. */
  levelUps?: {
    level: number;
    pvAllocated: number; // 0-3
    peAllocated: number; // 0-3, pvAllocated+peAllocated === 3
    /**
     * Capacités octroyées à ce niveau. Aux niveaux 4/6/10, `LEVEL_TABLE` accorde **deux** capacités
     * conjointement (ex. niveau 4 = un Attribut ET une Immunité) — jamais un choix exclusif ; le
     * tableau en contient alors deux. Les autres niveaux n'en accordent qu'une seule.
     */
    capabilities: { type: CapabilityType; params: Record<string, unknown> }[];
  }[];
  /**
   * Choix imposés à la création par certains talents de classe (Story 23.8), résolus depuis
   * `requiredChoices` du contenu `class` seedé. Clé = `requiredChoices[].key`. Valeur : pour
   * `kind: "eligible-talent"` (ex. Métier d'appoint), `` `${classeOrigine}:${talentId}` `` pour
   * désambiguïser un talentId partagé entre classes (ex. "guerisseur:soins") ; pour
   * `kind: "landscape-flavor"`/`"closed-list"`, directement la clé du paysage/l'`option.value`.
   */
  classChoices?: Record<string, string>;
  /**
   * Capacités octroyées à la création par certains talents de classe (ex. Climatophile du
   * Météomancien, `kind: "landscape-capability"`) — même forme que `levelUps[].capabilities`
   * pour réutiliser l'affichage existant (`getFlatCapabilities`), mais stockées **séparément**
   * de `levelUps[]` : ce choix n'est pas une montée de niveau et ne doit jamais compter dans
   * `1 + levelUps.length` (calcul du niveau du personnage).
   */
  classCapabilities?: { type: CapabilityType; params: Record<string, unknown> }[];
  /**
   * Saison d'affinité pour la magie des saisons (Story 23.9), clé du catalogue `season`.
   * Uniquement pertinent si `typeId === 'magie'`. Nommé `magicSeason` (pas `seasonAffinity`)
   * pour ne pas se confondre avec un mécanisme distinct de climat/paysage favori (ex.
   * Climatophile du Météomancien, Story 23.8, qui utilise `classCapabilities`/catalogue
   * `landscape` — aucun lien avec ce champ).
   */
  magicSeason?: string;
  /**
   * Sorts de magie rituelle connus à la création (Story 23.9) — exactement 2 clés du catalogue
   * `spell` avec `magicType: "rituelle"` et `tier: "debutant"`. Contrairement à la magie des
   * saisons (`magicSeason` seul, aucun sort stocké — le personnage les connaît automatiquement,
   * cf. docs/magie.md), la magie rituelle se transmet et se choisit explicitement.
   */
  knownRitualSpells?: string[];
}

export interface DerivedStats {
  PV: number; // VIG × 2
  PE: number; // ESP × 2
  Condition: number; // VIG + ESP
  Initiative: number; // AGI + INT
  Encombrement: number; // VIG + 3
}

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/**
 * Catalogue de contenu Ryuutama valide, dérivé du contenu seedé en base
 * (`GameSystemService.getContent`) — évite que `validate()` code en dur ses propres listes
 * déconnectées du contenu réellement seedé.
 */
export interface RyuutamaCatalog {
  validClasses: string[];
  validTypes: string[];
  /** Clés valides du catalogue `weaponItem` (Story 25.1) — remplace `validWeapons` (catégories). */
  validWeaponItems: string[];
  /** Clés valides du catalogue `weaponCategory` (Story 25.2), pour valider `customWeapon.categoryId`. */
  validWeaponCategories?: string[];
  /** Chaque pattern est un tableau de 4 valeurs déjà trié (ex. [4, 6, 6, 8] pour "Polyvalent"). */
  attributePatterns: number[][];
  /**
   * Projection minimale de `requiredChoices` par classe (Story 23.8) — `key` + `kind`
   * (pas `label`/`options`, pour garder `validate()` découplé de la forme complète du contenu
   * seedé). `kind` reste nécessaire (revue de code, 2026-07-26) : sans lui, `validate()` ne peut
   * pas distinguer un choix `landscape-capability` (répondu via `classCapabilities`) d'un choix
   * `eligible-talent`/`landscape-flavor`/`closed-list` (répondu via `classChoices`) — un
   * `classCapabilities` non vide validerait alors à tort N'IMPORTE quel choix manquant de la
   * classe, y compris ceux qui n'ont rien à voir avec lui (ex. l'Ermite, qui n'a aucun choix
   * `landscape-capability` mais deux autres choix que ce contournement laisserait passer).
   */
  requiredChoicesByClass?: Record<string, { key: string; kind: string }[]>;
  /** Clés valides du catalogue `season` (Story 23.9), pour valider `magicSeason`. */
  validSeasons?: string[];
  /**
   * Clés valides du catalogue `spell` filtrées sur `magicType: "rituelle"` et `tier: "debutant"`
   * (Story 23.9), pour valider `knownRitualSpells` — projection minimale (juste les clés), pas
   * le contenu complet des sorts.
   */
  validDebutantRitualSpells?: string[];
}
