import { PrismaClient } from '@prisma/client';
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
interface RyuutamaSheetData {
  classId: string;
  specialtyTypeId?: string;
  typeId: string;
  attributes: RyuutamaAttributes;
  weaponCategoryId: string;
  // Modèle d'inventaire unifié (Story 14.1) — individual/contenants/animaux, plus de `group`.
  equipment?: { individual: InventoryItem[]; contenants: InventoryItem[]; animaux: Omit<InventoryItem, 'weight'>[] };
  narrative?: { name?: string };
}
function computeDerived(sheetData: RyuutamaSheetData) {
  const { AGI, ESP, INT, VIG } = sheetData.attributes;
  return {
    PV: VIG * 2,
    PE: ESP * 2,
    Condition: VIG + ESP,
    Initiative: AGI + INT,
    Encombrement: VIG + 3,
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
 * Couvre : 1 MJ + 3 joueurs, une Partie de chaque `PartieKind`, un personnage Ryuutama par joueur
 * et par Partie (dont un inventaire enrichi individual/contenants/animaux, Epic 14), des
 * scénarios à différents statuts (dont au moins un `PASSE` par Partie avec résumé de fin +
 * compte-rendu de séance), des entrées de journal (dont une associée manuellement et une éligible
 * à l'association automatique), une distribution d'XP avec une montée de niveau en attente
 * (Epic 6), une fiche Homme Dragon du MJ par Partie (Epic 10), des documents de scénario et de
 * bibliothèque de Partie (Story 7.2) et des annonces MJ à portée variable (Epic 9) — de quoi
 * explorer la quasi-totalité des fonctionnalités des Epics 6 à 10 sans ressaisie manuelle.
 */

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL manquant');
}

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

const DEMO_PASSWORD = '12345Demo';

const ATTRIBUTE_SETS: RyuutamaSheetData['attributes'][] = [
  { AGI: 6, ESP: 6, INT: 4, VIG: 8 },
  { AGI: 4, ESP: 8, INT: 6, VIG: 6 },
  { AGI: 8, ESP: 4, INT: 6, VIG: 6 },
];

function makeSheetData(
  name: string,
  classId: string,
  typeId: string,
  weaponCategoryId: string,
  attributeSet: number,
  specialtyTypeId?: string,
  equipment?: RyuutamaSheetData['equipment'],
): RyuutamaSheetData {
  return {
    classId,
    typeId,
    weaponCategoryId,
    attributes: ATTRIBUTE_SETS[attributeSet],
    equipment: equipment ?? { individual: [], contenants: [], animaux: [] },
    narrative: { name },
    ...(specialtyTypeId ? { specialtyTypeId } : {}),
  };
}

async function createUser(email: string, pseudo: string) {
  const passwordHash = await argon2.hash(DEMO_PASSWORD);
  return prisma.user.create({ data: { email, pseudo, passwordHash } });
}

async function createCharacter(
  userId: string,
  partieId: string,
  sheetData: RyuutamaSheetData,
  journalAutoAssociate = false,
) {
  const derived = computeDerived(sheetData);
  return prisma.character.create({
    data: {
      userId,
      partieId,
      gameSystemId: RYUUTAMA_ID,
      sheetData: sheetData as any,
      derived: derived as any,
      journalAutoAssociate,
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

  console.log('→ Création des comptes...');
  const mj = await createUser('mj-demo@example.com', 'mj');
  const alice = await createUser('alice@example.com', 'Alice');
  const bob = await createUser('bob@example.com', 'Bob');
  const chloe = await createUser('chloe@example.com', 'Chloe');

  // ─── Partie 1 : ONE_SHOT, déjà jouée (PASSE) ──────────────────────────────
  console.log('→ Partie ONE_SHOT...');
  const oneShot = await prisma.partie.create({
    data: {
      name: "Le Naufrage de l'Aurore",
      kind: 'ONE_SHOT',
      gameSystemId: RYUUTAMA_ID,
      description: 'Un one-shot maritime : un navire échoué, des secrets à la dérive.',
      mjId: mj.id,
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
    makeSheetData('Fenn', 'chasseur', 'attaque', 'arc', 0, undefined, {
      individual: [
        { id: randomUUID(), name: 'Corde (10m)', weight: 1, price: '5 po', addedBy: 'player' },
        { id: randomUUID(), name: 'Torche', weight: 0.5, price: '2 po', addedBy: 'player' },
      ],
      contenants: [
        { id: randomUUID(), name: 'Sac à dos', weight: 1, price: '10 po', addedBy: 'player' },
      ],
      animaux: [{ id: randomUUID(), name: 'Faucon messager', addedBy: 'player' }],
    }),
  );
  const roland = await createCharacter(
    bob.id,
    oneShot.id,
    makeSheetData('Roland', 'guerisseur', 'technique', 'epee-courte', 1),
    true, // journalAutoAssociate — pour démontrer l'association automatique
  );

  const oneShotPoll = await prisma.sessionPoll.create({
    data: {
      partieId: oneShot.id,
      createdById: mj.id,
      status: 'CLOSED',
      chosenDate: new Date('2026-06-14T14:00:00.000Z'),
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
      closedAt: new Date('2026-06-14T19:00:00.000Z'),
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
        text: "Roland a soigné les rescapés cachés par Ossian, in extremis.",
        shared: true,
        createdAt: new Date('2026-06-14T18:00:00.000Z'), // dans la fenêtre → association auto (journalAutoAssociate=true)
      },
    ],
  });

  // XP distribuée après la clôture du scénario (Story 6.2) — Roland est en attente de montée
  // de niveau (100 xp = seuil du niveau 2) pour explorer l'écran de montée de niveau (Story 6.3).
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
  await prisma.character.update({ where: { id: fenn.id }, data: { xp: 60 } });
  await prisma.character.update({ where: { id: roland.id }, data: { xp: 100 } });

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
        vocation: 'Guider les naufragés vers la bonne route.',
        demeure: "Les criques de l'Aurore",
      } as any,
    },
  });

  // Document de scénario (Story 7.2) — visible une fois le scénario COURANT/PASSE (anti-spoil).
  const oneShotDocFilename = await writeDocumentFile(
    Buffer.from(
      "Journal de bord de l'Aurore (transcription) : \"...le chargement d'assurance " +
        "doit disparaître avant l'inspection du port...\" — signé Ossian.",
      'utf-8',
    ),
    'text/plain',
  );
  await prisma.scenarioDocument.create({
    data: {
      partieId: oneShot.id,
      scenarioId: oneShotScenario.id,
      filename: oneShotDocFilename,
      originalName: 'journal-de-bord-aurore.txt',
      sizeBytes: Buffer.byteLength(
        "Journal de bord de l'Aurore (transcription) : \"...le chargement d'assurance " +
          "doit disparaître avant l'inspection du port...\" — signé Ossian.",
        'utf-8',
      ),
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
    ],
  });
  const liora = await createCharacter(
    alice.id,
    lineaire.id,
    makeSheetData('Liora', 'marchand', 'magie', 'epee-longue', 2),
  );
  const garrick = await createCharacter(
    bob.id,
    lineaire.id,
    makeSheetData('Garrick', 'noble', 'attaque', 'epee-longue', 0),
  );
  await createCharacter(
    chloe.id,
    lineaire.id,
    makeSheetData('Mira', 'menestrel', 'technique', 'arc', 1),
  );

  const chap1Poll = await prisma.sessionPoll.create({
    data: {
      partieId: lineaire.id,
      createdById: mj.id,
      status: 'CLOSED',
      chosenDate: new Date('2026-05-10T14:00:00.000Z'),
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
      closedAt: new Date('2026-05-10T18:00:00.000Z'),
      resumeFin:
        "Liora a négocié la libération des marchands capturés en échange d'une carte des " +
        'routes secrètes — un choix qui pèsera sur la suite de la campagne.',
    },
  });
  await prisma.seance.create({
    data: {
      scenarioId: chap1.id,
      pollId: chap1Poll.id,
      compteRendu: 'Bonne mise en place de la campagne, les joueurs ont accroché sur le mystère.',
    },
  });

  const chap2Poll = await prisma.sessionPoll.create({
    data: {
      partieId: lineaire.id,
      createdById: mj.id,
      status: 'OPEN',
      expiresAt: new Date('2026-08-01T00:00:00.000Z'),
    },
  });
  await prisma.pollOption.createMany({
    data: [
      { pollId: chap2Poll.id, date: new Date('2026-07-20T14:00:00.000Z'), slot: 'AFTERNOON' },
      { pollId: chap2Poll.id, date: new Date('2026-07-21T14:00:00.000Z'), slot: 'AFTERNOON' },
    ],
  });
  const chap2 = await prisma.scenario.create({
    data: {
      partieId: lineaire.id,
      title: 'Chapitre 2 : Le Sceau Brisé',
      description: 'Le sceau protégeant la ville de Verchamp a été brisé pendant la nuit.',
      status: 'COURANT',
      dureeHeures: 3,
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
      { characterId: liora.id, text: "Le marchand qu'on a relâché savait déjà nos noms...", shared: false },
      { characterId: garrick.id, text: 'La carte trouvée mène plus loin au nord que prévu.', shared: true },
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
        artefact: { key: 'anneau', nom: "Anneau des routes liées" },
        nom: 'Kaien',
        apparence: 'Un anneau de brume bleutée qui suit la caravane à distance.',
        vocation: 'Tisser des liens entre les voyageurs du Nord.',
      } as any,
    },
  });

  // Document de bibliothèque de Partie (Story 7.2) — scenarioId null = toujours visible.
  const lineaireLibDocFilename = await writeDocumentFile(
    Buffer.from(
      'Carte des routes marchandes du Nord — repères, relais et distances entre villes.',
      'utf-8',
    ),
    'text/plain',
  );
  await prisma.scenarioDocument.create({
    data: {
      partieId: lineaire.id,
      scenarioId: null,
      filename: lineaireLibDocFilename,
      originalName: 'carte-routes-du-nord.txt',
      sizeBytes: Buffer.byteLength(
        'Carte des routes marchandes du Nord — repères, relais et distances entre villes.',
        'utf-8',
      ),
    },
  });

  // Annonces MJ à portée variable (Epic 9) : une pour toute la Partie, une pour le scénario courant.
  await prisma.announcement.createMany({
    data: [
      {
        partieId: lineaire.id,
        text: 'Prochaine séance décalée d\'une semaine, merci de répondre au sondage en cours.',
      },
      {
        partieId: lineaire.id,
        scenarioId: chap2.id,
        text: 'Pensez à préparer vos fiches : le Chapitre 2 démarre par une scène de combat.',
      },
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
    ],
  });
  const yuna = await createCharacter(
    alice.id,
    episodique.id,
    makeSheetData('Yuna', 'chasseur', 'attaque', 'arc', 1),
  );
  await createCharacter(
    bob.id,
    episodique.id,
    makeSheetData('Theo', 'artisan', 'technique', 'epee-courte', 2, 'Forgeron'),
  );
  const sable = await createCharacter(
    chloe.id,
    episodique.id,
    makeSheetData('Sable', 'guerisseur', 'magie', 'arc', 0),
  );

  const bijou = await prisma.scenario.create({
    data: {
      partieId: episodique.id,
      title: "L'Affaire du Bijou Volé",
      description: 'Un bijou de famille disparaît la veille des noces du gouverneur.',
      status: 'PASSE',
      dureeHeures: 3,
      closedAt: new Date('2026-06-01T18:00:00.000Z'),
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
      dateValidee: new Date('2026-06-01T14:00:00.000Z'),
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
      { characterId: sable.id, text: 'Sable garde le silence sur ce que la servante lui a confié.', shared: false },
    ],
  });

  const auberge = await prisma.scenario.create({
    data: {
      partieId: episodique.id,
      title: "Le Mystère de l'Auberge",
      description: "Des voyageurs disparaissent près d'une auberge isolée.",
      status: 'A_VENIR',
    },
  });
  await prisma.scenarioParticipant.create({ data: { scenarioId: auberge.id, userId: bob.id } });
  await prisma.seance.create({
    data: { scenarioId: auberge.id, inscriptionMin: 2, inscriptionMax: 5 },
  });

  await prisma.scenario.create({
    data: { partieId: episodique.id, title: 'Le Secret du Phare', status: 'BROUILLON' },
  });

  console.log('✓ Données de démo créées.');
  console.log(`  Comptes (mot de passe commun) : ${DEMO_PASSWORD}`);
  console.log('    - mj-demo@example.com   (MJ des 3 parties)');
  console.log('    - alice@example.com');
  console.log('    - bob@example.com');
  console.log('    - chloe@example.com');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
