import type { RyuutamaSheetData, DerivedStats } from './types.ts';

/**
 * Options des dropdowns "Arme Fav" du PDF officiel — ne correspondent pas
 * littéralement aux labels du contenu seedé (accentuation/pluriel différents),
 * donc mappées explicitement plutôt que dérivées d'un label.
 */
const WEAPON_PDF_OPTION: Record<string, string> = {
  arc: 'Arc',
  'epee-courte': 'Epées courtes',
  'epee-longue': 'Epées longues',
  hache: 'Haches',
  lance: 'Lances',
};

/** Contenu résolu (labels/talents Ryuutama) à fournir par l'appelant — jamais chargé en interne, cf. principe des fonctions pures de ce package. */
export interface RyuutamaPdfContent {
  classLabel: string;
  classTalents: { name: string; effect: string }[];
  typeLabel: string;
  weaponLabel: string;
  weaponTouchFormula: string;
  weaponDamageFormula: string;
  /** Pseudo du propriétaire du personnage (joueur ou MJ) — remplit le champ "Joueur" (Story 4.6). */
  ownerPseudo: string;
}

/** Valeur d'un champ AcroForm : texte pour les champs texte, option exacte pour les dropdowns. */
export interface PdfFieldValue {
  field: string;
  value: string;
  kind: 'text' | 'dropdown';
}

/**
 * Mappe une fiche Ryuutama vers les champs AcroForm du fichier "edit"
 * (`Ryuutama_fiche_de_voyageur_big_edit.pdf`, 119 champs réels — vérifiés un par un
 * via pdf-lib, pas devinés).
 *
 * Champs du template volontairement non couverts (aucune donnée correspondante dans
 * `RyuutamaSheetData`/`DerivedStats` ce palier, ou hors scope) : PX, créé le,
 * Homme dragon, Classe 2 (+ Talent 4-6/Effet 4-6, second classe non supportée),
 * Paysage climat (+ les 22 champs de résistance par terrain), Maladresses, les 6
 * statuts (Blessé/Las/Empoisonné/Surexcité/Malade/Choc), Arme 2/3 (+ A2/A3 *),
 * Protection 1-3 (+ P1-3 *), Vêtement 1-6 (+ V1-6 effet-res). `Condition` (jauge
 * dérivée VIG+ESP) et `Encombrement` (limite d'encombrement) n'ont **aucun champ
 * correspondant** sur ce template officiel — vérifié exhaustivement sur les 119
 * champs, ce n'est pas un oubli. `specialtyTypeId` (sous-choix Artisan) et
 * `narrative.personality` n'ont pas non plus de champ dédié sur ce template
 * (les seuls champs narratifs disponibles sont Nom/Sexe/Âge/Couleur représentative/
 * Village natal) — non mappés pour la même raison, volontairement.
 */
export function mapToPdfFields(
  data: RyuutamaSheetData,
  derived: DerivedStats,
  content: RyuutamaPdfContent,
): PdfFieldValue[] {
  const narrative = data.narrative ?? {};
  const attributes = data.attributes ?? { AGI: 0, ESP: 0, INT: 0, VIG: 0 };
  const equipment = data.equipment ?? { individual: [], group: [] };
  const individualEquipment = equipment.individual ?? [];
  const groupEquipment = equipment.group ?? [];
  const homeAndMotivation = [narrative.homeTown, narrative.motivation]
    .filter((v): v is string => Boolean(v?.trim()))
    .join(' — ');

  return [
    { field: 'Nom', value: narrative.name ?? '', kind: 'text' },
    { field: 'Joueur', value: content.ownerPseudo, kind: 'text' },
    { field: 'Sexe', value: narrative.sex ?? '', kind: 'text' },
    { field: 'Âge', value: narrative.age ?? '', kind: 'text' },
    { field: 'Niveau', value: '1', kind: 'text' },
    { field: 'Type', value: content.typeLabel, kind: 'text' },
    {
      field: 'talent 1',
      value: content.classTalents[0]?.name ?? '',
      kind: 'text',
    },
    {
      field: 'Talent 2',
      value: content.classTalents[1]?.name ?? '',
      kind: 'text',
    },
    {
      field: 'Talent 3',
      value: content.classTalents[2]?.name ?? '',
      kind: 'text',
    },
    {
      field: 'Effet 1',
      value: content.classTalents[0]?.effect ?? '',
      kind: 'text',
    },
    {
      field: 'Effet 2',
      value: content.classTalents[1]?.effect ?? '',
      kind: 'text',
    },
    {
      field: 'Effet 3',
      value: content.classTalents[2]?.effect ?? '',
      kind: 'text',
    },
    { field: 'Objet fétiche', value: data.fetiqueObject ?? '', kind: 'text' },
    {
      field: 'Couleur représentative et autres signes particuliers',
      value: narrative.physicalTraits ?? '',
      kind: 'text',
    },
    {
      field: 'Village natal et raisons du départ',
      value: homeAndMotivation,
      kind: 'text',
    },
    { field: 'PV max', value: String(derived.PV), kind: 'text' },
    { field: 'PE max', value: String(derived.PE), kind: 'text' },
    { field: 'Initiative', value: String(derived.Initiative), kind: 'text' },
    { field: 'Arme 1', value: content.weaponLabel, kind: 'text' },
    { field: 'A1 prec', value: content.weaponTouchFormula, kind: 'text' },
    { field: 'A1 deg', value: content.weaponDamageFormula, kind: 'text' },
    {
      field: 'Notes',
      value: [...individualEquipment, ...groupEquipment].join(', '),
      kind: 'text',
    },
    { field: 'Classe 1', value: content.classLabel, kind: 'dropdown' },
    {
      field: 'Arme Fav',
      value: WEAPON_PDF_OPTION[data.weaponCategoryId] ?? '',
      kind: 'dropdown',
    },
    {
      field: 'AGI',
      value: String(attributes.AGI),
      kind: 'dropdown',
    },
    {
      field: 'ESP',
      value: String(attributes.ESP),
      kind: 'dropdown',
    },
    {
      field: 'INT',
      value: String(attributes.INT),
      kind: 'dropdown',
    },
    {
      field: 'VIG',
      value: String(attributes.VIG),
      kind: 'dropdown',
    },
  ];
}
