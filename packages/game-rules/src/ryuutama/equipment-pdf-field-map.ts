import type { PdfFieldValue } from './pdf-field-map.ts';

/** Miroir local des données nécessaires au mapping PDF équipement — jamais un import direct de
 * `CharacterDto`/`RyuutamaSheetData` depuis `@master-jdr/shared` (frontière types-only, effacée
 * au runtime — importer une valeur depuis ce package casse la suite `api`, cf. Story 10.5). */
export interface EquipmentPdfInput {
  ownerPseudo: string;
  characterName: string;
  encombrementLimit: number;
  equipment: {
    individual: { name: string; weight: number }[];
    group: string[];
  };
}

/**
 * Ordre exact des 21 emplacements Objet/Prix/Enc du template (Bloc A : 5 lignes avec Effets ;
 * Bloc B : 16 emplacements sans Effets — nommage `_2`/`_3` non séquentiel selon la ligne, artefact
 * de l'outil source du PDF, vérifié via pdf-lib, cf. Story 11.1 Task 0). Liste énumérée plutôt que
 * dérivée par une formule, pour éviter toute reconstruction erronée du nommage irrégulier.
 */
const OBJECT_SLOTS: readonly [string, string, string][] = [
  ['ObjetRow1', 'PrixRow1', 'EncRow1'],
  ['ObjetRow2', 'PrixRow2', 'EncRow2'],
  ['ObjetRow3', 'PrixRow3', 'EncRow3'],
  ['ObjetRow4', 'PrixRow4', 'EncRow4'],
  ['ObjetRow5', 'PrixRow5', 'EncRow5'],
  ['ObjetRow1_2', 'PrixRow1_2', 'EncRow1_2'],
  ['ObjetRow1_3', 'PrixRow1_3', 'EncRow1_3'],
  ['ObjetRow2_2', 'PrixRow2_2', 'EncRow2_2'],
  ['ObjetRow2_3', 'PrixRow2_3', 'EncRow2_3'],
  ['ObjetRow3_2', 'PrixRow3_2', 'EncRow3_2'],
  ['ObjetRow3_3', 'PrixRow3_3', 'EncRow3_3'],
  ['ObjetRow4_2', 'PrixRow4_2', 'EncRow4_2'],
  ['ObjetRow4_3', 'PrixRow4_3', 'EncRow4_3'],
  ['ObjetRow5_2', 'PrixRow5_2', 'EncRow5_2'],
  ['ObjetRow5_3', 'PrixRow5_3', 'EncRow5_3'],
  ['ObjetRow6', 'PrixRow6', 'EncRow6'],
  ['ObjetRow6_2', 'PrixRow6_2', 'EncRow6_2'],
  ['ObjetRow7', 'PrixRow7', 'EncRow7'],
  ['ObjetRow7_2', 'PrixRow7_2', 'EncRow7_2'],
  ['ObjetRow8', 'PrixRow8', 'EncRow8'],
  ['ObjetRow8_2', 'PrixRow8_2', 'EncRow8_2'],
];

/** Champs "Effets" du Bloc A (5 premiers emplacements uniquement) — toujours vides (aucune donnée
 * d'effet dans le modèle), poussés pour rester cohérents avec le reste du template mais jamais
 * renseignés. */
const EFFETS_FIELDS = ['EffetsRow1', 'EffetsRow2', 'EffetsRow3', 'EffetsRow4', 'EffetsRow5'];

/**
 * Mappe l'équipement d'un personnage vers les champs AcroForm du template officiel
 * (`Ryuutama-fiche_equipement_edit.pdf`, 94 champs réels, tous `PDFTextField` — vérifiés via
 * pdf-lib, pas devinés, cf. Story 11.1 Task 0).
 *
 * `individual` (nom+poids connus) est listé en premier, puis `group` (nom seul, `Enc` toujours
 * vide — aucune donnée de poids pour l'équipement de groupe dans le modèle), dans l'ordre de leurs
 * tableaux respectifs. Le template n'a que 21 emplacements Objet/Prix/Enc au total (`OBJECT_SLOTS`)
 * — au-delà, les objets excédentaires sont omis sans erreur (limite physique du template, même
 * principe que `voyageurs_proteges_1/2`/`historique` sur la fiche Homme Dragon, Story 10.5).
 *
 * Champs du template volontairement non couverts (aucune donnée correspondante dans le modèle) :
 * `Prix*` (aucun prix), `Effets*` (aucun effet), `Po` (aucune monnaie), les blocs « Contenant »
 * (`ContenantRow*`) et « Animal » (`AnimalRow*`) — le template distingue des catégories
 * d'équipement (contenant, monture) que `RyuutamaSheetData.equipment` ne modélise pas (un seul
 * tableau `individual` + un tableau `group`, aucune sous-catégorie) ; ne jamais tenter de deviner
 * une catégorie à partir du nom de l'objet.
 *
 * `encombrement` = somme des poids de `individual` UNIQUEMENT (même calcul que
 * `InventoryTab.totalWeight()` côté web) — `group` n'a pas de poids dans le modèle, jamais compté.
 */
export function mapEquipmentToPdfFields(input: EquipmentPdfInput): PdfFieldValue[] {
  const totalWeight = input.equipment.individual.reduce((sum, item) => sum + item.weight, 0);

  const items: { name: string; weight?: number }[] = [
    ...input.equipment.individual.map((i) => ({ name: i.name, weight: i.weight })),
    ...input.equipment.group.map((name) => ({ name })),
  ];

  const fields: PdfFieldValue[] = [
    { field: 'joueur', value: input.ownerPseudo, kind: 'text' },
    { field: 'voyageur', value: input.characterName, kind: 'text' },
    { field: 'limite_enc', value: String(input.encombrementLimit), kind: 'text' },
    { field: 'encombrement', value: String(totalWeight), kind: 'text' },
  ];

  for (let i = 0; i < OBJECT_SLOTS.length; i++) {
    const [objetField, prixField, encField] = OBJECT_SLOTS[i];
    const item = items[i];
    fields.push(
      { field: objetField, value: item?.name ?? '', kind: 'text' },
      { field: prixField, value: '', kind: 'text' },
      { field: encField, value: item?.weight !== undefined ? String(item.weight) : '', kind: 'text' },
    );
  }

  for (const effetsField of EFFETS_FIELDS) {
    fields.push({ field: effetsField, value: '', kind: 'text' });
  }

  return fields;
}
