import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';
import { randomUUID } from 'node:crypto';
import { RYUUTAMA_ID } from '../src/game-systems/supported-game-systems';
import { writeDocumentFile } from '../src/scenarios/document-storage.util';
import type { HommeDragonRace } from '@master-jdr/game-rules';

// `@master-jdr/game-rules` est un package ESM — `ts-node` (CJS, ce script) ne peut pas le
// `require()` (cf. package.json `"type": "module"` du package). Les stats dérivées sont donc
// recalculées ici avec la même formule que `computeDerived()` (packages/game-rules), plutôt que
// de modifier la configuration ESM/CJS du monorepo pour un script de seed de dev.
//
// ⚠️ Cette copie avait divergé : elle ignorait `levelUps` (allocations PV/PE et encombrement),
// donc tout personnage monté de niveau se retrouvait avec des dérivées fausses. Elle est
// réalignée sur `packages/game-rules/src/ryuutama/compute-derived.ts` — à resynchroniser si la
// formule bouge là-bas.
interface RyuutamaAttributes {
  AGI: number;
  ESP: number;
  INT: number;
  VIG: number;
}
interface InventoryItem {
  id: string;
  name: string;
  weight: number;
  price?: string;
  effect?: string;
  addedBy: 'player' | 'mj';
}
interface LevelUpEntry {
  level: number;
  pvAllocated: number;
  peAllocated: number;
  capabilities: { type: string; params: Record<string, unknown> }[];
}
interface RyuutamaSheetData {
  classId: string;
  specialtyTypeId?: string;
  typeId: string;
  attributes: RyuutamaAttributes;
  weaponId: string;
  // Modèle d'inventaire unifié (Story 14.1) — individual/contenants/animaux, plus de `group`.
  equipment?: {
    individual: InventoryItem[];
    contenants: InventoryItem[];
    animaux: Omit<InventoryItem, 'weight'>[];
  };
  narrative?: { name?: string; motivation?: string; personality?: string };
  levelUps?: LevelUpEntry[];
}
function computeDerived(sheetData: RyuutamaSheetData) {
  const { AGI, ESP, INT, VIG } = sheetData.attributes;
  const levelUps = sheetData.levelUps ?? [];
  const pvAllocated = levelUps.reduce((sum, entry) => sum + entry.pvAllocated, 0);
  const peAllocated = levelUps.reduce((sum, entry) => sum + entry.peAllocated, 0);
  return {
    PV: VIG * 2 + pvAllocated,
    PE: ESP * 2 + peAllocated,
    Condition: VIG + ESP,
    Initiative: AGI + INT,
    Encombrement: VIG + 3 + levelUps.length,
  };
}

/**
 * Seed de données de démo pour le développement local — PAS destiné à la production (aucun appel
 * depuis `prisma.config.ts` `migrations.seed`, contrairement à `seed.ts` qui reste le seul seed
 * automatique). Usage : `docker compose exec api pnpm seed:demo`, typiquement après un
 * `prisma migrate reset` (base vide). Non idempotent — si les comptes de démo existent déjà,
 * le script s'arrête sans rien modifier (cf. `main()`), pour éviter des doublons/erreurs de
 * contrainte unique sur une base partiellement peuplée.
 *
 * ─── Toutes les dates sont RELATIVES au moment de l'exécution ───
 * Aucune date en dur : `NOW` est capturé au démarrage et tout se positionne par décalage en jours
 * (`at()`/`day()`). Un scénario `PASSE` est donc toujours dans le passé, un vote `OPEN` a toujours
 * des options futures, un lien expiré est toujours expiré — quelle que soit la date à laquelle on
 * rejoue ce seed. C'est ce qui manquait : les dates figées de mi-2026 rendaient le vote « ouvert »
 * expiré et ses options révolues, donc l'écran de vote intestable.
 *
 * ─── Ce que couvre le jeu de données ───
 * 7 comptes aux préférences volontairement toutes différentes (thème, tris, modes d'affichage,
 * masquage des parties terminées) pour qu'aucun réglage ne reste à sa valeur par défaut. Quatre
 * Parties : une ONE_SHOT clôturée, une CAMPAGNE_LINEAIRE en cours, une CAMPAGNE_EPISODIQUE, et une
 * jamais commencée (MJ : Diane, compte mixte MJ + joueuse).
 *
 * Chaque feature a de la donnée à afficher : disponibilités récurrentes/ponctuelles + une archivée,
 * couches de calendrier personnalisées (et un compte qui n'y a jamais touché), deux votes de date
 * ouverts en parallèle **avec des bulletins** (réponses partielles, un membre qui n'a pas voté),
 * scénarios aux quatre statuts, séances avec infos pratiques (heure/lieu/note), inscriptions,
 * journal de personnage (associations manuelle et automatique), distributions d'XP, un personnage
 * monté de niveau avec ses instantanés et un autre en attente de montée, fiches Homme Dragon,
 * documents de scénario et de bibliothèque, annonces MJ avec accusés de lecture, rôles de groupe,
 * favoris, invitations nominatives et liens d'invitation dans leurs quatre états.
 *
 * ─── Cas limites délibérés ───
 * · une séance A_VENIR dont `inscriptionMax` est atteint (fermée) et une autre avec de la place ;
 * · un membre d'une Partie sans aucun personnage (état de départ réel) ;
 * · un compte `mustResetPassword` (parcours de réinitialisation imposée) ;
 * · un lien d'invitation valide, un à usage unique déjà consommé, un expiré, un ciblé par e-mail.
 *
 * Écart connu, non comblé ici : le contenu Ryuutama enrichi des Epics 23-26 (profils d'attributs,
 * armes libres, sorts rituels, équipement de départ) n'a pas de scénario de seed dédié — les
 * fiches restent sur la forme minimale classe/type/attributs/arme.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL manquant');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEMO_PASSWORD = '12345Demo';

// ─────────────────────────────────────────────────────────────────────────────
// Horloge relative
// ─────────────────────────────────────────────────────────────────────────────

/** Capturé une seule fois : toutes les dates du seed sont cohérentes entre elles. */
const NOW = new Date();

