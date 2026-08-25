# Réconciliation — UX Palier 3 vs PRD (prd-jdr-master-20260707) et spines hérités

## Verdict

Cohérent avec le PRD sur tous les FR sauf un point déjà signalé en tête d'`EXPERIENCE.md` : **FR-11 (Notes personnelles) est amendé**, pas juste implémenté — le PRD prévoyait une note unique en texte libre visible MJ, l'UX Discovery a fait émerger un besoin réel (retrouver la chronologie des notes sur plusieurs sessions, partager sélectivement) qui change la forme de la donnée (liste d'entrées datées avec partage par entrée, plutôt qu'un seul champ texte). Pas une dérive silencieuse : le changement est documenté, motivé, et le PRD reste la source de vérité tant qu'il n'est pas mis à jour en retour.

## Points vérifiés sans écart

- FR-1 à FR-4 (distribution d'XP) : couverts par `XpDistributionPanel`, calcul assisté, bonus individuel, note — tous repris fidèlement, y compris le "hors scope" (pas de verrouillage à une séance formelle, le MJ décoche simplement les joueurs à exclure).
- FR-5 à FR-8 (montée de niveau) : `LevelUpBanner` + `LevelUpWizard` couvrent la détection à la volée, le traitement séquentiel multi-niveaux, la répartition PV/PE à somme fixe, le choix de capacité avec plafond à 12.
- FR-9/FR-10 (inventaire chiffré) : `EncumbranceBar` + `InventoryItemRow` couvrent le poids par objet comparé à la limite dérivée.
- FR-14 (édition MJ) : `FieldEditPencil` couvre l'édition champ-par-champ avec traçabilité (instantané "modifié par le MJ"), la note explicite que l'édition du champ XP redéclenche le flux guidé (cohérent avec le fix apporté au PRD lors de sa propre finalisation), et le principe "avertissement jamais bloquant" en mode MJ.
- Historique (§4.5 PRD) : la section Historique de la fiche (lecture seule, déclenchée par montée de niveau et édition MJ) n'a pas eu besoin d'un composant dédié nouveau au-delà de `NotesJournal`/liste chronologique déjà présente pour un besoin voisin — pas de contradiction, juste pas de composant supplémentaire nécessaire pour ce delta.

## Écart signalé

- **FR-11** : cf. Verdict. Amendement documenté en tête d'`EXPERIENCE.md`, à reporter au PRD (`prd-jdr-master-20260707/prd.md`) — édition suggérée : FR-11 devient "journal chronologique d'entrées datées, partage par entrée avec le groupe en plus de la visibilité MJ".

## Cohérence avec les spines hérités (`ux-jdr-master-20260703`, `ux-jdr-master-20260626`)

- Aucun token de couleur/typo/spacing/radius/élévation dupliqué — tous les nouveaux composants de `DESIGN.md` référencent les tokens existants par nom.
- `RosterRail`/`RosterStrip` remplacent l'ancien onglet "Personnages" (`ux-jdr-master-20260703` §2 IA) — changement structurel assumé et documenté, pas un ajout qui laisse un doublon incohérent. L'ancien mock `key-personnages-tab.html` reste valide comme référence historique (grille de `CharacterSummaryCard`), mais n'est plus le point d'entrée dans la troupe.
- Le principe hérité "mobile-first joueur / desktop-first MJ" (`ux-jdr-master-20260626` §1) est repris et étendu (IA différenciée par rôle, pas seulement densité) — extension cohérente avec l'esprit du principe original, pas une réinterprétation contradictoire.