/** Jour J+`dayOffset` à `hour`:00:00 UTC. Négatif = passé. */
function at(dayOffset: number, hour = 14): Date {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() + dayOffset);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

/** Jour J+`dayOffset` à minuit UTC — pour les dates à granularité jour (options de vote, dispos). */
function day(dayOffset: number): Date {
  return at(dayOffset, 0);
}

// ─────────────────────────────────────────────────────────────────────────────

const ATTRIBUTE_SETS: RyuutamaSheetData['attributes'][] = [
  { AGI: 6, ESP: 6, INT: 4, VIG: 8 },
  { AGI: 4, ESP: 8, INT: 6, VIG: 6 },
  { AGI: 8, ESP: 4, INT: 6, VIG: 6 },
];

function makeSheetData(
  name: string,
  classId: string,
  typeId: string,
  weaponId: string,
  attributeSet: number,
  specialtyTypeId?: string,
  equipment?: RyuutamaSheetData['equipment'],
  levelUps?: LevelUpEntry[],
): RyuutamaSheetData {
  return {
    classId,
    typeId,
    weaponId,
    attributes: ATTRIBUTE_SETS[attributeSet],
    equipment: equipment ?? { individual: [], contenants: [], animaux: [] },
    narrative: { name },
    ...(specialtyTypeId ? { specialtyTypeId } : {}),
    ...(levelUps ? { levelUps } : {}),
  };
}

/** Préférences d'affichage — variées d'un compte à l'autre pour ne laisser aucun défaut inexploré. */
interface UserPrefs {
  theme?: string | null;
  partiesSort?: string;
  hideFinishedParties?: boolean;
  partiesViewMode?: string;
  charactersViewMode?: string;
  charactersSort?: string;
  mustResetPassword?: boolean;
  calendarLayersSetAt?: Date | null;
}

async function createUser(email: string, pseudo: string, prefs: UserPrefs = {}) {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  return prisma.user.create({
    data: { email, pseudo, passwordHash, displayName: pseudo, ...prefs },
  });
}

async function createCharacter(
  userId: string,
  partieId: string,
  sheetData: RyuutamaSheetData,
  journalAutoAssociate = false,
  xp = 0,
) {
  const derived = computeDerived(sheetData);
  return prisma.character.create({
    data: {
      userId,
      partieId,
      gameSystemId: RYUUTAMA_ID,
      sheetData: sheetData as unknown as Prisma.InputJsonValue,
      derived,
      journalAutoAssociate,
      xp,
    },
  });
}

async function main() {
  const existing = await prisma.user.findUnique({
    where: { email: 'mj-demo@example.com' },
  });
  if (existing) {
    console.log(
      '✗ Données de démo déjà présentes (mj-demo@example.com existe) — rien à faire. Pour repartir de zéro : prisma migrate reset puis pnpm seed:demo.',
    );
    return;
  }

  // ─── Comptes ────────────────────────────────────────────────────────────────
  // Chaque compte porte une combinaison de préférences différente : aucun réglage ne reste à sa
  // valeur par défaut sur l'ensemble du jeu de données, et Chloe garde `theme: null` (jamais
  // choisi) pour exercer l'adoption du thème local au premier réglage (AD-13).
  console.log('→ Création des comptes...');
  const mj = await createUser('mj-demo@example.com', 'mj', {
    theme: 'grimoire-emeraude',
    partiesSort: 'urgence',
    partiesViewMode: 'large',
    charactersSort: 'partie',
  });
  const alice = await createUser('alice@example.com', 'Alice', {
    theme: 'foret-ancienne',
    partiesSort: 'nom',
    hideFinishedParties: true, // masque la ONE_SHOT clôturée dans sa liste
    partiesViewMode: 'large',
    charactersViewMode: 'large',
    charactersSort: 'niveau',
    calendarLayersSetAt: at(-5, 9),
  });
  const bob = await createUser('bob@example.com', 'Bob', {
    theme: 'medieval-steampunk',
    partiesSort: 'date',
    partiesViewMode: 'compact',
    charactersViewMode: 'compact',
    charactersSort: 'nom',
    calendarLayersSetAt: at(-2, 18),
  });
  const chloe = await createUser('chloe@example.com', 'Chloe', {
    theme: null, // jamais choisi — le thème local sera adopté une fois (AD-13)
    partiesSort: 'statut',
    charactersViewMode: 'medium',
    // calendarLayersSetAt volontairement null : le jeu de couches par défaut s'applique (AD-16)
  });
  // Compte mixte MJ + joueur : MJ des « Veilleurs du Pont » et joueuse de l'épisodique.
  const diane = await createUser('diane@example.com', 'Diane', {
    theme: 'grimoire-emeraude',
    partiesSort: 'type',
    partiesViewMode: 'medium',
    charactersViewMode: 'large',
    charactersSort: 'nom',
    calendarLayersSetAt: at(-9, 11),
  });
  // Cas limite : réinitialisation de mot de passe imposée (Story 28.6). Se connecter avec ce
  // compte doit forcer le parcours de reset — l'e-mail est capté par Mailpit (http://localhost:8025).
  const erwan = await createUser('erwan@example.com', 'Erwan', {
    theme: 'foret-ancienne',
    mustResetPassword: true,
  });
  // Cas limite : membre d'une Partie SANS aucun personnage — état de départ réel qu'aucun compte
  // n'exerçait, la vue « Mes personnages » et l'invitation à créer une fiche restaient intestables.
  const faustine = await createUser('faustine@example.com', 'Faustine', {
    theme: 'medieval-steampunk',
    partiesSort: 'urgence',
  });

  // ─── Couches de calendrier (AD-16) ──────────────────────────────────────────
  // Alice et Bob ont réglé des sous-ensembles distincts ; Diane a tout activé ; Chloe n'y a
  // jamais touché (aucune ligne + calendarLayersSetAt null) → jeu par défaut appliqué.
  console.log('→ Couches de calendrier...');
  await prisma.userCalendarLayer.createMany({
    data: [
      { userId: alice.id, layerKey: 'mes-indisponibilites' },
      { userId: alice.id, layerKey: 'mes-seances' },
      { userId: alice.id, layerKey: 'votes-en-cours' },
      { userId: bob.id, layerKey: 'mes-seances' },
      { userId: bob.id, layerKey: 'disponibilite-groupe' },
      { userId: diane.id, layerKey: 'mes-indisponibilites' },
      { userId: diane.id, layerKey: 'mes-disponibilites' },
      { userId: diane.id, layerKey: 'mes-seances' },
      { userId: diane.id, layerKey: 'votes-en-cours' },
      { userId: diane.id, layerKey: 'inscriptions-ouvertes' },
      { userId: diane.id, layerKey: 'disponibilite-groupe' },
    ],
  });

  // ─── Disponibilités / indisponibilités (Epic 1) ──────────────────────────────
  // Absentes du seed jusqu'ici : tout le calendrier s'affichait vide. Les récurrentes portent un
  // `dayOfWeek` (0=dim…6=sam) et pas de dates ; les ponctuelles l'inverse. La dernière est déjà
  // expirée (`expiresAt` dans le passé) pour peupler la vue « archivées ».
  console.log('→ Disponibilités...');
  await prisma.availabilityDeclaration.createMany({
    data: [
      {
        userId: alice.id,
        kind: 'UNAVAILABLE',
        recurKind: 'RECURRING',
        dayOfWeek: 1, // lundi soir : cours de musique
        slot: 'EVENING',
        expiresAt: at(90),
      },
      {
        userId: alice.id,
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        slot: 'FULL_DAY',
        startDate: day(20), // vacances
        endDate: day(27),
        expiresAt: at(28),
      },
      {
        userId: bob.id,
        kind: 'AVAILABLE',
        recurKind: 'RECURRING',
        dayOfWeek: 6, // toujours dispo le samedi
        slot: 'FULL_DAY',
        expiresAt: at(90),
      },
      {
        userId: chloe.id,
        kind: 'UNAVAILABLE',
        recurKind: 'RECURRING',
        dayOfWeek: 3, // mercredi après-midi
        slot: 'AFTERNOON',
        expiresAt: at(90),
      },
      {
        // Recoupe volontairement les options du vote ouvert ci-dessous → la couche
        // « disponibilité-groupe » a enfin quelque chose à croiser.
        userId: diane.id,
        kind: 'AVAILABLE',
        recurKind: 'PUNCTUAL',
        slot: 'AFTERNOON',
        startDate: day(3),
        endDate: day(5),
        expiresAt: at(6),
      },
      {
        // Déjà expirée → archivée. Sans elle, l'état « archivé » restait invisible.
        userId: bob.id,
        kind: 'UNAVAILABLE',
        recurKind: 'PUNCTUAL',
        slot: 'FULL_DAY',
        startDate: day(-20),
        endDate: day(-15),
        expiresAt: at(-14),
      },
    ],
  });

  // ─── Partie 1 : ONE_SHOT, déjà jouée (PASSE) — clôturée par le MJ (Story 29.6) ────
  console.log('→ Partie ONE_SHOT...');
  const oneShot = await prisma.partie.create({
    data: {
      name: "Le Naufrage de l'Aurore",
      kind: 'ONE_SHOT',
      gameSystemId: RYUUTAMA_ID,
      description: 'Un one-shot maritime : un navire échoué, des secrets à la dérive.',
      mjId: mj.id,
      // Story 29.6 (AD-8) : one-shot rejouée et bouclée, le MJ l'a explicitement déclarée
      // terminée — status: 'TERMINEE' dans PartieDto, seule Partie du seed dans cet état.
      // C'est aussi celle que masque `hideFinishedParties: true` chez Alice.
      closedAt: at(-70, 20),
    },
  });
  await prisma.membership.createMany({
    data: [
      { userId: alice.id, partieId: oneShot.id },
      { userId: bob.id, partieId: oneShot.id },
    ],
  });
  const fenn = await createCharacter(
    alice.id,
    oneShot.id,
    makeSheetData('Fenn', 'chasseur', 'attaque', 'arc-de-chasse', 0, undefined, {
      individual: [
        { id: randomUUID(), name: 'Corde (10m)', weight: 1, price: '5 po', addedBy: 'player' },
        { id: randomUUID(), name: 'Torche', weight: 0.5, price: '2 po', addedBy: 'player' },
      ],
      contenants: [
        { id: randomUUID(), name: 'Sac à dos', weight: 1, price: '10 po', addedBy: 'player' },
      ],
      animaux: [{ id: randomUUID(), name: 'Faucon messager', addedBy: 'player' }],
    }),
    false,
    60,
  );
  // Roland est à 100 xp SANS `levelUps` → une montée de niveau en attente, pour explorer
  // l'écran de choix de montée (Story 6.3).
  const roland = await createCharacter(
    bob.id,
    oneShot.id,
    makeSheetData('Roland', 'guerisseur', 'technique', 'dague', 1),
    true, // journalAutoAssociate — pour démontrer l'association automatique
    100,
  );

  const oneShotPoll = await prisma.sessionPoll.create({
    data: {
      partieId: oneShot.id,
      createdById: mj.id,
      status: 'CLOSED',
      chosenDate: at(-70),
      chosenSlot: 'AFTERNOON',
    },
  });
  const oneShotScenario = await prisma.scenario.create({
    data: {
      partieId: oneShot.id,
      title: "Le Naufrage de l'Aurore",
      description: "L'équipage de l'Aurore a disparu. Ses cales regorgent d'indices.",
      status: 'PASSE',
      dureeHeures: 4,
      dureeSeances: 1,
      closedAt: at(-70, 19),
      resumeFin:
        'Fenn et Roland ont découvert que le naufrage était un coup monté par le marchand ' +
        'Ossian pour toucher une assurance. Roland a soigné les rescapés cachés dans la cale ' +
        "avant qu'Ossian ne les fasse taire — moment fort de la séance.",
    },
  });
  await prisma.seance.create({
    data: {
      scenarioId: oneShotScenario.id,
      pollId: oneShotPoll.id,
      // Infos pratiques (jusqu'ici jamais peuplées par le seed).
      heureRdv: '14:00',
      lieu: 'Chez le MJ',
      notePratique: 'Prévoir de quoi grignoter, la séance est longue.',
      compteRendu:
        "Belle séance, l'énigme du journal de bord codé a bien fonctionné. À refaire : plus " +
        'de temps pour la scène finale de confrontation avec Ossian.',
    },
  });
  await prisma.characterNote.createMany({
    data: [
      {
        characterId: fenn.id,
        text: "Note privée de Fenn : se méfier d'Ossian dès la prochaine fois.",
        shared: false,
      },
      {
        characterId: fenn.id,
        text: "Fenn a retrouvé la trace du journal de bord dans la cale inondée — moment marquant de l'enquête.",
        shared: true,
        scenarioId: oneShotScenario.id, // association manuelle
      },
      {
        characterId: roland.id,
        text: 'Roland a soigné les rescapés cachés par Ossian, in extremis.',
        shared: true,
        createdAt: at(-70, 18), // dans la fenêtre → association auto (journalAutoAssociate=true)
      },
    ],
  });

  // XP distribuée après la clôture du scénario (Story 6.2).
  const oneShotXp = await prisma.xpDistribution.create({
    data: {
      partieId: oneShot.id,
      mjId: mj.id,
      note: "Naufrage de l'Aurore : enquête bouclée, bonus pour la scène de confrontation.",
    },
  });
  await prisma.xpDistributionEntry.createMany({
    data: [
      { distributionId: oneShotXp.id, characterId: fenn.id, amount: 60 },
      { distributionId: oneShotXp.id, characterId: roland.id, amount: 80 },
      { distributionId: oneShotXp.id, characterId: roland.id, amount: 20, isBonus: true },
    ],
  });

  // Fiche Homme Dragon du MJ (Epic 10) — un artefact par race, associé à la Partie.
  await prisma.hommeDragon.create({
    data: {
      userId: mj.id,
      partieId: oneShot.id,
      gameSystemId: RYUUTAMA_ID,
      sheetData: {
        race: 'DRAGON_VERT' satisfies HommeDragonRace,
        artefact: { key: 'lanterne', nom: 'Lanterne des embruns' },
        nom: 'Suisen',
        apparence: 'Une brume verdâtre en forme de lanterne suspendue.',
        caractere: 'Patient, mais implacable avec les naufrageurs.',
        vocation: 'Guider les naufragés vers la bonne route.',
        demeure: "Les criques de l'Aurore",
        mondesProteges: 'Les côtes du Sud et leurs récifs.',
      },
    },
  });

  // Document de scénario (Story 7.2) — visible une fois le scénario COURANT/PASSE (anti-spoil).
  const oneShotDocText =
    "Journal de bord de l'Aurore (transcription) : \"...le chargement d'assurance " +
    'doit disparaître avant l\'inspection du port..." — signé Ossian.';
  const oneShotDocFilename = await writeDocumentFile(
    Buffer.from(oneShotDocText, 'utf-8'),
    'text/plain',
  );
  await prisma.scenarioDocument.create({
    data: {
      partieId: oneShot.id,
      scenarioId: oneShotScenario.id,
      filename: oneShotDocFilename,
      originalName: 'journal-de-bord-aurore.txt',
      sizeBytes: Buffer.byteLength(oneShotDocText, 'utf-8'),
    },
  });

  // ─── Partie 2 : CAMPAGNE_LINEAIRE, en cours ───────────────────────────────
  console.log('→ Partie CAMPAGNE_LINEAIRE...');
  const lineaire = await prisma.partie.create({
    data: {
      name: 'La Route des Lanternes',
      kind: 'CAMPAGNE_LINEAIRE',
      gameSystemId: RYUUTAMA_ID,
      description: 'Une campagne itinérante sur les routes marchandes du Nord.',
      mjId: mj.id,
    },
  });
  await prisma.membership.createMany({
    data: [
      { userId: alice.id, partieId: lineaire.id },
      { userId: bob.id, partieId: lineaire.id },
      { userId: chloe.id, partieId: lineaire.id },
      // Cas limite : membre sans personnage. Faustine rejoint la campagne mais n'a pas encore
      // créé sa fiche — la vue « Mes personnages » vide et l'invitation à créer sont testables.
      { userId: faustine.id, partieId: lineaire.id },
    ],
  });
  // Liora a DÉJÀ appliqué sa montée au niveau 2 (`levelUps` renseigné) : 2 PV + 1 PE alloués et
  // un attribut amélioré. Ses dérivées en tiennent compte via `computeDerived` — contrepoint à
  // Roland, resté en attente.
  const liora = await createCharacter(
    alice.id,
    lineaire.id,
    makeSheetData('Liora', 'marchand', 'magie', 'epee-large', 2, undefined, undefined, [
      {
        level: 2,
        pvAllocated: 2,
        peAllocated: 1,
        capabilities: [{ type: 'attribute', params: { attribute: 'INT' } }],
      },
    ]),
    false,
    150,
  );
  const garrick = await createCharacter(
    bob.id,
    lineaire.id,
    makeSheetData('Garrick', 'noble', 'attaque', 'epee-large', 0),
    false,
    80,
  );
  await createCharacter(
    chloe.id,
    lineaire.id,
    makeSheetData('Mira', 'menestrel', 'technique', 'arc-de-chasse', 1),
    false,
    80,
  );

  // Instantanés de Liora (Epic 6) : jamais peuplés jusqu'ici. La sémantique reproduit celle de
  // `CharacterService` — la fiche stockée est l'état APRÈS le changement, et
  // `level = 1 + levelUps.length`.
  const lioraSheet = makeSheetData(
    'Liora',
    'marchand',
    'magie',
    'epee-large',
    2,
    undefined,
    undefined,
    [
      {
        level: 2,
        pvAllocated: 2,
        peAllocated: 1,
        capabilities: [{ type: 'attribute', params: { attribute: 'INT' } }],
      },
    ],
  );
  await prisma.characterSnapshot.createMany({
    data: [
      {
        characterId: liora.id,
        sheetData: lioraSheet as unknown as Prisma.InputJsonValue,
        derived: computeDerived(lioraSheet) as unknown as Prisma.InputJsonValue,
        level: 2,
        trigger: 'LEVEL_UP',
        createdAt: at(-40, 21),
      },
      {
        characterId: liora.id,
        sheetData: lioraSheet as unknown as Prisma.InputJsonValue,
        derived: computeDerived(lioraSheet) as unknown as Prisma.InputJsonValue,
        level: 2,
        trigger: 'MJ_EDIT',
        note: "Correction d'une faute de frappe sur le nom de la ville d'origine.",
        createdAt: at(-38, 10),
      },
    ],
  });

  const chap1Poll = await prisma.sessionPoll.create({
    data: {
      partieId: lineaire.id,
      createdById: mj.id,
      status: 'CLOSED',
      chosenDate: at(-45),
      chosenSlot: 'AFTERNOON',
    },
  });
  const chap1 = await prisma.scenario.create({
    data: {
      partieId: lineaire.id,
      title: 'Chapitre 1 : Les Ombres du Marché',
      description: 'Une caravane marchande disparaît sans laisser de trace.',
      status: 'PASSE',
      dureeHeures: 3,
      dureeSeances: 1,
      closedAt: at(-45, 18),
      resumeFin:
        "Liora a négocié la libération des marchands capturés en échange d'une carte des " +
        'routes secrètes — un choix qui pèsera sur la suite de la campagne.',
    },
  });
  await prisma.seance.create({
    data: {
      scenarioId: chap1.id,
      pollId: chap1Poll.id,
      heureRdv: '14:00',
      lieu: 'Chez Alice',
      compteRendu: 'Bonne mise en place de la campagne, les joueurs ont accroché sur le mystère.',
    },
  });

  // ─── Vote de date OUVERT, avec de vrais bulletins ──────────────────────────
  // Le cœur de ce qui manquait : trois options FUTURES, une expiration future, et des `PollVote`.
  // Alice et Bob ont voté ; Chloe et Faustine pas encore → 2 répondants sur 4 membres, et J+4 se
  // dégage comme consensus (deux OUI) tandis que J+5 est écarté (deux NON).
  const chap2Poll = await prisma.sessionPoll.create({
    data: {
      partieId: lineaire.id,
      createdById: mj.id,
      status: 'OPEN',
      expiresAt: at(7, 23),
    },
  });
  const chap2Options = await Promise.all(
    [3, 4, 5].map((offset) =>
      prisma.pollOption.create({
        data: { pollId: chap2Poll.id, date: day(offset), slot: 'AFTERNOON' },
      }),
    ),
  );
  await prisma.pollVote.createMany({
    data: [
      { pollId: chap2Poll.id, optionId: chap2Options[0].id, userId: alice.id, answer: 'YES' },
      { pollId: chap2Poll.id, optionId: chap2Options[1].id, userId: alice.id, answer: 'YES' },
      { pollId: chap2Poll.id, optionId: chap2Options[2].id, userId: alice.id, answer: 'NO' },
      { pollId: chap2Poll.id, optionId: chap2Options[0].id, userId: bob.id, answer: 'MAYBE' },
      { pollId: chap2Poll.id, optionId: chap2Options[1].id, userId: bob.id, answer: 'YES' },
      { pollId: chap2Poll.id, optionId: chap2Options[2].id, userId: bob.id, answer: 'NO' },
      // Chloe ne vote pas : réponse partielle du groupe, cas le plus fréquent en vrai.
    ],
  });
  const chap2 = await prisma.scenario.create({
    data: {
      partieId: lineaire.id,
      title: 'Chapitre 2 : Le Sceau Brisé',
      description: 'Le sceau protégeant la ville de Verchamp a été brisé pendant la nuit.',
      status: 'COURANT',
      dureeHeures: 3,
      dureeSeances: 2,
    },
  });
  await prisma.seance.create({ data: { scenarioId: chap2.id, pollId: chap2Poll.id } });

  await prisma.scenario.create({
    data: {
      partieId: lineaire.id,
      title: "Chapitre 3 : L'Appel du Nord",
      status: 'BROUILLON',
    },
  });
  await prisma.characterNote.createMany({
    data: [
      {
        characterId: liora.id,
        text: "Le marchand qu'on a relâché savait déjà nos noms...",
        shared: false,
      },
      {
        characterId: garrick.id,
        text: 'La carte trouvée mène plus loin au nord que prévu.',
        shared: true,
      },
    ],
  });

  // Fiche Homme Dragon du MJ (Epic 10) pour cette Partie — race différente pour varier le catalogue.
  await prisma.hommeDragon.create({
    data: {
      userId: mj.id,
      partieId: lineaire.id,
      gameSystemId: RYUUTAMA_ID,
      sheetData: {
        race: 'DRAGON_BLEU' satisfies HommeDragonRace,
        artefact: { key: 'anneau', nom: 'Anneau des routes liées' },
        nom: 'Kaien',
        apparence: 'Un anneau de brume bleutée qui suit la caravane à distance.',
        vocation: 'Tisser des liens entre les voyageurs du Nord.',
      },
    },
  });

  // Document de bibliothèque de Partie (Story 7.2) — scenarioId null = toujours visible.
  const lineaireLibDocText =
    'Carte des routes marchandes du Nord — repères, relais et distances entre villes.';
  const lineaireLibDocFilename = await writeDocumentFile(
    Buffer.from(lineaireLibDocText, 'utf-8'),
    'text/plain',
  );
  await prisma.scenarioDocument.create({
    data: {
      partieId: lineaire.id,
      scenarioId: null,
      filename: lineaireLibDocFilename,
      originalName: 'carte-routes-du-nord.txt',
      sizeBytes: Buffer.byteLength(lineaireLibDocText, 'utf-8'),
    },
  });

  // Annonces MJ à portée variable (Epic 9) : une pour toute la Partie, une pour le scénario courant.
  const annoncePartie = await prisma.announcement.create({
    data: {
      partieId: lineaire.id,
      text: "Prochaine séance décalée d'une semaine, merci de répondre au sondage en cours.",
      createdAt: at(-3, 9),
    },
  });
  await prisma.announcement.create({
    data: {
      partieId: lineaire.id,
      scenarioId: chap2.id,
      text: 'Pensez à préparer vos fiches : le Chapitre 2 démarre par une scène de combat.',
      createdAt: at(-1, 20),
    },
  });
  // Accusés de lecture (jamais peuplés) : Alice a lu l'annonce de Partie, Bob et Chloe non →
  // le badge « non lu » est enfin observable dans les deux états selon le compte connecté.
  await prisma.announcementRead.create({
    data: { userId: alice.id, announcementId: annoncePartie.id, readAt: at(-2, 8) },
  });

  // Favoris (jamais peuplés) — Alice et Bob épinglent des Parties différentes.
  await prisma.partieFavorite.createMany({
    data: [
      { userId: alice.id, partieId: lineaire.id },
      { userId: bob.id, partieId: lineaire.id },
    ],
  });

  // ─── Partie 3 : CAMPAGNE_EPISODIQUE, mixte ────────────────────────────────
  console.log('→ Partie CAMPAGNE_EPISODIQUE...');
  const episodique = await prisma.partie.create({
    data: {
      name: 'Chroniques de la Guilde',
      kind: 'CAMPAGNE_EPISODIQUE',
      gameSystemId: RYUUTAMA_ID,
      description: "Chaque enquête est indépendante, résolue par qui s'y inscrit.",
      mjId: mj.id,
    },
  });
  await prisma.membership.createMany({
    data: [
      { userId: alice.id, partieId: episodique.id },
      { userId: bob.id, partieId: episodique.id },
      { userId: chloe.id, partieId: episodique.id },
      // Diane : joueuse ici, MJ de sa propre Partie plus bas — compte mixte.
      { userId: diane.id, partieId: episodique.id },
    ],
  });
  const yuna = await createCharacter(
    alice.id,
    episodique.id,
    makeSheetData('Yuna', 'chasseur', 'attaque', 'arc-de-chasse', 1),
    false,
    40,
  );
  const theo = await createCharacter(
    bob.id,
    episodique.id,
    makeSheetData('Theo', 'artisan', 'technique', 'dague', 2, 'Forgeron'),
    false,
    40,
  );
  const sable = await createCharacter(
    chloe.id,
    episodique.id,
    makeSheetData('Sable', 'guerisseur', 'magie', 'arc-de-chasse', 0),
    false,
    95, // juste sous le seuil de 100 : contrepoint à Roland, aucune montée en attente
  );
  const orla = await createCharacter(
    diane.id,
    episodique.id,
    makeSheetData('Orla', 'chasseur', 'attaque', 'arc-de-chasse', 1),
    false,
    40,
  );

  // Rôles de groupe (Epic 27) — les 4 rôles de contenu couverts.
  await prisma.characterGroupRole.createMany({
    data: [
      { characterId: yuna.id, partieId: episodique.id, roleKey: 'chef' },
      { characterId: theo.id, partieId: episodique.id, roleKey: 'intendant' },
      { characterId: sable.id, partieId: episodique.id, roleKey: 'chroniqueur' },
      { characterId: orla.id, partieId: episodique.id, roleKey: 'cartographe' },
    ],
  });

  const bijou = await prisma.scenario.create({
    data: {
      partieId: episodique.id,
      title: "L'Affaire du Bijou Volé",
      description: 'Un bijou de famille disparaît la veille des noces du gouverneur.',
      status: 'PASSE',
      dureeHeures: 3,
      dureeSeances: 1,
      closedAt: at(-30, 18),
      resumeFin:
        'Yuna et Sable ont démasqué la servante infidèle — mais ont choisi de la couvrir en ' +
        'échange de son témoignage sur un trafic plus vaste. Ce choix reviendra les hanter.',
    },
  });
  await prisma.scenarioParticipant.createMany({
    data: [
      { scenarioId: bijou.id, userId: alice.id },
      { scenarioId: bijou.id, userId: chloe.id },
    ],
  });
  const bijouSeance = await prisma.seance.create({
    data: {
      scenarioId: bijou.id,
      inscriptionMin: 2,
      inscriptionMax: 4,
      dateValidee: at(-30),
      heureRdv: '14:30',
      lieu: 'Taverne du Griffon',
      compteRendu: 'Enquête bouclée en une séance, bon rythme, twist final apprécié.',
    },
  });
  await prisma.inscription.createMany({
    data: [
      { seanceId: bijouSeance.id, userId: alice.id },
      { seanceId: bijouSeance.id, userId: chloe.id },
    ],
  });
  await prisma.characterNote.createMany({
    data: [
      {
        characterId: yuna.id,
        text: 'Yuna a repéré les traces de pas menant aux quartiers des domestiques.',
        shared: true,
        scenarioId: bijou.id,
      },
      {
        characterId: sable.id,
        text: 'Sable garde le silence sur ce que la servante lui a confié.',
        shared: false,
      },
    ],
  });

  // ─── Cas limite : séance A_VENIR COMPLÈTE (inscriptionMax atteint) ─────────
  // 3 inscrits pour un maximum de 3 → le bouton d'inscription doit être fermé aux autres.
  const auberge = await prisma.scenario.create({
    data: {
      partieId: episodique.id,
      title: "Le Mystère de l'Auberge",
      description: "Des voyageurs disparaissent près d'une auberge isolée.",
      status: 'A_VENIR',
      dureeHeures: 3,
    },
  });
  await prisma.scenarioParticipant.createMany({
    data: [
      { scenarioId: auberge.id, userId: alice.id },
      { scenarioId: auberge.id, userId: bob.id },
      { scenarioId: auberge.id, userId: chloe.id },
    ],
  });
  const aubergeSeance = await prisma.seance.create({
    data: {
      scenarioId: auberge.id,
      inscriptionMin: 2,
      inscriptionMax: 3,
      dateValidee: at(10),
      heureRdv: '20:30',
      lieu: 'Chez Bob',
      notePratique: 'Code de la porte : 1234B. Sonner deux fois.',
    },
  });
  await prisma.inscription.createMany({
    data: [
      { seanceId: aubergeSeance.id, userId: alice.id },
      { seanceId: aubergeSeance.id, userId: bob.id },
      { seanceId: aubergeSeance.id, userId: chloe.id },
    ],
  });

  // ─── Cas limite : séance A_VENIR avec de la PLACE ──────────────────────────
  // 1 inscrit pour un maximum de 5 → le bouton d'inscription reste ouvert. Diane et les autres
  // peuvent s'inscrire depuis l'interface.
  const phare = await prisma.scenario.create({
    data: {
      partieId: episodique.id,
      title: 'Le Secret du Phare',
      description: 'Le gardien du phare de Roche-Pâle ne répond plus depuis trois nuits.',
      status: 'A_VENIR',
      dureeHeures: 4,
    },
  });
  const phareSeance = await prisma.seance.create({
    data: {
      scenarioId: phare.id,
      inscriptionMin: 2,
      inscriptionMax: 5,
      dateValidee: at(12),
      heureRdv: '20:00',
      lieu: 'En visio',
    },
  });
  await prisma.inscription.create({
    data: { seanceId: phareSeance.id, userId: diane.id },
  });

  // Second vote OUVERT, en parallèle de celui de la campagne linéaire — exerce le message agrégé
  // « N votes de date en cours » (comportement couvert par les specs front, sans donnée jusqu'ici).
  const guildePoll = await prisma.sessionPoll.create({
    data: {
      partieId: episodique.id,
      createdById: mj.id,
      status: 'OPEN',
      expiresAt: at(9, 23),
    },
  });
  const guildeOptions = await Promise.all(
    [8, 9].map((offset) =>
      prisma.pollOption.create({
        data: { pollId: guildePoll.id, date: day(offset), slot: 'EVENING' },
      }),
    ),
  );
  await prisma.pollVote.createMany({
    data: [
      { pollId: guildePoll.id, optionId: guildeOptions[0].id, userId: alice.id, answer: 'YES' },
      { pollId: guildePoll.id, optionId: guildeOptions[1].id, userId: alice.id, answer: 'NO' },
      { pollId: guildePoll.id, optionId: guildeOptions[0].id, userId: diane.id, answer: 'YES' },
      { pollId: guildePoll.id, optionId: guildeOptions[1].id, userId: diane.id, answer: 'YES' },
    ],
  });

  await prisma.scenario.create({
    data: { partieId: episodique.id, title: 'La Dette du Passeur', status: 'BROUILLON' },
  });

  // ─── Partie 4 : CAMPAGNE_LINEAIRE MJ'd par Diane, jamais commencée ────────
  // Aucun scénario volontairement : status: 'A_VENIR' (« pas encore commencée », AD-8) —
  // troisième valeur de PartieStatus, absente du reste du seed sans cet ajout.
  console.log('→ Partie CAMPAGNE_LINEAIRE (MJ : Diane)...');
  const dianeCampagne = await prisma.partie.create({
    data: {
      name: 'Les Veilleurs du Pont',
      kind: 'CAMPAGNE_LINEAIRE',
      gameSystemId: RYUUTAMA_ID,
      description: 'Une garnison isolée surveille un pont que plus personne ne devrait franchir.',
      mjId: diane.id,
    },
  });
  await prisma.membership.create({ data: { userId: alice.id, partieId: dianeCampagne.id } });

  // ─── Invitations nominatives (Epic 5) ───────────────────────────────────────
  console.log('→ Invitations et liens...');
  await prisma.invitation.createMany({
    data: [
      {
        // En attente : Erwan doit voir cette invitation et pouvoir l'accepter ou la refuser.
        partieId: dianeCampagne.id,
        inviterId: diane.id,
        inviteeUserId: erwan.id,
        status: 'PENDING',
        createdAt: at(-2, 15),
      },
      {
        // Déjà refusée → exerce l'affichage côté MJ d'une invitation déclinée.
        partieId: oneShot.id,
        inviterId: mj.id,
        inviteeUserId: faustine.id,
        status: 'DECLINED',
        createdAt: at(-75, 10),
        respondedAt: at(-74, 9),
      },
    ],
  });

  // ─── Liens d'invitation : les quatre états (Story 5.2) ──────────────────────
  // Couvre tous les chemins de la page de jonction : lien valide, quota épuisé, expiré, ciblé.
  const validToken = randomUUID();
  const consumedToken = randomUUID();
  const expiredToken = randomUUID();
  const targetedToken = randomUUID();
  await prisma.inviteLink.createMany({
    data: [
      {
        // Valide, partageable, sans limite d'usage.
        token: validToken,
        partieId: dianeCampagne.id,
        createdById: diane.id,
        maxUses: null,
        expiresAt: at(7, 23),
      },
      {
        // Usage unique DÉJÀ consommé → doit être refusé avec le bon message.
        token: consumedToken,
        partieId: episodique.id,
        createdById: mj.id,
        maxUses: 1,
        usesCount: 1,
        expiresAt: at(7, 23),
      },
      {
        // Expiré.
        token: expiredToken,
        partieId: lineaire.id,
        createdById: mj.id,
        maxUses: 5,
        expiresAt: at(-2, 23),
      },
      {
        // Ciblé par e-mail (généré via l'invitation par e-mail) — pas un lien ouvert.
        token: targetedToken,
        partieId: lineaire.id,
        createdById: mj.id,
        maxUses: 1,
        expiresAt: at(5, 23),
        targetEmail: 'nouveau-venu@example.com',
      },
    ],
  });

  console.log('✓ Données de démo créées.');
  console.log(`\n  Comptes (mot de passe commun) : ${DEMO_PASSWORD}`);
  console.log('    - mj-demo@example.com   MJ des 3 premières Parties');
  console.log('    - alice@example.com     masque les Parties terminées · a des favoris');
  console.log('    - bob@example.com       a une indisponibilité archivée');
  console.log("    - chloe@example.com     thème jamais choisi · n'a pas voté au sondage ouvert");
  console.log('    - diane@example.com     MJ des « Veilleurs du Pont » ET joueuse ailleurs');
  console.log('    - erwan@example.com     ⚠ mustResetPassword · invitation en attente');
  console.log('    - faustine@example.com  membre sans personnage · invitation refusée');
  console.log("\n  Liens d'invitation (http://localhost:4200/join/<token>) :");
  console.log(`    valide    ${validToken}`);
  console.log(`    consommé  ${consumedToken}`);
  console.log(`    expiré    ${expiredToken}`);
  console.log(`    ciblé     ${targetedToken}  (nouveau-venu@example.com)`);
  console.log(`\n  Toutes les dates sont relatives au ${NOW.toISOString()}.`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
